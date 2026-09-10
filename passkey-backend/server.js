require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite'); // Node 22.13+ 내장 (네이티브 빌드 불필요)

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const PORT = process.env.PORT || 3200;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'passkey.db');

// 세션 토큰을 DB에 원문으로 두지 않기 위한 서버 전용 비밀키. 환경변수에만 두고 git에는 올리지 않는다.
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

// 질문(challenge)을 서버가 들고 있는 시간. 짧을수록 좋지만 사용자가 지문/PIN 을 누를 시간은 있어야 한다.
const CHALLENGE_TTL_SECONDS = Number(process.env.CHALLENGE_TTL_SECONDS || 120);

// 패스키는 "어느 사이트의 열쇠인가"를 RP ID(도메인)로 못박는다. 이 값이 화면 주소와 다르면 브라우저가 거절한다.
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || '김대훈 포트폴리오 — 비공개 서랍';
// 화면이 떠 있는 주소들. 쉼표로 여러 개. 여기 없는 origin 의 서명은 통과시키지 않는다.
const EXPECTED_ORIGINS = (process.env.EXPECTED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map((s) => s.trim()).filter(Boolean);

if (!SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET 이 비어 있습니다. 환경변수에 긴 랜덤 값을 넣어주세요. (없으면 인증 요청이 500으로 거절됩니다)');
}

/* ---------------- DB ---------------- */
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    handle       TEXT NOT NULL,
    handle_lower TEXT NOT NULL UNIQUE,
    -- WebAuthn 이 쓰는 사용자 식별자. 이메일 같은 개인정보를 쓰지 않으려고 난수로 만든다.
    webauthn_id  TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL
  );

  -- 패스키 하나 = 이 표의 한 줄. 여기 들어가는 것은 '공개키'다. 개인키는 서버로 오지 않는다.
  CREATE TABLE IF NOT EXISTS credentials (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id  TEXT NOT NULL UNIQUE,   -- base64url
    public_key     TEXT NOT NULL,          -- base64url (COSE 형식 공개키)
    counter        INTEGER NOT NULL DEFAULT 0,
    transports     TEXT NOT NULL DEFAULT '[]',
    device_type    TEXT NOT NULL DEFAULT '',
    backed_up      INTEGER NOT NULL DEFAULT 0,
    nickname       TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    last_used_at   TEXT
  );

  -- 서버가 만든 일회용 질문. 화면이 아니라 서버가 들고 있고, 한 번 쓰면 used_at 이 찍혀 다시 통하지 않는다.
  CREATE TABLE IF NOT EXISTS challenges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge  TEXT NOT NULL UNIQUE,
    purpose    TEXT NOT NULL,              -- 'registration' | 'authentication'
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    -- 새 계정을 만드는 등록이면, 그때 쓴 WebAuthn 사용자 식별자를 여기 들고 있는다.
    pending_webauthn_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );

  -- 잠긴 자리에 들어 있는 내용. 전부 지어낸 것이고 진짜 개인정보는 넣지 않는다.
  CREATE TABLE IF NOT EXISTS private_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category   TEXT NOT NULL DEFAULT '메모',
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

/* ---------------- 공용 유틸 ---------------- */
const nowIso = () => new Date().toISOString();

function hashToken(token) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(userId, hashToken(token), nowIso(), expiresAt);
  return { token, expiresAt };
}

function revokeSession(token) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(nowIso(), hashToken(token));
}

/* ---- 질문(challenge) 보관소 ----
   화면이 보내온 값을 그대로 믿지 않기 위해, 서버가 만든 질문만 DB에 넣어 두고
   확인할 때 꺼내 쓴다. 꺼내 쓰는 순간 used_at 을 찍어 두 번은 통하지 않게 한다. */
function saveChallenge(challenge, purpose, userId, pendingWebauthnId) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  db.prepare('INSERT INTO challenges (challenge, purpose, user_id, created_at, expires_at, pending_webauthn_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(challenge, purpose, userId ?? null, nowIso(), expiresAt, pendingWebauthnId ?? null);
}

/**
 * 질문을 한 번만 쓰게 만드는 자리.
 * 없음 / 이미 씀 / 시간 지남 / 용도 다름 을 각각 다른 이유로 돌려준다.
 */
