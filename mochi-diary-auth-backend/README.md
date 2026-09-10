# 모찌 일기장 2 — 로그인이 붙은 백엔드

`7번째 과제(로그인 기능)` 의 서버입니다. **Express + SQLite(`node:sqlite`) + bcryptjs** 로 만든 작은 API 서버로,
가입·로그인·로그아웃과 **계정별 자료 분리**를 담당합니다.

> **6번 과제 백엔드(`mochi-diary-backend/`)와는 별개입니다.** 6번은 로그인 없이 공용 API 키 하나로 쓰는 구조이고,
> 그 제출물이 지금도 그대로 열려야 해서 손대지 않았습니다. 이 폴더는 7번 과제용으로 새로 만든 것입니다.
>
> **폴더가 저장소 루트에 있는 이유**: Render는 Root Directory 입력값을 `^[A-Za-z0-9-_./]*$` 로 검사해서
> 한글·괄호가 들어간 경로(`7번째 과제(로그인 기능)/backend`)를 받지 못합니다.

## 쓰는 것

| 무엇 | 이름 | 버전 |
| --- | --- | --- |
| 비밀번호 해시 | bcryptjs (알고리즘 bcrypt, 반복 12회) | 3.0.3 |
| 웹 서버 | express | 4.22.2 |
| CORS | cors | 2.8.6 |
| 환경변수 | dotenv | 16.6.1 |
| DB | `node:sqlite` (Node **22.13.0 이상** 내장) | — |
| 세션 토큰 | `node:crypto` `randomBytes(32)` + HMAC-SHA256 | — |

## 로컬에서 실행

```bash
cd mochi-diary-auth-backend
npm install
cp .env.example .env
# .env 를 열어 SESSION_SECRET 을 긴 랜덤 값으로 바꾸세요:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm start
```

`http://localhost:3100/api/health` 가 `{"ok":true}` 를 주면 정상입니다.

> **Node 버전 주의**: `node:sqlite` 는 **Node 22.13.0 부터** 플래그 없이 쓸 수 있습니다.
> 그보다 낮은 22.x 에서는 `require('node:sqlite')` 가 `ERR_UNKNOWN_BUILTIN_MODULE` 로 죽습니다.
> `render.yaml` 의 `NODE_VERSION` 을 22.11.0 으로 뒀다가 첫 배포가 이 이유로 실패했고, 22.20.0 으로 올려 해결했습니다.

화면 쪽은 `7번째 과제(로그인 기능)/index.html` 을 아무 정적 서버로 띄운 뒤,
로그인 화면 아래 **서버 주소 바꾸기** 에 `http://localhost:3100` 을 넣고 저장하면 됩니다.

## Render.com에 배포 (무료)

### 방법 A — Blueprint (권장, 설정 입력이 없음)

저장소 루트에 [`render.yaml`](../render.yaml) 이 있어서, Render가 Root Directory·빌드 명령·환경변수를 알아서 읽습니다.

1. https://render.com 에 GitHub 계정으로 로그인
2. **New +** → **Blueprint**
3. `chacha1650a/assignment-repository` 저장소를 고르고 **Connect**
4. `render.yaml` 을 읽어 `mochi-diary-auth-backend` 서비스가 잡히면 **Apply** (또는 **Deploy Blueprint**)
5. 3~5분 뒤 `https://mochi-diary-auth-backend.onrender.com` 이 생깁니다

`SESSION_SECRET` 은 `generateValue: true` 로 되어 있어 **Render가 임의의 긴 값을 직접 만들어 넣습니다.**
직접 입력할 필요도 없고, 그 값이 저장소에 남지도 않습니다.

배포가 됐는지는 `https://<주소>/api/health` 가 `{"ok":true}` 를 주는지로 확인합니다.

### 방법 B — 손으로 설정하기

