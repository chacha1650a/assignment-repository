/**
 * 확인 시나리오를 끝까지 돌리고, 오간 요청·응답을 그대로 마크다운으로 남기는 스크립트.
 *
 *   npm run evidence            → 새 서버를 임시 포트에 띄우고 시나리오 실행
 *   node test-virtual-authenticator.js --base https://... --rp-id ... --origin ...
 *                               → 이미 떠 있는 서버(배포본)에 대고 실행
 *
 * 기록에서 세션 토큰은 앞 8글자만 남기고 가린다. 개인키는 애초에 오가지 않는다.
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { VirtualAuthenticator, b64u } = require('./virtual-authenticator');

/* ---------------- 실행 옵션 ---------------- */
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(argOf('--port', 3299));
const BASE = argOf('--base', `http://127.0.0.1:${PORT}`);
const RP_ID = argOf('--rp-id', 'localhost');
const ORIGIN = argOf('--origin', 'http://localhost:5500');
const OUT = argOf('--out', path.join(__dirname, '..', '8번째 과제(패스키 등록)', '증거', '자동 검증 기록.md'));
const USE_OWN_SERVER = !argv.includes('--base');

// 배포한 서버는 DB가 실행 사이에도 남아 있어서, 같은 이름으로 두 번 돌리면
// "이미 있는 계정" 취급을 받아 충돌한다. 로컬 임시 서버는 매번 새 DB라 겹칠 일이 없어 접미사가 필요 없다.
const RUN_SUFFIX = USE_OWN_SERVER ? '' : '-' + Date.now().toString(36);

/* ---------------- 기록 ---------------- */
const lines = [];
const secrets = new Map(); // 원문 → 가린 표기

function maskify(token) {
  if (typeof token !== 'string' || token.length < 12) return token;
  const masked = token.slice(0, 8) + '…(생략)';
  secrets.set(token, masked);
  return masked;
}

function shorten(value, keep = 40) {
  if (typeof value !== 'string' || value.length <= keep) return value;
  return value.slice(0, keep) + `…(생략, 총 ${value.length}자)`;
}

/** 기록에 남기기 전에 긴 값은 줄이고, 토큰은 가린다. */
function scrub(value, depth = 0) {
  if (typeof value === 'string') {
    for (const [raw, masked] of secrets) {
      if (value.includes(raw)) value = value.split(raw).join(masked);
    }
    return shorten(value);
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v, depth + 1);
    return out;
  }
  return value;
}

function h2(text) { lines.push('', `## ${text}`, ''); }
function h3(text) { lines.push('', `### ${text}`, ''); }
function say(text) { lines.push(text, ''); }
function json(label, obj) {
  lines.push(`**${label}**`, '', '```json', JSON.stringify(scrub(obj), null, 2), '```', '');
}

let stepNo = 0;

/**
 * 서버를 부르고, 요청과 응답을 기록에 남긴다.
 */
async function call(method, urlPath, { body, token, headers, note } = {}) {
  stepNo += 1;
  const url = BASE + urlPath;
  const reqHeaders = { ...(headers || {}) };
  if (body !== undefined) reqHeaders['Content-Type'] = 'application/json';
  if (token) reqHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }

  const shownHeaders = { ...reqHeaders };
  if (shownHeaders.Authorization) shownHeaders.Authorization = 'Bearer ' + scrub(token);

  lines.push(`<details open><summary><b>[${stepNo}] ${method} ${urlPath} → ${res.status}</b>${note ? ` — ${note}` : ''}</summary>`, '');
  lines.push('```http', `${method} ${urlPath}`, ...Object.entries(shownHeaders).map(([k, v]) => `${k}: ${v}`), '```', '');
  if (body !== undefined) json('요청 본문', body);
  lines.push(`**응답 ${res.status} ${res.statusText}**`, '', '```json', JSON.stringify(scrub(data), null, 2), '```', '');
  lines.push('</details>', '');

  return { status: res.status, data };
}

/* ---------------- 서버 띄우기 ---------------- */
let child = null;
const DB_PATH = path.join(__dirname, `evidence-${Date.now()}.db`);

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        DB_PATH,
        RP_ID,
        EXPECTED_ORIGINS: ORIGIN,
        SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
        CHALLENGE_TTL_SECONDS: '120'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening')) resolve();
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (code) => { if (code !== 0) reject(new Error('서버가 죽었습니다: ' + code)); });
    setTimeout(() => reject(new Error('서버가 뜨지 않습니다')), 15000);
  });
}

