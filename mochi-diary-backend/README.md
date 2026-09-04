# 모찌 일기장 백엔드

`6번째 과제(다이어리)`(모찌의 일기장)용 백엔드예요.
Express + SQLite(`node:sqlite`, Node 22+ 내장이라 별도 설치/빌드 필요 없음)로 만든 아주 작은 API 서버입니다.
GitHub Pages는 정적 파일만 서빙하기 때문에, 이 백엔드는 **따로 호스팅**해야 프론트엔드(`6번째 과제(다이어리)/index.html`)에서 연결할 수 있어요.

> **폴더 위치가 저장소 루트인 이유**: Render는 Root Directory·Build Command 입력값을 `^[A-Za-z0-9-_./]*$` 로 검사해서
> 한글·괄호가 들어간 경로(`6번째 과제(다이어리)/backend`)를 아예 받지 않아요. 그래서 배포용으로 영문 경로에 따로 두었습니다.

## 로컬에서 실행해보기

```bash
cd mochi-diary-backend
npm install
cp .env.example .env   # .env를 열어서 API_KEY를 원하는 값으로 바꾸세요
npm start
```

`http://localhost:3000/api/health` 가 `{"ok":true}` 를 반환하면 정상이에요.

## Render.com에 배포하기 (무료)

1. https://render.com 가입 후 **New +** → **Web Service**
2. 이 GitHub 저장소를 연결하고, **Root Directory**를 `mochi-diary-backend` 로 지정
3. 설정값:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Environment** 탭에서 환경변수 추가:
   - `API_KEY` = 아무도 못 맞출 만큼 긴 랜덤 문자열 (여기서 정한 값을 프론트엔드 설정 패널에도 똑같이 입력해야 해요)
5. 배포되면 `https://xxxx.onrender.com` 같은 주소가 생겨요. 이 주소를 `index.html`의 **🔌 서버 연결** 패널에 입력하세요.

### ⚠ 무료 플랜의 한계 (꼭 알아두세요)

- Render 무료 웹서비스는 **디스크가 영구 저장이 아니에요.** 15분 정도 요청이 없으면 서비스가 잠들고, 다음 요청에 다시 깨어나는 동안은
  데이터가 남아있지만, **코드를 새로 배포(redeploy)하면 그 순간 `diary.db` 파일이 초기화**돼요.
- 개인 다이어리를 진짜 오래 쓰고 싶다면 나중에 Render의 **유료 Persistent Disk**를 추가하거나, SQLite 대신
  Postgres 같은 별도 관리형 DB로 옮기는 걸 고려하세요. 지금 구조는 "실제 백엔드+DB 구현"이라는 학습 목적과
  로컬 테스트/과제 제출용으로는 충분해요.

## API 요약

모든 `/api/*` 요청은 `X-Api-Key` 헤더에 위에서 설정한 API_KEY를 실어 보내야 해요 (`/api/health` 제외).
`API_KEY` 환경변수에 쉼표로 여러 값을 넣으면(`real-key,verification-key`) 둘 다 유효한 키로 인정돼요.
과제 검증용으로 별도 키를 하나 더 공개하고 싶을 때 이렇게 쓰면 실제 사용 키는 노출하지 않을 수 있어요.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 서버 살아있는지 확인 (인증 불필요) |
| GET | `/api/entries` | 전체 일기 불러오기 |
| PUT | `/api/entries/:date` | 특정 날짜 일기 저장/수정 (본문 비면 자동 삭제) |
| DELETE | `/api/entries/:date` | 특정 날짜 일기 삭제 |
| DELETE | `/api/entries` | 전체 삭제 |
| POST | `/api/import` | JSON 백업 파일 복원 (기존 기록 전체 교체) |
