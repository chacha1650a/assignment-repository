# passkey-backend — 8번째 과제(패스키 등록)의 인증 서버

비밀번호를 아예 쓰지 않고, **패스키(WebAuthn)** 로만 잠그는 서버입니다.
화면은 [`8번째 과제(패스키 등록)/`](../8번째%20과제(패스키%20등록)/) 에 있습니다.

| 무엇 | 무엇으로 |
| --- | --- |
| 웹 서버 | express 4 |
| 패스키 검증 | **@simplewebauthn/server 14** |
| 저장소 | `node:sqlite` (Node 22.13+ 내장) |
| 세션 | 직접 구현 — `randomBytes(32)` 토큰 + `HMAC-SHA256` 으로 해시해 저장 |

## 왜 과제 폴더 안에 없나요

Render 는 배포 설정(Root Directory)에 넣을 수 있는 문자를 `^[A-Za-z0-9-_./]*$` 로 제한해서
`8번째 과제(패스키 등록)/backend` 처럼 한글·괄호가 들어간 경로를 받지 못합니다.
그래서 영문 이름의 폴더로 저장소 루트에 따로 뒀습니다. 6·7번 과제 때와 같은 이유입니다.

**7번 과제의 백엔드(`mochi-diary-auth-backend/`)는 한 줄도 고치지 않았습니다.** 7번 제출물이 지금도 그대로 열려야 하기 때문입니다.

## 실행

```bash
cd passkey-backend
npm install
SESSION_SECRET=아무거나-긴-랜덤값 RP_ID=localhost EXPECTED_ORIGINS=http://localhost:5500 npm start
```

화면은 따로 띄웁니다(패스키는 `file://` 에서 동작하지 않습니다).

```bash
npx http-server "8번째 과제(패스키 등록)" -p 5500 -c-1
```

## 환경변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `SESSION_SECRET` | (없음) | 세션 토큰을 DB에 원문으로 두지 않기 위한 서버 전용 키. **비어 있으면 인증 요청이 500으로 거절됩니다.** git에 올리지 않습니다 |
| `RP_ID` | `localhost` | 패스키가 매이는 도메인. **화면이 올라간 도메인과 정확히 같아야 합니다** (배포본은 `chacha1650a.github.io`) |
| `RP_NAME` | 김대훈 포트폴리오 — 비공개 서랍 | 패스키 창에 보이는 이름 |
| `EXPECTED_ORIGINS` | `http://localhost:5500,http://127.0.0.1:5500` | 서명을 받아 줄 화면 주소. 쉼표로 여러 개 |
| `CHALLENGE_TTL_SECONDS` | `120` | 일회용 질문을 서버가 들고 있는 시간 |
| `SESSION_TTL_HOURS` | `12` | 로그인 유지 시간 |
| `DB_PATH` | `./passkey.db` | SQLite 파일 위치 |

## API

인증이 필요한 자리는 `Authorization: Bearer <토큰>` 헤더를 봅니다. **주소(URL)에는 토큰을 싣지 않습니다.**

| 흐름 | 메서드 · 경로 | 하는 일 |
| --- | --- | --- |
| 등록 ① | `POST /api/passkey/register/options` | 일회용 질문을 만들어 DB에 넣고 내려 줍니다. 이미 패스키가 있는 계정이면 **로그인한 사람만** 받을 수 있습니다 |
| 등록 ② | `POST /api/passkey/register/verify` | 질문을 한 번만 쓰게 소모하고, 응답을 검증한 뒤 **공개키**를 저장합니다 |
| 로그인 ① | `POST /api/passkey/login/options` | 매번 새 질문을 만들어 내려 줍니다 |
| 로그인 ② | `POST /api/passkey/login/verify` | 저장해 둔 **공개키로 서명을 확인**하고, 통과하면 세션 토큰을 발급합니다 |
| 로그아웃 | `POST /api/auth/logout` | 서버가 `sessions.revoked_at` 을 찍어 그 토큰을 끊습니다 |
| 나 | `GET /api/auth/me` | 지금 토큰의 주인 |
| 패스키 목록 | `GET /api/passkeys` | 내 패스키의 이름·등록일·마지막 사용일 |
| 패스키 삭제 | `DELETE /api/passkeys/:credentialId` | **내 것만** 지웁니다. 마지막 하나는 409로 막습니다 |
| 비공개 자료 | `GET /api/private/items` | 세션의 주인 것만 내려 줍니다. `?handle=` `?userId=` `X-User-Handle` 은 받기만 하고 쓰지 않습니다 |
| 항목 추가/삭제 | `POST` / `DELETE /api/private/items/:id` | 내 것만 |
| 상태 | `GET /api/health` | 무료 서버를 깨우는 용도로도 씁니다 |

## 확인 스크립트

```bash
npm run evidence
```

가상 인증기([`virtual-authenticator.js`](virtual-authenticator.js))로 등록·로그인·재사용 거절·타계정 접근 거절·패스키 삭제까지
전부 돌리고, 오간 요청과 응답을 [`8번째 과제(패스키 등록)/증거/자동 검증 기록.md`](../8번째%20과제(패스키%20등록)/증거/자동%20검증%20기록.md) 에 그대로 씁니다.
배포한 서버에 대고 돌리려면:

```bash
node test-virtual-authenticator.js --base https://daehoon-passkey-backend.onrender.com \
  --rp-id chacha1650a.github.io --origin https://chacha1650a.github.io
```

## 무료 플랜의 한계

- 15분 이상 아무도 안 쓰면 서버가 잠들어서 **첫 요청만 30~60초** 걸립니다.
- free 플랜은 디스크가 영구 저장이 아니라, **다시 배포하면 `passkey.db` 가 초기화됩니다**(계정과 등록한 패스키가 함께 사라집니다).
  기기 쪽 패스키는 남지만 서버에 짝이 되는 공개키가 없어져 로그인할 수 없게 되고, 새 이름으로 다시 등록해야 합니다.
  과제 제출·심사 용도로는 충분하지만 오래 쓰려면 유료 디스크나 관리형 DB로 옮겨야 합니다.
