// =============================================
// worker.js : 중간 서버 (Cloudflare Workers에 올림)
// 하는 일: 웹 화면에서 사진을 받아 Gemini에 보내고, 정리 결과를 돌려준다.
// API 키는 코드에 없고, Cloudflare 설정(GEMINI_API_KEY)에 숨겨져 있다.
// =============================================

// 이 주소에서 온 요청만 받는다 (다른 사이트가 우리 서버를 몰래 쓰는 것 방지)
const ALLOWED_ORIGIN = "https://yoruonly777.github.io";

// 사용할 Gemini 모델 ("최신 Flash 모델"을 자동으로 가리키는 이름)
const MODEL = "gemini-flash-latest";

// Gemini에게 하는 부탁 (프롬프트) — 결과가 마음에 안 들면 여기를 고치면 된다
const PROMPT = `
너는 고등학생의 교과서 정리를 돕는 도우미야.
이 사진은 학생이 수업 중 필기한 교과서 페이지야.
아래 네 가지를 구분해서 한국어로 정리해 줘.

1. summary: 인쇄된 교과서 본문의 핵심 내용 요약 (3~6개 항목, 문자열 배열)

2. notes: 학생이 손으로 쓴 필기 (객체 배열). 이 부분이 가장 중요하니 꼼꼼하게 해.
   - 아주 짧은 메모, 화살표(→), 동그라미, 별표(★), 물음표, 숫자 표시까지 빠짐없이 찾아.
   - 알아보기 어려운 글자는 문맥으로 추측하고 끝에 (?)를 붙여.
   - 각 필기마다 아래 네 가지를 채워.
     text: 손으로 쓴 내용을 그대로 옮긴 것 (기호 포함)
     type: "설명", "예시", "암기", "시험 강조", "질문", "기타" 중 하나
     context: 이 필기가 교과서의 어떤 내용 옆에, 또는 어떤 내용에 대해 쓰였는지 (짧게)
     explain: 이 필기가 무슨 뜻인지 학생이 복습할 때 이해하기 쉽게 풀어 쓴 보충 설명 (1~2문장)

3. highlights: 밑줄이나 형광펜으로 표시된 문장/단어 (문자열 배열)

4. figures: 교과서에 실린 그림·도표·그래프를 단순한 모식도로 다시 그린 것 (객체 배열)
   - 사진처럼 따라 그리지 말고, 핵심 구조와 관계만 보이게 단순하게 그려.
   - 각 그림마다 아래 세 가지를 채워.
     title: 그림 제목 (짧게)
     caption: 이 그림이 보여주는 핵심 내용 (1~2문장)
     svg: 모식도를 그린 SVG 코드 한 덩어리
   - SVG 규칙: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">로 시작,
     흰 배경, 글자는 한국어로 font-size 14 이상, 선과 도형은 단순하게, 색은 3~4가지만,
     화살표가 필요하면 <marker>로 그려. <script>나 외부 이미지는 절대 쓰지 마.
   - 그림이 없으면 빈 배열로 둬.

해당하는 내용이 없는 항목은 빈 배열로 둬.
반드시 아래 JSON 형식으로만 답해.
{
  "summary": ["..."],
  "notes": [{"text": "...", "type": "...", "context": "...", "explain": "..."}],
  "highlights": ["..."],
  "figures": [{"title": "...", "caption": "...", "svg": "<svg ...>...</svg>"}]
}
`;

export default {
  async fetch(request, env) {
    // 브라우저 보안 규칙(CORS)에 필요한 정보
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 브라우저가 요청 전에 "보내도 돼?" 하고 묻는 사전 확인에 답하기
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("서버가 정상 작동 중입니다. (사진은 웹 화면에서 보내 주세요)", {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      // 1) 웹 화면이 보낸 사진 받기 { image: "base64 문자열", mimeType: "image/jpeg" }
      const { image, mimeType } = await request.json();

      // 2) Gemini에 사진 + 부탁 보내기
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY, // 숨겨둔 키를 여기서만 사용
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: mimeType, data: image } },
                  { text: PROMPT },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Gemini 오류" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3) Gemini 답에서 글자 부분만 꺼내 웹 화면으로 돌려주기
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      return new Response(text, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
