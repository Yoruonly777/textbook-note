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

## 사용 기술

- HTML, CSS, JavaScript
- Gemini API (이미지 분석·정리)
- Cloudflare Workers (API 키 보호용 서버)
- GitHub Pages (배포)
