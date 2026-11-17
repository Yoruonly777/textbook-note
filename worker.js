// =============================================
// worker.js : 중간 서버 (Cloudflare Workers에 올림)
// 하는 일: 웹 화면에서 사진을 받아 Gemini에 보내고, 정리 결과를 돌려준다.
// API 키는 코드에 없고, Cloudflare 설정(GEMINI_API_KEY)에 숨겨져 있다.
// =============================================

// 이 주소에서 온 요청만 받는다 (다른 사이트가 우리 서버를 몰래 쓰는 것 방지)
const ALLOWED_ORIGIN = "https://yoruonly777.github.io";

// 사용할 Gemini 모델 목록 (앞에서부터 시도)
// 첫 모델이 바쁘거나(503) 사용량이 몰리면(429) 잠깐 쉬었다 다시 시도하고,
// 그래도 안 되면 다음 모델로 넘어간다.
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"];
const TRIES_PER_MODEL = 2;

// 다시 시도해 볼 만한 오류인지 (바쁨, 사용량 초과, 서버 오류, 모델 없음)
const RETRYABLE = [404, 429, 500, 502, 503, 504];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  async fetch(request, env, ctx) {
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

    // 1) 웹 화면이 보낸 사진 받기 { image: "base64 문자열", mimeType: "image/jpeg" }
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "사진 데이터를 읽지 못했어요" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) 응답을 "흘려보내는(stream)" 통로를 먼저 열어 두기
    //    AI가 오래 생각하면 Cloudflare가 약 100초 뒤 연결을 끊는다(오류 524).
    //    그래서 바로 응답을 시작하고, 기다리는 동안 5초마다 공백 한 칸을 보내
    //    "아직 작업 중"이라고 알린다. (JSON 앞의 공백은 읽을 때 무시된다)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const keepAlive = setInterval(() => writer.write(encoder.encode(" ")).catch(() => {}), 5000);

    const work = (async () => {
      let result = "";
      try {
        // 3) Gemini에 사진 + 부탁 보내기 (바쁘면 재시도, 그래도 안 되면 다음 모델)
        const requestBody = JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: body.mimeType, data: body.image } },
                { text: PROMPT },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        });

        let lastError = "Gemini 오류";
        let busy = true; // 바빠서 실패한 건지, 다른 이유(키 오류 등)인지
        outer: for (const model of MODELS) {
          for (let attempt = 1; attempt <= TRIES_PER_MODEL; attempt++) {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": env.GEMINI_API_KEY, // 숨겨둔 키를 여기서만 사용
                },
                body: requestBody,
              }
            );
            const data = await geminiRes.json().catch(() => ({}));

            if (geminiRes.ok) {
              // 4) Gemini 답에서 글자 부분만 꺼내기 (생각 과정 부분은 제외)
              const parts = data.candidates?.[0]?.content?.parts || [];
              result = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("") || "{}";
              break outer;
            }

            lastError = data.error?.message || `Gemini 오류 (${geminiRes.status})`;
            if (!RETRYABLE.includes(geminiRes.status)) { busy = false; break outer; } // 키 오류 등은 재시도해도 소용없음
            if (geminiRes.status === 404) break;                     // 모델 이름이 없으면 바로 다음 모델로
            if (attempt < TRIES_PER_MODEL) await sleep(2000 * attempt);
          }
        }
        if (!result) {
          result = JSON.stringify({
            error: busy ? "지금 AI 서버가 바빠요. 1~2분 뒤 다시 찍어 주세요." : lastError,
          });
        }
      } catch (err) {
        result = JSON.stringify({ error: err.message });
      }
      clearInterval(keepAlive);
      await writer.write(encoder.encode(result));
      await writer.close();
    })();

    // 응답이 끝날 때까지 작업이 중간에 멈추지 않게 한다
    ctx.waitUntil(work);

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  },
};
