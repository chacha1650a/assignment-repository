# 증거 — 무엇이 어디에 있나

| 파일 | 무엇 | 어떻게 만들었나 |
| --- | --- | --- |
| [`자동 검증 기록.md`](자동%20검증%20기록.md) | **로컬** 임시 서버 대상, 확인 28가지의 요청·응답 전문 | `cd passkey-backend && npm run evidence` — 매번 새 임시 DB로 뜨는 서버라 반복 실행이 자유롭습니다 |
| [`배포 서버 검증 기록.md`](배포%20서버%20검증%20기록.md) | **실제 Render 배포본**(`daehoon-passkey-backend.onrender.com`) 대상, 같은 시나리오 27가지의 요청·응답 전문 | `node test-virtual-authenticator.js --base https://daehoon-passkey-backend.onrender.com --rp-id chacha1650a.github.io --origin https://chacha1650a.github.io` — 배포한 진짜 서버가 응답한 것입니다. (DB 파일에 직접 접근해야 하는 "패스키 0개 계정 재등록" 한 항목만 원격에서는 재현 불가 — 왼쪽 로컬 기록의 같은 항목으로 대신합니다) |
| [`실기기 검증 기록.md`](실기기%20검증%20기록.md) | 실제 브라우저·실제 기기에서 지문·PIN 으로 확인한 기록과 화면 사진 | 배포 뒤 직접 눌러 가며 채웁니다 |

## 왜 두 개인가

**자동 기록**은 실제 패스키로는 만들 수 없습니다.
패스키는 사람이 지문이나 PIN 을 눌러야 만들어져서, "이미 쓴 질문은 정말 막히나"를 수십 번 자동으로 돌려 볼 수 없기 때문입니다.
그래서 기기가 하는 일(P-256 열쇠 한 쌍 만들기, `authenticatorData` 조립, CBOR 인코딩, 서명)을 표준 그대로 흉내 내는
[`passkey-backend/virtual-authenticator.js`](../../passkey-backend/virtual-authenticator.js) 를 따로 두고 그것으로 돌렸습니다.
**서버는 이 파일의 존재를 모릅니다.** 진짜 브라우저가 보내는 것과 똑같은 모양의 요청만 받습니다.

**실기기 기록**은 그 반대로, 자동 기록이 보일 수 없는 것 — "진짜 패스키 창이 뜨고 지문으로 통과했다",
"이 패스키가 구글 비밀번호 관리자에 저장됐다" — 을 화면 사진으로 남깁니다.

## 가린 것

- 세션 토큰: 앞 8글자만 남기고 `…(생략)`
- 긴 base64 값(공개키·서명·attestationObject): 앞부분만
- 서버 비밀키(`SESSION_SECRET`): 환경변수에만 두고 기록에 넣지 않음
- **개인키: 애초에 요청에 실리지 않으므로 가릴 것이 없습니다**