function consumeChallenge(challenge, purpose) {
  if (typeof challenge !== 'string' || !challenge) {
    return { ok: false, reason: 'challenge_missing' };
  }
  const row = db.prepare('SELECT * FROM challenges WHERE challenge = ?').get(challenge);
  if (!row) return { ok: false, reason: 'challenge_unknown' };
  if (row.purpose !== purpose) return { ok: false, reason: 'challenge_wrong_purpose' };
  if (row.used_at) return { ok: false, reason: 'challenge_already_used' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'challenge_expired' };

  db.prepare('UPDATE challenges SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return { ok: true, row };
}

const CHALLENGE_ERRORS = {
  challenge_missing: { status: 400, message: '질문(challenge)이 요청에 없어요.' },
  challenge_unknown: { status: 400, message: '서버가 만든 적 없는 질문이에요.' },
  challenge_wrong_purpose: { status: 400, message: '등록용 질문과 로그인용 질문은 서로 쓸 수 없어요.' },
  challenge_already_used: { status: 400, message: '이미 한 번 쓴 질문이에요. 처음부터 다시 해주세요.' },
  challenge_expired: { status: 400, message: '질문이 만료됐어요. 처음부터 다시 해주세요.' }
};

// 오래된 질문 줄은 주기적으로 지운다 (한 번 쓴 것은 재사용 거절 기록을 남기려고 10분은 남겨 둔다).
function sweepChallenges() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM challenges WHERE created_at < ?').run(cutoff);
}
setInterval(sweepChallenges, 5 * 60 * 1000).unref();

/* ---- 로그인 확인 ---- */
function requireAuth(req, res, next) {
  if (!SESSION_SECRET) {
    return res.status(500).json({ error: 'server_misconfigured', message: '서버 설정이 끝나지 않았어요.' });
  }
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: '패스키로 들어와야 볼 수 있어요.' });
  }
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token));
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'unauthorized', message: '패스키로 들어와야 볼 수 있어요.' });
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return res.status(401).json({ error: 'session_expired', message: '로그인이 만료됐어요. 다시 들어와 주세요.' });
  }
  const user = db.prepare('SELECT id, handle, created_at FROM users WHERE id = ?').get(row.user_id);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: '패스키로 들어와야 볼 수 있어요.' });
  }
  // 주소(?handle=)·헤더(X-User-Handle)·본문(userId)에 뭐라고 적어 보내든, 여기서 정한 값만 쓴다.
  req.user = user;
  req.sessionToken = token;
  next();
}

/* ---- 계정 ---- */
const HANDLE_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function findUserByHandle(handle) {
  return db.prepare('SELECT * FROM users WHERE handle_lower = ?').get(String(handle || '').toLowerCase());
}

function credentialsOf(userId) {
  return db.prepare('SELECT * FROM credentials WHERE user_id = ? ORDER BY id').all(userId);
}

// 계정을 새로 만들 때 비공개 서랍에 기본 항목 세 개를 넣어 둔다.
// 전부 지어낸 내용이고, 계정마다 다르게 보이도록 계정 이름을 함께 적는다.
// 여기 진짜 연락처나 신분증 번호 같은 것은 넣지 않는다.
function starterItemsFor(handle) {
  return [
    {
      category: '프로젝트 메모',
      title: '준비 중인 프로젝트',
      body: `[${handle}] 패스키 로그인을 붙인 포트폴리오 — 다음은 복구 코드 붙이기. (지어낸 내용입니다)`
    },
    {
      category: '지원하려는 곳',
      title: '지원 후보 목록',
      body: `[${handle}] 가상의 회사 세 곳을 적어 둔 자리입니다. 실제 지원 내역이 아닙니다.`
    },
    {
      category: '회고',
      title: '이번 주 회고',
      body: `[${handle}] 비밀번호를 없애니 "무엇이 대신 그 자리를 지키는가"가 더 또렷해졌다.`
    }
  ];
}

function seedStarterItems(userId, handle) {
  const stmt = db.prepare('INSERT INTO private_items (user_id, category, title, body, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const item of starterItemsFor(handle)) {
    stmt.run(userId, item.category, item.title, item.body, nowIso());
  }
}

/* ---------------- 앱 ---------------- */
const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Handle']
}));
app.use(express.json({ limit: '1mb' }));