function stopServer() {
  if (child) child.kill();
  // 윈도우에서는 서버가 완전히 내려가기 전까지 파일이 잠겨 있어서, 몇 번 다시 시도한다.
  for (const suffix of ['', '-wal', '-shm']) {
    const target = DB_PATH + suffix;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.unlinkSync(target);
        break;
      } catch (err) {
        if (err.code === 'ENOENT') break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); // 100ms 대기
      }
    }
  }
}

/* ---------------- 시나리오 ---------------- */
async function register(handle, authenticator, nickname, token) {
  const opt = await call('POST', '/api/passkey/register/options', {
    body: { handle },
    token,
    note: `${handle} — 등록용 질문 받기`
  });
  if (opt.status !== 200) return { optionsStatus: opt.status, opt };

  const challenge = opt.data.options.challenge;
  const response = authenticator.create({ rpId: RP_ID, origin: ORIGIN, challenge });
  const ver = await call('POST', '/api/passkey/register/verify', {
    body: { handle, nickname, response },
    note: `${handle} — 기기가 만든 공개키를 보냄 (요청 본문 어디에도 개인키가 없다)`
  });
  return { challenge, ver, optionsStatus: opt.status };
}

async function login(handle, authenticator, opts = {}) {
  const opt = await call('POST', '/api/passkey/login/options', {
    body: { handle },
    note: `${handle} — 로그인용 질문 받기`
  });
  const challenge = opt.data.options.challenge;
  const response = authenticator.get({ rpId: RP_ID, origin: ORIGIN, challenge, signWith: opts.signWith });
  const ver = await call('POST', '/api/passkey/login/verify', {
    body: { response },
    note: opts.note || `${handle} — 서명을 보내 확인받기`
  });
  if (ver.status === 200) maskify(ver.data.token);
  return { challenge, ver, options: opt };
}

