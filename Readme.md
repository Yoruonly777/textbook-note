# 찍정 – 찍으면 정리되는 교과서

교과서 사진을 찍으면 AI가 **핵심 요약 / 내 필기 / 밑줄·형광펜 / 그림 모식도**로 정리해 주는 웹 서비스입니다.

- 사이트: https://yoruonly777.github.io/textbook-note/

## 구조

| 파일 | 역할 | 실행 위치 |
|---|---|---|
| `index.html` | 학생이 보는 화면 (HTML, CSS, JavaScript) | GitHub Pages |
| `worker.js` | API 키를 숨기고 Gemini API에 사진을 전달하는 중간 서버 | Cloudflare Workers |

컴퓨터에서 `node`로 실행할 파일은 없습니다.
`worker.js`를 고치면 Cloudflare 대시보드의 `Edit code`에 붙여넣고 `Deploy`해야 반영됩니다.

## 실행 방법

### 사용하기
1. 스마트폰 브라우저로 https://yoruonly777.github.io/textbook-note/ 에 접속합니다.
2. `사진 찍기`를 눌러 교과서 페이지를 촬영합니다.
3. 10~30초 뒤 `요약 / 필기 / 강조 / 그림` 탭에서 정리 결과를 확인합니다.

### 직접 배포하기
1. [Google AI Studio](https://aistudio.google.com)에서 Gemini API 키를 발급합니다.
2. Cloudflare 대시보드에서 Worker를 만들고 `worker.js` 내용을 붙여넣은 뒤 `Deploy`합니다.
3. Worker의 `Settings → Variables and Secrets`에 `GEMINI_API_KEY`를 **Secret**으로 등록합니다.
4. `index.html`의 `SERVER_URL`을 내 Worker 주소로, `worker.js`의 `ALLOWED_ORIGIN`을 내 GitHub Pages 주소로 바꿉니다.
5. 저장소 `Settings → Pages`에서 `main` 브랜치 `/ (root)`로 배포합니다.

## 사용 기술

- HTML, CSS, JavaScript
- Gemini API (이미지 분석·정리)
- Cloudflare Workers (API 키 보호용 서버)
- GitHub Pages (배포)