// 요청 로그: 경로/상태만 남긴다. 토큰·서명 같은 본문은 남기지 않는다.
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} -> ${res.statusCode}`);
  });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, rpId: RP_ID, origins: EXPECTED_ORIGINS });
});

/* =========================================================
   ① 등록 — 서버가 질문을 만들고, 기기가 열쇠 한 쌍을 만든다
   ========================================================= */
app.post('/api/passkey/register/options', async (req, res) => {
  const body = req.body || {};
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';

  if (!HANDLE_RE.test(handle)) {
    return res.status(400).json({
      error: 'invalid_handle',
      message: '이름은 영문·숫자·. _ - 으로 3~32자여야 해요.'
    });
  }

  let user = findUserByHandle(handle);
  let existing = [];

  if (user) {
    existing = credentialsOf(user.id);

    if (existing.length === 0) {
      // 패스키를 전부 지운 계정. 다시 열어 주면 이름만 아는 사람이 계정을 가로챌 수 있어서 막는다.
      return res.status(403).json({
        error: 'account_locked',
        message: '이 계정에는 패스키가 하나도 남아 있지 않아 더 이상 들어올 수 없어요. 새 이름으로 계정을 만들어 주세요.'
      });
    }

    // 이미 패스키가 있는 계정에 하나 더 붙이는 것은, 이미 들어와 있는 사람만 할 수 있다.
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const session = token ? db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token)) : null;
    const valid = session && !session.revoked_at && new Date(session.expires_at).getTime() > Date.now();
    if (!valid || session.user_id !== user.id) {
      return res.status(401).json({
        error: 'unauthorized',
        message: '이미 있는 계정에 패스키를 더 붙이려면 먼저 지금 있는 패스키로 들어와야 해요.'
      });
    }
  }

  const webauthnId = user ? user.webauthn_id : crypto.randomBytes(32).toString('base64url');

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: isoBase64URL.toBuffer(webauthnId),
    userName: handle,
    userDisplayName: handle,
    // 서버는 증명서(attestation)를 받아 봐야 쓸 데가 없어서 요구하지 않는다.
    attestationType: 'none',
    // 같은 기기에 두 번 등록되는 것을 막기 위해, 이미 가진 패스키를 알려 준다.
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: JSON.parse(c.transports || '[]')
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    },
    timeout: CHALLENGE_TTL_SECONDS * 1000
  });

  // 질문은 화면이 아니라 서버가 들고 있는다.
  saveChallenge(options.challenge, 'registration', user ? user.id : null, user ? null : webauthnId);

  res.json({
    options,
    isNewAccount: !user,
    // 화면에서 "지금 만든 질문이 매번 다르다"를 눈으로 보게 하려고 앞 12글자만 같이 준다.
    challengePreview: options.challenge.slice(0, 12) + '…'
  });
});

app.post('/api/passkey/register/verify', async (req, res) => {
  const body = req.body || {};
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
  const nickname = (typeof body.nickname === 'string' ? body.nickname.trim() : '').slice(0, 40);
  const response = body.response;

  if (!HANDLE_RE.test(handle) || !response || typeof response !== 'object') {
    return res.status(400).json({ error: 'invalid_request', message: '요청 형식이 올바르지 않아요.' });
  }

  // 브라우저가 보내온 clientDataJSON 안의 질문을, 서버가 보관한 질문과 맞춰 본다.
  let clientChallenge = '';
  try {
    const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
    clientChallenge = clientData.challenge;
  } catch {
    return res.status(400).json({ error: 'invalid_request', message: '응답을 읽을 수 없어요.' });
  }

  const taken = consumeChallenge(clientChallenge, 'registration');
  if (!taken.ok) {
    const info = CHALLENGE_ERRORS[taken.reason];
    return res.status(info.status).json({ error: taken.reason, message: info.message });
  }

  const user = findUserByHandle(handle);
  // 질문을 만들 때의 계정과 확인할 때의 계정이 같아야 한다.
  if ((taken.row.user_id || null) !== (user ? user.id : null)) {
    return res.status(400).json({ error: 'challenge_account_mismatch', message: '질문을 받은 계정과 다른 계정이에요.' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false
    });
  } catch (err) {
    return res.status(400).json({ error: 'registration_failed', message: '등록을 확인하지 못했어요: ' + err.message });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'registration_failed', message: '등록을 확인하지 못했어요.' });
  }

  const cred = verification.registrationInfo.credential;
  const credentialId = cred.id; // base64url 문자열
  const publicKey = isoBase64URL.fromBuffer(cred.publicKey); // COSE 공개키. 비밀번호가 아니다.

  const already = db.prepare('SELECT id FROM credentials WHERE credential_id = ?').get(credentialId);
  if (already) {
    return res.status(409).json({ error: 'credential_exists', message: '이미 등록된 패스키예요.' });
  }

  let userId;
  let createdAccount = false;
  if (user) {
    userId = user.id;
  } else {
    // 질문을 만들 때 쓴 식별자를 그대로 계정에 붙인다 (기기가 그 값으로 열쇠를 만들었기 때문).
    const webauthnId = taken.row.pending_webauthn_id || crypto.randomBytes(32).toString('base64url');
    const info = db.prepare('INSERT INTO users (handle, handle_lower, webauthn_id, created_at) VALUES (?, ?, ?, ?)')
      .run(handle, handle.toLowerCase(), webauthnId, nowIso());
    userId = Number(info.lastInsertRowid);
    seedStarterItems(userId, handle);
    createdAccount = true;
  }

  const count = credentialsOf(userId).length;
  const label = nickname || `패스키 ${count + 1}`;

  db.prepare(`
    INSERT INTO credentials (user_id, credential_id, public_key, counter, transports, device_type, backed_up, nickname, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    credentialId,
    publicKey,
    Number(cred.counter || 0),
    JSON.stringify(cred.transports || []),
    verification.registrationInfo.credentialDeviceType || '',
    verification.registrationInfo.credentialBackedUp ? 1 : 0,
    label,
    nowIso()
  );

  res.status(201).json({
    registered: true,
    createdAccount,
    handle,
    passkey: {
      nickname: label,
      credentialIdPreview: credentialId.slice(0, 12) + '…',
      publicKeyPreview: publicKey.slice(0, 24) + '…'
    },
    note: '서버에 저장된 값은 공개키입니다. 개인키는 기기 밖으로 나오지 않습니다.'
  });
});