1. https://render.com → **New +** → **Web Service** → 이 GitHub 저장소 연결
2. **Root Directory**: `mochi-diary-auth-backend`
3. **Runtime**: Node / **Build Command**: `npm install` / **Start Command**: `npm start`
4. **Environment** 탭에서 환경변수 추가 — **여기가 중요합니다**:
   - `SESSION_SECRET` = 아무도 못 맞출 긴 랜덤 문자열 (위 명령으로 만든 값)
   - (선택) `SESSION_TTL_HOURS` = `12`, `BCRYPT_ROUNDS` = `12`
   - `PORT` 는 Render가 알아서 넣어 줍니다.
5. 배포되면 `https://xxxx.onrender.com` 주소가 생깁니다.

> **배포 뒤 할 일**: 서비스 이름을 `mochi-diary-auth-backend` 로 만들었다면 화면 쪽은 고칠 것이 없습니다.
> 다른 이름으로 만들었다면 `7번째 과제(로그인 기능)/app.js` 의 `DEFAULT_API_BASE` 상수를 그 주소로 바꿔 커밋하세요.

> `SESSION_SECRET` 은 **절대 저장소에 커밋하지 마세요.** `.env` 는 `.gitignore` 에 들어 있고,
> 저장소에는 `.env.example` 의 자리표시자만 있습니다. 브라우저 코드에도 이 값은 들어가지 않습니다.

### ⚠ 무료 플랜의 한계

- 15분 정도 요청이 없으면 잠들고, 다음 첫 요청이 30~60초 걸립니다.
- **디스크가 영구 저장이 아니라, 다시 배포하면 `diary-auth.db` 가 초기화됩니다** (계정과 일기가 함께 사라집니다).
  오래 쓰려면 유료 Persistent Disk나 Postgres 같은 관리형 DB로 옮겨야 합니다.

## 5일 기록을 배포 서버의 내 계정에 다시 넣기

배포한 서버는 비어 있으므로, 아래 스크립트로 내 계정을 만들고 5일 기록과 규칙 변경을 한 번에 넣을 수 있습니다.
**비밀번호는 코드에 적지 말고 명령을 실행할 때 환경변수로 넘깁니다.**

```bash
cd mochi-diary-auth-backend
DIARY_URL=https://xxxx.onrender.com DIARY_EMAIL=나의@이메일 DIARY_PASSWORD='내 비밀번호' node seed-5days.js
```

## API 요약

`/api/health` 를 뺀 모든 경로는 `Authorization: Bearer <토큰>` 헤더가 필요합니다. 토큰은 주소에 실을 수 없습니다.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 살아있는지 확인 (인증 불필요) |
| POST | `/api/auth/signup` | 가입. 같은 이메일이면 409 |
| POST | `/api/auth/login` | 로그인. 실패는 이메일이 없든 비번이 틀리든 **같은 401 문구** |
| POST | `/api/auth/logout` | 서버에서 세션을 끊음 (`revoked_at`) |
| GET | `/api/auth/me` | 지금 로그인한 사람 |
| POST | `/api/auth/change-password` | 비밀번호 변경 → 그 계정의 **모든 세션을 끊음** |
| GET | `/api/entries` | 내 일기 전부 (`WHERE user_id = ?`) |
| PUT | `/api/entries/date/:date` | 그 날짜 일기 저장/수정 (내 계정 안에서만) |
| DELETE | `/api/entries/date/:date` | 그 날짜 일기 삭제 |
| GET/PUT/DELETE | `/api/entries/:id` | 한 건 다루기. **남의 것이면 404** |
| DELETE | `/api/entries` | 내 일기 전부 삭제 |
| GET/PUT | `/api/settings` | 실험 설정 (질문·지표·단위·계산 규칙·계획 규칙) |
| GET/POST | `/api/rule-changes` | 계획 규칙 변경 기록 |
| GET | `/api/export` | 내 자료 전부를 JSON 하나로 (해시·토큰은 빠짐) |
| DELETE | `/api/account` | 계정 삭제. 일기·설정·규칙변경·세션이 함께 삭제 (CASCADE) |