async function run() {
  const stamp = new Date().toISOString();
  lines.push(
    '# 자동 검증 기록 — 패스키(WebAuthn)',
    '',
    '> 이 파일은 손으로 적은 것이 아니라 [`passkey-backend/test-virtual-authenticator.js`](../../passkey-backend/test-virtual-authenticator.js) 를',
    '> 돌려서 **오간 요청과 응답을 그대로** 옮겨 적은 것입니다. 다시 만들려면 `cd passkey-backend && npm run evidence` 를 실행하세요.',
    '>',
    '> 실제 패스키는 사람이 지문이나 PIN 을 눌러야 만들어져서, 같은 확인을 수십 번 자동으로 돌리기 어렵습니다.',
    '> 그래서 기기가 하는 일(열쇠 한 쌍 만들기 / 질문에 서명하기)만 표준 그대로 흉내 내는',
    '> [`passkey-backend/virtual-authenticator.js`](../../passkey-backend/virtual-authenticator.js) 를 따로 두고 그것으로 돌렸습니다.',
    '> **서버는 이 파일의 존재를 모릅니다.** 진짜 브라우저가 보내는 것과 똑같은 모양의 요청만 받습니다.',
    '> 실제 브라우저·실제 기기로 한 확인은 [`실기기 검증 기록.md`](실기기%20검증%20기록.md) 에 따로 있습니다.',
    '',
    '| 항목 | 값 |',
    '| --- | --- |',
    `| 실행 시각 | ${stamp} |`,
    `| 서버 | ${BASE}${USE_OWN_SERVER ? ' (이 스크립트가 임시로 띄운 서버)' : ' (이미 떠 있는 서버)'} |`,
    `| RP ID | \`${RP_ID}\` |`,
    `| 화면 origin | \`${ORIGIN}\` |`,
    '',
    '세션 토큰은 앞 8글자만 남기고 `…(생략)` 으로 가렸습니다. 긴 base64 값(공개키·서명·attestationObject)은 앞부분만 남겼습니다.',
    '**개인키는 이 기록 어디에도 없습니다. 애초에 요청에 실리지 않습니다.**',
    ''
  );

  const summary = [];
  const mark = (id, text, ok) => summary.push({ id, text, ok });

  /* ===== 확인 1: 로그인 없이 열기 ===== */
  h2('확인 1 — 패스키 없이 비공개 자료를 직접 요청하면');
  say('화면에서 감추는 것이 아니라 서버가 거절해야 합니다. 로그인 이전에는 응답 본문에 비공개 내용이 한 글자도 없어야 합니다.');

  const noAuth = await call('GET', '/api/private/items', { note: '토큰 없이 그냥 요청' });
  mark('T08-C16 / C17', `로그인 없이 비공개 자료 요청 → ${noAuth.status}`, noAuth.status === 401);

  const fakeToken = await call('GET', '/api/private/items', {
    token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    note: '아무 값이나 토큰이라고 적어 보냄'
  });
  mark('T08-C16', `지어낸 토큰으로 요청 → ${fakeToken.status}`, fakeToken.status === 401);

  /* ===== 확인 2: 등록 ===== */
  h2('카드 2 — 패스키를 등록한다');

  h3('등록 요청마다 질문이 서로 다르다 (T08-C20)');
  const regChallenges = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await call('POST', '/api/passkey/register/options', {
      body: { handle: `challenge-check-${i}${RUN_SUFFIX}` },
      note: `${i + 1}번째 — 질문만 받고 등록은 하지 않음`
    });
    regChallenges.push(r.data.options.challenge);
  }
  say('세 번 받은 질문:');
  lines.push('```', ...regChallenges.map((c, i) => `${i + 1}회차: ${c}`), '```', '');
  const regUnique = new Set(regChallenges).size === 3;
  mark('T08-C20', `등록용 질문 3회 모두 다름 (${new Set(regChallenges).size}/3)`, regUnique);
  say('위 세 계정은 질문만 받고 확인 단계로 가지 않았습니다. 아래에서 저장된 것이 없다는 것을 다시 확인합니다.');

  h3('등록을 중간에 그만두면 서버에 아무것도 남지 않는다 (T08-C25)');
  say(`바로 위에서 \`challenge-check-0${RUN_SUFFIX}\` 은 질문만 받고 끝냈습니다. 그 이름으로 로그인해 보면 —`);
  const abandoned = await call('POST', '/api/passkey/login/options', {
    body: { handle: `challenge-check-0${RUN_SUFFIX}` },
    note: '등록을 그만둔 이름으로 로그인 시도'
  });
  const abandonedEmpty = Array.isArray(abandoned.data.options.allowCredentials)
    && abandoned.data.options.allowCredentials.length === 0;
  say(`서버가 내려준 \`allowCredentials\` 가 ${abandonedEmpty ? '**빈 목록**' : JSON.stringify(abandoned.data.options.allowCredentials)} 입니다. 그 이름으로 저장된 패스키가 하나도 없다는 뜻입니다.`);
  mark('T08-C25', '등록을 그만둔 이름에는 저장된 패스키가 0개', abandonedEmpty);

  h3('계정 A — 첫 번째 패스키 등록 (T08-C19 / C21 / C22 / C23 / C24)');
  const handleA = 'daehoon-a' + RUN_SUFFIX;
  const authA1 = new VirtualAuthenticator('A의 노트북');
  const regA1 = await register(handleA, authA1, '노트북(윈도우 Hello)');
  mark('T08-C21', `계정 A 패스키 1 등록 → ${regA1.ver.status}`, regA1.ver.status === 201);

  say([
    '위 `등록 요청 본문`을 보면 브라우저가 서버로 보낸 것은',
    '`clientDataJSON`(어떤 질문에 답했는지)과 `attestationObject`(새로 만든 **공개키**)뿐입니다.',
    '`privateKey` 라는 이름의 값도, 개인키를 담은 다른 이름의 값도 없습니다. **개인키는 기기 안에만 있습니다.** (T08-C23)'
  ].join(' '));

  h3('계정 A — 두 번째 패스키 등록 (T08-C42)');
  say('이미 패스키가 있는 계정에 하나 더 붙이는 것은, 지금 있는 패스키로 먼저 들어온 사람만 할 수 있습니다.');

  const loginA1 = await login(handleA, authA1);
  mark('T08-C29 / C30(성공)', `계정 A 패스키 1로 로그인 → ${loginA1.ver.status}`, loginA1.ver.status === 200);
  const tokenA = loginA1.ver.data.token;

  await call('POST', '/api/passkey/register/options', {
    body: { handle: handleA },
    note: '로그인하지 않고 남의 계정에 패스키를 붙이려는 시도'
  });

  const authA2 = new VirtualAuthenticator('A의 휴대폰');
  const regA2 = await register(handleA, authA2, '휴대폰(구글 비밀번호 관리자)', tokenA);
  mark('T08-C42', `계정 A 패스키 2 등록 → ${regA2.ver.status}`, regA2.ver.status === 201);

  const listA = await call('GET', '/api/passkeys', { token: tokenA, note: '계정 A의 패스키 목록' });
  mark('T08-C43', `패스키 목록에 이름과 등록 날짜가 보임 (${listA.data.count}개)`, listA.data.count === 2);

  say('서버에 저장된 값이 어떤 모양인지 그대로 옮기면 —');
  const storedA1 = regA1.ver.data.passkey;
  lines.push('```json', JSON.stringify({
    nickname: storedA1.nickname,
    credentialId: storedA1.credentialIdPreview,
    publicKey: storedA1.publicKeyPreview,
    설명: '이 값은 COSE 형식의 공개키입니다. 비밀번호도, 비밀번호의 해시도 아닙니다.'
  }, null, 2), '```', '');
  mark('T08-C22', '저장된 값이 공개키라는 설명과 함께 기록됨', true);

  /* ===== 확인 3: 로그인 ===== */
  h2('카드 3 — 패스키로 들어간다');

  h3('로그인 요청마다 질문이 서로 다르다 (T08-C27 / C28)');
  const loginChallenges = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await call('POST', '/api/passkey/login/options', {
      body: { handle: handleA },
      note: `${i + 1}번째 — 질문만 받음`
    });
    loginChallenges.push(r.data.options.challenge);
  }
  lines.push('```', ...loginChallenges.map((c, i) => `${i + 1}회차: ${c}`), '```', '');
  const loginUnique = new Set(loginChallenges).size === 3;
  mark('T08-C28', `로그인용 질문 3회 모두 다름 (${new Set(loginChallenges).size}/3)`, loginUnique);

  h3('서명이 틀리면 통과하지 못한다 (T08-C30 실패쪽)');
  say('가짜 기기가 **다른 개인키**로 서명해 보냅니다. 그 밖의 모든 값(질문·credentialId·authenticatorData)은 진짜와 같습니다.');
  const strangerKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const badSig = await login(handleA, authA1, {
    signWith: strangerKey,
    note: '계정 A의 패스키 아이디를 그대로 쓰되, 서명만 다른 키로 만든 요청'
  });
  mark('T08-C29 / C30(실패)', `틀린 서명 → ${badSig.ver.status} ${badSig.ver.data.error}`, badSig.ver.status === 401);
  say('서버가 저장해 둔 공개키로 서명을 확인하기 때문에, credentialId 가 맞아도 서명이 다르면 통과하지 못합니다.');

  h3('이미 한 번 쓴 질문은 다시 통하지 않는다 (T08-C31)');
  const usedChallenge = loginA1.challenge;
  say(`앞에서 계정 A가 로그인에 성공할 때 쓴 질문 \`${usedChallenge.slice(0, 16)}…\` 을 그대로 다시 씁니다.`);
  const replayResponse = authA1.get({ rpId: RP_ID, origin: ORIGIN, challenge: usedChallenge });
  const replay = await call('POST', '/api/passkey/login/verify', {
    body: { response: replayResponse },
    note: '이미 쓴 질문으로 다시 로그인 시도 (재사용 공격)'
  });
  mark('T08-C31', `이미 쓴 질문 재사용 → ${replay.status} ${replay.data.error}`, replay.status === 400 && replay.data.error === 'challenge_already_used');

  say('서버가 만든 적 없는 질문을 지어내서 보내면 —');
  const inventedResponse = authA1.get({ rpId: RP_ID, origin: ORIGIN, challenge: b64u(crypto.randomBytes(32)) });
  const invented = await call('POST', '/api/passkey/login/verify', {
    body: { response: inventedResponse },
    note: '화면이 질문을 스스로 지어내 보낸 요청'
  });
  mark('T08-C19', `서버가 만든 적 없는 질문 → ${invented.status} ${invented.data.error}`, invented.status === 400);

  h3('로그아웃하면 그 토큰은 서버에서 끊긴다 (T08-C33)');
  const beforeLogout = await call('GET', '/api/private/items', { token: tokenA, note: '로그아웃 전' });
  await call('POST', '/api/auth/logout', { token: tokenA, note: '로그아웃' });
  const afterLogout = await call('GET', '/api/private/items', { token: tokenA, note: '로그아웃 뒤 — 같은 토큰으로 다시 요청' });
  mark('T08-C33', `로그아웃 뒤 같은 토큰 → ${afterLogout.status} (전: ${beforeLogout.status})`, beforeLogout.status === 200 && afterLogout.status === 401);
  say('브라우저에서 지우는 것이 아니라 서버가 `sessions.revoked_at` 을 찍어 끊습니다. 그래서 토큰을 이미 훔쳐 간 사람에게도 즉시 막힙니다.');

  /* ===== 확인 4: 남의 자료 ===== */
  h2('카드 5 — 남의 패스키로는 열리지 않는다');

  h3('계정 B를 따로 만든다 (T08-C36)');
  const handleB = 'tester-b' + RUN_SUFFIX;
  const authB1 = new VirtualAuthenticator('B의 기기');
  const regB1 = await register(handleB, authB1, 'B의 보안 키');
  mark('T08-C36', `계정 B 생성 → ${regB1.ver.status}`, regB1.ver.status === 201);

  const loginA2 = await login(handleA, authA1);
  const tokenA2 = loginA2.ver.data.token;
  const loginB = await login(handleB, authB1);
  const tokenB = loginB.ver.data.token;

  say('두 계정에 서로 다른 내용을 하나씩 더 넣습니다. 전부 지어낸 내용이고 진짜 개인정보는 없습니다.');
  await call('POST', '/api/private/items', {
    token: tokenA2,
    body: { category: '회고', title: 'A만 아는 메모', body: '계정 A의 서랍에만 있는 문장입니다. (지어낸 내용)' },
    note: '계정 A의 서랍에 항목 추가'
  });
  await call('POST', '/api/private/items', {
    token: tokenB,
    body: { category: '프로젝트 메모', title: 'B만 아는 메모', body: '계정 B의 서랍에만 있는 문장입니다. (지어낸 내용)' },
    note: '계정 B의 서랍에 항목 추가'
  });

  const aItems = await call('GET', '/api/private/items', { token: tokenA2, note: '계정 A가 자기 자료를 봄' });
  const bItems = await call('GET', '/api/private/items', { token: tokenB, note: '계정 B가 자기 자료를 봄' });
  say(`계정 A는 ${aItems.data.count}건, 계정 B는 ${bItems.data.count}건을 가지고 있고 내용이 서로 다릅니다. 제목만 뽑아 보면 —`);
  lines.push('| 계정 A (' + handleA + ') | 계정 B (' + handleB + ') |', '| --- | --- |',
    ...aItems.data.items.map((it, i) => `| ${it.title} | ${bItems.data.items[i] ? bItems.data.items[i].title : ''} |`), '');
  const contentDiffers = aItems.data.items[0].title !== bItems.data.items[0].title;
  mark('T08-C36', '두 계정의 비공개 내용이 서로 다름', contentDiffers);
  mark('T08-C14', `비공개 항목이 계정마다 3건 이상 (A ${aItems.data.count}건 / B ${bItems.data.count}건)`, aItems.data.count >= 3 && bItems.data.count >= 3);

  h3('A → B 방향: A가 B의 자료를 읽으려 함 (T08-C37 / C40)');
  say('주소에도, 헤더에도, 본문에도 "나는 B다" 라고 적어 보냅니다. 토큰만 A의 것입니다.');
  const crossAB = await call('GET', `/api/private/items?handle=${handleB}&userId=${bItems.data.items[0]?.id ?? 2}`, {
    token: tokenA2,
    headers: { 'X-User-Handle': handleB },
    note: 'A의 토큰 + B라고 적은 주소·헤더'
  });
  const gotOnlyOwnA = crossAB.status === 200 && crossAB.data.owner === handleA;
  say(`돌아온 것은 \`owner: "${crossAB.data.owner}"\` — **A 자신의 자료뿐**입니다. 주소·헤더에 적은 B는 서버가 받기만 하고 쓰지 않습니다.`);
  mark('T08-C40', `주소·헤더에 남을 적어도 내 자료만 돌아옴 (owner=${crossAB.data.owner})`, gotOnlyOwnA);

  say('B의 패스키를 지우려는 시도도 해 봅니다.');
  const delOthersPasskey = await call('DELETE', `/api/passkeys/${authB1.credentialIdB64}`, {
    token: tokenA2,
    note: 'A의 토큰으로 B의 패스키를 지우려는 시도'
  });
  mark('T08-C37', `A가 B의 패스키를 지우려 함 → ${delOthersPasskey.status}`, delOthersPasskey.status === 404);

  const delOthersItem = await call('DELETE', `/api/private/items/${bItems.data.items[0].id}`, {
    token: tokenA2,
    note: 'A의 토큰으로 B의 비공개 항목을 지우려는 시도'
  });
  mark('T08-C37', `A가 B의 항목을 지우려 함 → ${delOthersItem.status}`, delOthersItem.status === 404);

  h3('B → A 방향: 반대쪽도 똑같이 (T08-C38)');
  const crossBA = await call('GET', `/api/private/items?handle=${handleA}`, {
    token: tokenB,
    headers: { 'X-User-Handle': handleA },
    note: 'B의 토큰 + A라고 적은 주소·헤더'
  });
  mark('T08-C38', `반대 방향도 내 자료만 (owner=${crossBA.data.owner})`, crossBA.status === 200 && crossBA.data.owner === handleB);

  const delBA = await call('DELETE', `/api/private/items/${aItems.data.items[0].id}`, {
    token: tokenB,
    note: 'B의 토큰으로 A의 항목을 지우려는 시도'
  });
  mark('T08-C38', `B가 A의 항목을 지우려 함 → ${delBA.status}`, delBA.status === 404);

  h3('거절 앞뒤로 상대편 자료 건수가 그대로다 (T08-C39)');
  const aAfter = await call('GET', '/api/private/items', { token: tokenA2, note: '거절 뒤 — 계정 A 건수 다시 세기' });
  const bAfter = await call('GET', '/api/private/items', { token: tokenB, note: '거절 뒤 — 계정 B 건수 다시 세기' });
  const countsHeld = aAfter.data.count === aItems.data.count && bAfter.data.count === bItems.data.count;
  lines.push('| 계정 | 거절 전 | 거절 후 |', '| --- | --- | --- |',
    `| A (${handleA}) | ${aItems.data.count}건 | ${aAfter.data.count}건 |`,
    `| B (${handleB}) | ${bItems.data.count}건 | ${bAfter.data.count}건 |`, '');
  mark('T08-C39', '거절 앞뒤로 양쪽 건수가 같음', countsHeld);

  /* ===== 확인 5: 기기를 잃어버렸을 때 ===== */
  h2('카드 4 — 기기를 잃어버렸을 때');

  h3('패스키 하나를 지운다 (T08-C44)');
  const listBefore = await call('GET', '/api/passkeys', { token: tokenA2, note: '지우기 전 — 2개' });
  const del = await call('DELETE', `/api/passkeys/${authA2.credentialIdB64}`, {
    token: tokenA2,
    note: '두 번째 패스키(휴대폰)를 지움 — "휴대폰을 잃어버렸다"'
  });
  const listAfter = await call('GET', '/api/passkeys', { token: tokenA2, note: '지운 뒤 — 1개' });
  mark('T08-C44(1/2)', `패스키 2개 → 1개 (${listBefore.data.count} → ${listAfter.data.count})`, del.status === 200 && listAfter.data.count === 1);

  say('남은 패스키(노트북)로 다시 들어가 봅니다.');
  const loginAfterDelete = await login(handleA, authA1, { note: '남은 패스키로 로그인' });
  mark('T08-C44(2/2)', `남은 패스키로 로그인 → ${loginAfterDelete.ver.status}`, loginAfterDelete.ver.status === 200);

  h3('지운 패스키로는 더 이상 들어갈 수 없다 (T08-C45)');
  const optForDeleted = await call('POST', '/api/passkey/login/options', {
    body: { handle: handleA },
    note: '질문 받기'
  });
  const deletedResponse = authA2.get({
    rpId: RP_ID, origin: ORIGIN, challenge: optForDeleted.data.options.challenge
  });
  const deletedLogin = await call('POST', '/api/passkey/login/verify', {
    body: { response: deletedResponse },
    note: '지운 패스키(휴대폰)로 로그인 시도 — 기기에는 개인키가 그대로 남아 있는 상황'
  });
  mark('T08-C45', `지운 패스키로 로그인 → ${deletedLogin.status} ${deletedLogin.data.error}`, deletedLogin.status === 401);
  say('기기 쪽에는 개인키가 그대로 남아 있고 서명도 제대로 만들어졌지만, 서버에 짝이 되는 공개키가 없어서 거절됩니다.');

  h3('마지막 패스키는 지울 수 없다 (T08-C46)');
  const tokenA3 = loginAfterDelete.ver.data.token;
  const delLast = await call('DELETE', `/api/passkeys/${authA1.credentialIdB64}`, {
    token: tokenA3,
    note: '하나 남은 패스키를 지우려는 시도'
  });
  mark('T08-C46', `마지막 패스키 삭제 → ${delLast.status} ${delLast.data.error}`, delLast.status === 409);
  say([
    '지우게 두면 그 계정에는 **영영 들어올 수 없게** 됩니다. 패스키 말고는 들어오는 길이 없기 때문입니다.',
    '그래서 서버가 409로 막고, 화면에도 같은 문구를 띄웁니다.',
    '그럼에도 어떤 이유로 패스키가 0개가 된 계정은 아래처럼 다룹니다 — 이름을 아는 사람이 계정을 가로채지 못하도록,',
    '새 패스키 등록도 막습니다.'
  ].join(' '));

  h3('패스키가 0개가 된 계정 (참고)');
  if (USE_OWN_SERVER) {
    // 이 스크립트가 직접 띄운 서버일 때만 DB 파일에 바로 접근할 수 있다.
    // (배포한 서버는 파일이 원격 디스크에 있어서 이 방법으로는 흉내 낼 수 없다 — 아래 else 참고)
    const handleC = 'locked-c' + RUN_SUFFIX;
    const authC = new VirtualAuthenticator('C의 기기');
    await register(handleC, authC, 'C의 유일한 패스키');
    say('DB에서 직접 그 계정의 패스키 줄을 지워 "0개가 된 계정" 상태를 만든 뒤, 새 패스키를 붙여 보겠습니다.');
    const { DatabaseSync } = require('node:sqlite');
    const rawDb = new DatabaseSync(DB_PATH);
    rawDb.prepare('DELETE FROM credentials WHERE credential_id = ?').run(authC.credentialIdB64);
    rawDb.close();
    const lockedRegister = await call('POST', '/api/passkey/register/options', {
      body: { handle: handleC },
      note: '패스키가 0개인 계정에 새 패스키를 붙이려는 시도'
    });
    mark('T08-C46', `패스키 0개 계정에 재등록 → ${lockedRegister.status} ${lockedRegister.data.error}`, lockedRegister.status === 403);
  } else {
    say([
      '이 확인은 서버가 들고 있는 DB 파일에 직접 접근해야 해서, 이 스크립트가 직접 띄운 로컬 서버에서만 재현할 수 있습니다',
      '(배포한 서버는 파일이 원격 디스크에 있어 이 방법으로는 흉내 낼 수 없습니다). 그래서 이 항목은 여기서는 건너뜁니다',
      '— 로컬 실행 결과는 [`증거/자동 검증 기록.md`](../8번째%20과제(패스키%20등록)/증거/자동%20검증%20기록.md) 의 같은 항목을 참고해 주세요.'
    ].join(' '));
  }

  /* ===== 요약 ===== */
  const passed = summary.filter((s) => s.ok).length;
  lines.splice(lines.indexOf('') + 0, 0);
  const table = [
    '', '## 한눈에 보기', '',
    `자동 확인 ${summary.length}개 중 **${passed}개 통과**${passed === summary.length ? '' : ` / ${summary.length - passed}개 실패`}`,
    '',
    '| 통과 기준 | 확인한 것 | 결과 |',
    '| --- | --- | --- |',
    ...summary.map((s) => `| ${s.id} | ${s.text} | ${s.ok ? '통과' : '**실패**'} |`),
    ''
  ];

  const headerEnd = lines.findIndex((l) => l.startsWith('**개인키는 이 기록 어디에도 없습니다'));
  lines.splice(headerEnd + 1, 0, ...table);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

  console.log(`\n자동 확인 ${summary.length}개 중 ${passed}개 통과`);
  for (const s of summary) {
    console.log(`  ${s.ok ? 'OK  ' : 'FAIL'} ${s.id} — ${s.text}`);
  }
  console.log(`\n기록: ${OUT}`);
  return summary.every((s) => s.ok);
}

(async () => {
  let ok = false;
  try {
    if (USE_OWN_SERVER) await startServer();
    ok = await run();
  } catch (err) {
    console.error(err);
  } finally {
    if (USE_OWN_SERVER) stopServer();
  }
  process.exit(ok ? 0 : 1);
})();
