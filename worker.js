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
아래 세 가지를 구분해서 한국어로 정리해 줘.

1. summary: 인쇄된 교과서 본문의 핵심 내용 요약 (3~6개 항목)
2. notes: 학생이 손으로 쓴 필기 내용 (그대로 옮기되 알아보기 쉽게 정리)
3. highlights: 밑줄이나 형광펜으로 표시된 문장/단어

해당하는 내용이 없으면 빈 배열로 둬.
반드시 아래 JSON 형식으로만 답해.
{"summary": ["..."], "notes": ["..."], "highlights": ["..."]}
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
      return new Response("사진을 POST로 보내 주세요.", { status: 405, headers: corsHeaders });
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