/* =========================================================
   ② 로그인 — 매번 새 질문, 저장해 둔 공개키로 서명 확인
   ========================================================= */
app.post('/api/passkey/login/options', async (req, res) => {
  const body = req.body || {};
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';

  let allowCredentials;
  if (handle) {
    const user = findUserByHandle(handle);
    const creds = user ? credentialsOf(user.id) : [];
    // 계정이 없을 때와 패스키가 없을 때의 응답을 똑같이 둔다 (누가 있는지 알려주지 않기 위해).
    if (creds.length === 0) {
      // 그래도 질문은 만들어 준다. 화면 흐름을 똑같이 두고, 확인 단계에서 거절한다.
      allowCredentials = [];
    } else {
      allowCredentials = creds.map((c) => ({
        id: c.credential_id,
        transports: JSON.parse(c.transports || '[]')
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'preferred',
    timeout: CHALLENGE_TTL_SECONDS * 1000
  });

  saveChallenge(options.challenge, 'authentication', null);

  res.json({
    options,
    challengePreview: options.challenge.slice(0, 12) + '…'
  });
});

app.post('/api/passkey/login/verify', async (req, res) => {
  const body = req.body || {};
  const response = body.response;
  if (!response || typeof response !== 'object') {
    return res.status(400).json({ error: 'invalid_request', message: '요청 형식이 올바르지 않아요.' });
  }

  let clientChallenge = '';
  try {
    const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
    clientChallenge = clientData.challenge;
  } catch {
    return res.status(400).json({ error: 'invalid_request', message: '응답을 읽을 수 없어요.' });
  }

  const taken = consumeChallenge(clientChallenge, 'authentication');
  if (!taken.ok) {
    const info = CHALLENGE_ERRORS[taken.reason];
    return res.status(info.status).json({ error: taken.reason, message: info.message });
  }

  // 어떤 패스키인지는 서버가 credential_id 로 찾는다. 화면이 "나는 누구다"라고 적어 보내도 쓰지 않는다.
  const credentialId = typeof response.id === 'string' ? response.id : '';
  const stored = db.prepare('SELECT * FROM credentials WHERE credential_id = ?').get(credentialId);
  if (!stored) {
    return res.status(401).json({ error: 'unknown_credential', message: '등록된 적 없는 패스키예요.' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      // 저장해 둔 '공개키'로 서명을 확인한다. 서버에는 개인키가 없다.
      credential: {
        id: stored.credential_id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: Number(stored.counter || 0),
        transports: JSON.parse(stored.transports || '[]')
      },
      requireUserVerification: false
    });
  } catch (err) {
    return res.status(401).json({ error: 'bad_signature', message: '서명을 확인하지 못했어요: ' + err.message });
  }

  if (!verification.verified) {
    return res.status(401).json({ error: 'bad_signature', message: '서명을 확인하지 못했어요.' });
  }

  db.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?')
    .run(Number(verification.authenticationInfo.newCounter || 0), nowIso(), stored.id);

  const user = db.prepare('SELECT id, handle FROM users WHERE id = ?').get(stored.user_id);
  const { token, expiresAt } = issueSession(user.id);

  res.json({
    user: { id: user.id, handle: user.handle },
    usedPasskey: stored.nickname,
    token,
    expiresAt,
    recognizedBy: 'session-token'
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  revokeSession(req.sessionToken); // 브라우저에서만 지우는 게 아니라 서버에서 끊는다.
  res.json({ loggedOut: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* =========================================================
   ③ 패스키 목록 / 삭제
   ========================================================= */
app.get('/api/passkeys', requireAuth, (req, res) => {
  const list = credentialsOf(req.user.id).map((c) => ({
    credentialId: c.credential_id,
    credentialIdPreview: c.credential_id.slice(0, 12) + '…',
    nickname: c.nickname,
    createdAt: c.created_at,
    lastUsedAt: c.last_used_at,
    deviceType: c.device_type,
    backedUp: !!c.backed_up
  }));
  res.json({ passkeys: list, count: list.length });
});

app.delete('/api/passkeys/:credentialId', requireAuth, (req, res) => {
  const credentialId = req.params.credentialId;
  // 내 것이 아닌 패스키는 아이디를 정확히 알아도 지울 수 없다.
  const row = db.prepare('SELECT * FROM credentials WHERE credential_id = ? AND user_id = ?')
    .get(credentialId, req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'not_found', message: '내 패스키 중에 그런 것이 없어요.' });
  }

  const remaining = credentialsOf(req.user.id).length;
  if (remaining <= 1) {
    return res.status(409).json({
      error: 'last_passkey',
      message: '마지막 패스키는 지울 수 없어요. 지우면 이 계정에는 영영 들어올 수 없게 됩니다. 새 패스키를 먼저 등록해 주세요.'
    });
  }

  db.prepare('DELETE FROM credentials WHERE id = ?').run(row.id);
  res.json({ deleted: true, nickname: row.nickname, remaining: remaining - 1 });
});

/* =========================================================
   ④ 비공개 자료 — 여기가 잠긴 자리다
   ========================================================= */
app.get('/api/private/items', requireAuth, (req, res) => {
  // req.user.id 는 세션에서 나온 값이다. ?handle= 이나 ?userId= 로 뭐라고 적어 보내든 쓰지 않는다.
  const items = db.prepare('SELECT id, category, title, body, created_at FROM private_items WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({
    owner: req.user.handle,
    count: items.length,
    items,
    ignoredHints: {
      queryHandle: req.query.handle ?? null,
      queryUserId: req.query.userId ?? null,
      headerUserHandle: req.header('X-User-Handle') ?? null,
      note: '위 값들은 받기만 하고 쓰지 않습니다. 주인은 세션 토큰으로만 정합니다.'
    }
  });
});

app.post('/api/private/items', requireAuth, (req, res) => {
  const body = req.body || {};
  const title = (typeof body.title === 'string' ? body.title.trim() : '').slice(0, 80);
  const category = (typeof body.category === 'string' ? body.category.trim() : '메모').slice(0, 20) || '메모';
  const text = (typeof body.body === 'string' ? body.body.trim() : '').slice(0, 500);
  if (!title) {
    return res.status(400).json({ error: 'invalid_request', message: '제목을 적어 주세요.' });
  }
  const info = db.prepare('INSERT INTO private_items (user_id, category, title, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, category, title, text, nowIso());
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/private/items/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM private_items WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user.id);
  if (!info.changes) {
    return res.status(404).json({ error: 'not_found', message: '내 항목 중에 그런 것이 없어요.' });
  }
  res.json({ deleted: true });
});

/* ---------------- 없는 주소 / 마지막 그물 ---------------- */
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: '그런 주소는 없어요.' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);
  res.status(500).json({ error: 'server_error', message: '서버에서 문제가 생겼어요.' });
});

app.listen(PORT, () => {
  console.log(`passkey-backend listening on :${PORT}`);
  console.log(`  RP ID          : ${RP_ID}`);
  console.log(`  허용 origin    : ${EXPECTED_ORIGINS.join(', ')}`);
  console.log(`  질문 유효시간  : ${CHALLENGE_TTL_SECONDS}초`);
});

module.exports = app;
