require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db'); // Postgres (node-postgres). 예전엔 node:sqlite였는데,
// Render 무료 플랜의 디스크가 재시작 때마다 초기화되는 걸 확인하고 관리형 Postgres(Neon 등)로 옮겼다.

const PORT = process.env.PORT || 3100;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
// 세션 토큰을 DB에 그대로 두지 않기 위한 서버 전용 비밀키. .env 에만 두고 git에는 올리지 않는다.
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET 이 비어 있습니다. .env 에 긴 랜덤 값을 넣어주세요. (없으면 인증 요청이 500으로 거절됩니다)');
}

/* ---------------- DB 스키마 ---------------- */
async function initDb() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL,
      email_lower   TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      revoked_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS entries (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      mood       TEXT,
      text       TEXT NOT NULL DEFAULT '',
      habits     TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      question   TEXT NOT NULL DEFAULT '',
      metric     TEXT NOT NULL DEFAULT '',
      unit       TEXT NOT NULL DEFAULT '',
      calc_rule  TEXT NOT NULL DEFAULT '',
      plan_rule  TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rule_changes (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      changed_at  TEXT NOT NULL,
      before_rule TEXT NOT NULL,
      after_rule  TEXT NOT NULL,
      reason      TEXT NOT NULL,
      based_on    TEXT NOT NULL DEFAULT ''
    );
  `);
}

/* ---------------- 공용 유틸 ---------------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateKey(key) {
  if (typeof key !== 'string' || !DATE_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function genId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
function sanitizeHabits(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const h of list) {
    if (!h || typeof h.item !== 'string' || !h.item.trim()) continue;
    const value = Number(h.value);
    if (!Number.isFinite(value)) continue;
    out.push({
      id: typeof h.id === 'string' && h.id ? h.id : genId(),
      item: h.item.trim().slice(0, 20),
      value,
      unit: typeof h.unit === 'string' ? h.unit.trim().slice(0, 10) : ''
    });
  }
  return out;
}
function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    mood: row.mood,
    text: row.text,
    habits: JSON.parse(row.habits || '[]'),
    updatedAt: row.updated_at
  };
}
const nowIso = () => new Date().toISOString();

// 비동기 라우트 핸들러의 예외를 express 에러 핸들러로 넘긴다.
// (예전 better-sqlite3는 동기라 try/catch만으로 됐지만, pg는 전부 Promise라 이게 없으면
//  DB 오류가 나도 요청이 응답 없이 멈춰버린다.)
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- 비밀번호 (bcryptjs) ---------------- */
// 평문 비밀번호는 어디에도 저장하지 않고, 로그로도 남기지 않는다.
function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS); // salt는 bcrypt가 계정마다 자동 생성
}
function verifyPassword(plain, hash) {
  try { return bcrypt.compareSync(plain, hash); }
  catch (e) { return false; }
}

/* ---------------- 세션 토큰 ---------------- */
// 토큰 원문은 발급 순간에만 존재하고, DB에는 HMAC-SHA256(토큰, SESSION_SECRET) 만 저장한다.
// -> DB가 통째로 유출돼도 그 값만으로는 로그인할 수 없다.
function hashToken(token) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}
async function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url'); // 256비트 난수
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  await db.run(
    'INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [userId, hashToken(token), createdAt.toISOString(), expiresAt.toISOString()]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}
async function revokeSession(token) {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [nowIso(), hashToken(token)]);
}
async function revokeAllSessions(userId) {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]);
}

/* ---------------- 로그인 확인 미들웨어 ---------------- */
// 여기가 "로그인 안 했으면 아무것도 못 본다"를 만드는 단 하나의 지점이다.
async function requireAuth(req, res, next) {
  try {
    if (!SESSION_SECRET) {
      return res.status(500).json({ error: 'server_misconfigured', message: '서버에 SESSION_SECRET 이 설정돼 있지 않아요.' });
    }
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
    }
    const row = await db.get('SELECT * FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    if (!row || row.revoked_at) {
      return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: 'session_expired', message: '로그인이 만료됐어요. 다시 로그인해주세요.' });
    }
    const user = await db.get('SELECT id, email FROM users WHERE id = ?', [row.user_id]);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
    }
    // 주소(?userId=)·헤더(X-User-Id)·본문(userId)에 뭐라고 적어 보내든 여기서 정한 값만 쓴다.
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) { next(err); }
}

/* ---------------- 앱 ---------------- */
const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id']
}));
app.use(express.json({ limit: '1mb' }));

// 요청 로그: 경로/상태만 남기고 본문(비밀번호·토큰)은 절대 남기지 않는다.
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} -> ${res.statusCode}`);
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------- 가입 / 로그인 / 로그아웃 ---------- */
app.post('/api/auth/signup', ah(async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: '이메일 형식이 올바르지 않아요.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '비밀번호는 8자 이상이어야 해요.' });
  }

  const emailLower = email.toLowerCase();
  const exists = await db.get('SELECT id FROM users WHERE email_lower = ?', [emailLower]);
  if (exists) {
    return res.status(409).json({ error: 'email_taken', message: '이미 가입된 이메일이에요.' });
  }

  const inserted = await db.get(
    'INSERT INTO users (email, email_lower, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id',
    [email, emailLower, hashPassword(password), nowIso()]
  );
  const userId = inserted.id;
  await db.run('INSERT INTO settings (user_id, updated_at) VALUES (?, ?)', [userId, nowIso()]);

  const { token, expiresAt } = await issueSession(userId);
  res.status(201).json({ user: { id: userId, email }, token, expiresAt });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const user = await db.get('SELECT * FROM users WHERE email_lower = ?', [email]);
  // 계정이 없을 때와 비밀번호만 틀렸을 때의 응답을 똑같이 둔다 (계정 존재 여부를 알려주지 않기 위해).
  const ok = user ? verifyPassword(password, user.password_hash) : false;
  if (!ok) {
    return res.status(401).json({ error: 'invalid_credentials', message: '이메일 또는 비밀번호가 올바르지 않아요.' });
  }

  const { token, expiresAt } = await issueSession(user.id);
  res.json({ user: { id: user.id, email: user.email }, token, expiresAt });
}));

app.post('/api/auth/logout', requireAuth, ah(async (req, res) => {
  await revokeSession(req.sessionToken); // 브라우저에서만 지우는 게 아니라 서버에서 끊는다.
  res.json({ loggedOut: true });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', requireAuth, ah(async (req, res) => {
  const body = req.body || {};
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (next.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '새 비밀번호는 8자 이상이어야 해요.' });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: '현재 비밀번호가 올바르지 않아요.' });
  }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), req.user.id]);
  await revokeAllSessions(req.user.id); // 비밀번호를 바꾸면 이전에 발급한 토큰은 전부 끊긴다.
  res.json({ changed: true, message: '비밀번호를 바꿨어요. 모든 기기에서 다시 로그인해주세요.' });
}));

/* ---------- 일기 (전부 내 것만) ---------- */
app.get('/api/entries', requireAuth, ah(async (req, res) => {
  // 목록 조회에도 반드시 user_id 조건이 붙는다. 남의 기록이 섞일 자리가 없다.
  const rows = await db.all('SELECT * FROM entries WHERE user_id = ? ORDER BY date', [req.user.id]);
  const entries = {};
  for (const row of rows) entries[row.date] = rowToEntry(row);
  res.json({ entries });
}));

async function upsertEntry(userId, date, body) {
  const mood = typeof body.mood === 'string' ? body.mood : null;
  const text = typeof body.text === 'string' ? body.text : '';
  const habits = sanitizeHabits(body.habits);
  const updatedAt = nowIso();

  if (!text.trim() && !mood && habits.length === 0) {
    await db.run('DELETE FROM entries WHERE user_id = ? AND date = ?', [userId, date]);
    return { date, deleted: true };
  }
  await db.run(
    `INSERT INTO entries (user_id, date, mood, text, habits, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET mood=EXCLUDED.mood, text=EXCLUDED.text,
       habits=EXCLUDED.habits, updated_at=EXCLUDED.updated_at`,
    [userId, date, mood, text, JSON.stringify(habits), updatedAt]
  );

  const row = await db.get('SELECT * FROM entries WHERE user_id = ? AND date = ?', [userId, date]);
  return rowToEntry(row);
}

app.put('/api/entries/date/:date', requireAuth, ah(async (req, res) => {
  const { date } = req.params;
  if (!isValidDateKey(date)) return res.status(400).json({ error: 'invalid_date', message: '날짜 형식이 올바르지 않아요 (YYYY-MM-DD).' });
  res.json(await upsertEntry(req.user.id, date, req.body || {}));
}));

app.delete('/api/entries/date/:date', requireAuth, ah(async (req, res) => {
  await db.run('DELETE FROM entries WHERE user_id = ? AND date = ?', [req.user.id, req.params.date]);
  res.json({ date: req.params.date, deleted: true });
}));

// id로 한 건을 다루는 경로. 남의 id를 넣으면 "없는 것"으로 답한다(404).
// 403(있지만 안 됨)이 아니라 404를 쓰는 이유: 남의 기록 id가 존재한다는 사실조차 알려주지 않기 위해서.
async function findOwnEntry(userId, id) {
  if (!/^\d+$/.test(String(id))) return null;
  return (await db.get('SELECT * FROM entries WHERE id = ? AND user_id = ?', [Number(id), userId])) || null;
}
const notFound = (res) => res.status(404).json({ error: 'not_found', message: '그런 기록이 없어요.' });

app.get('/api/entries/:id', requireAuth, ah(async (req, res) => {
  const row = await findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  res.json(rowToEntry(row));
}));

app.put('/api/entries/:id', requireAuth, ah(async (req, res) => {
  // 주인 확인을 먼저 하고, 통과한 뒤에만 저장한다. (거절된 요청은 DB를 전혀 건드리지 않는다)
  const row = await findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  res.json(await upsertEntry(req.user.id, row.date, req.body || {}));
}));

app.delete('/api/entries/:id', requireAuth, ah(async (req, res) => {
  const row = await findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  await db.run('DELETE FROM entries WHERE id = ? AND user_id = ?', [row.id, req.user.id]);
  res.json({ id: row.id, deleted: true });
}));

app.delete('/api/entries', requireAuth, ah(async (req, res) => {
  const r = await db.run('DELETE FROM entries WHERE user_id = ?', [req.user.id]);
  res.json({ deleted: Number(r.rowCount) });
}));

/* ---------- 실험 설정 / 규칙 변경 ---------- */
app.get('/api/settings', requireAuth, ah(async (req, res) => {
  const row = (await db.get('SELECT * FROM settings WHERE user_id = ?', [req.user.id]))
    || { question: '', metric: '', unit: '', calc_rule: '', plan_rule: '' };
  res.json({
    question: row.question, metric: row.metric, unit: row.unit,
    calcRule: row.calc_rule, planRule: row.plan_rule
  });
}));

app.put('/api/settings', requireAuth, ah(async (req, res) => {
  const b = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
  await db.run(
    `INSERT INTO settings (user_id, question, metric, unit, calc_rule, plan_rule, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET question=EXCLUDED.question, metric=EXCLUDED.metric,
       unit=EXCLUDED.unit, calc_rule=EXCLUDED.calc_rule, plan_rule=EXCLUDED.plan_rule,
       updated_at=EXCLUDED.updated_at`,
    [req.user.id, str(b.question), str(b.metric), str(b.unit), str(b.calcRule), str(b.planRule), nowIso()]
  );
  res.json({ saved: true });
}));

app.get('/api/rule-changes', requireAuth, ah(async (req, res) => {
  const rows = await db.all('SELECT * FROM rule_changes WHERE user_id = ? ORDER BY changed_at', [req.user.id]);
  res.json({
    ruleChanges: rows.map(r => ({
      id: r.id, changedAt: r.changed_at, beforeRule: r.before_rule,
      afterRule: r.after_rule, reason: r.reason, basedOn: r.based_on
    }))
  });
}));

app.post('/api/rule-changes', requireAuth, ah(async (req, res) => {
  const b = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
  const after = str(b.afterRule);
  const reason = str(b.reason);
  if (!after || !reason) {
    return res.status(400).json({ error: 'invalid_rule_change', message: '바꾼 규칙과 바꾼 이유를 모두 적어주세요.' });
  }
  const changedAt = typeof b.changedAt === 'string' && b.changedAt ? b.changedAt : nowIso();
  const inserted = await db.get(
    'INSERT INTO rule_changes (user_id, changed_at, before_rule, after_rule, reason, based_on) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [req.user.id, changedAt, str(b.beforeRule), after, reason, str(b.basedOn)]
  );
  // 규칙을 바꾸면 지금 규칙도 같이 갱신해 둔다.
  await db.run('UPDATE settings SET plan_rule = ?, updated_at = ? WHERE user_id = ?', [after, nowIso(), req.user.id]);
  res.status(201).json({ id: inserted.id, changedAt });
}));

/* ---------- 내보내기 / 계정 삭제 ---------- */
app.get('/api/export', requireAuth, ah(async (req, res) => {
  const rows = await db.all('SELECT * FROM entries WHERE user_id = ? ORDER BY date', [req.user.id]);
  const entries = {};
  for (const row of rows) entries[row.date] = rowToEntry(row);
  const settings = (await db.get('SELECT * FROM settings WHERE user_id = ?', [req.user.id])) || {};
  const ruleRows = await db.all('SELECT * FROM rule_changes WHERE user_id = ? ORDER BY changed_at', [req.user.id]);
  res.json({
    exportedAt: nowIso(),
    account: { email: req.user.email }, // 비밀번호 해시·토큰은 내보내기에 넣지 않는다.
    settings: {
      question: settings.question || '', metric: settings.metric || '', unit: settings.unit || '',
      calcRule: settings.calc_rule || '', planRule: settings.plan_rule || ''
    },
    ruleChanges: ruleRows.map(r => ({
      changedAt: r.changed_at, beforeRule: r.before_rule, afterRule: r.after_rule, reason: r.reason, basedOn: r.based_on
    })),
    entries
  });
}));

app.delete('/api/account', requireAuth, ah(async (req, res) => {
  // 계정을 지우면 그 계정의 일기·설정·규칙 변경·세션이 함께 지워진다 (ON DELETE CASCADE).
  const countRow = await db.get('SELECT COUNT(*) AS c FROM entries WHERE user_id = ?', [req.user.id]);
  await db.run('DELETE FROM users WHERE id = ?', [req.user.id]);
  res.json({ deleted: true, deletedEntries: Number(countRow.c) });
}));

app.use((req, res) => res.status(404).json({ error: 'not_found', message: '그런 주소가 없어요.' }));

// 마지막 안전망: 위에서 놓친 예외(주로 DB 연결 오류)는 500으로 답하고 로그만 남긴다.
// (비밀번호·토큰이 든 요청 본문은 여기서도 찍지 않는다.)
app.use((err, req, res, next) => {
  console.error(`${new Date().toISOString()} ${req.method} ${req.path} 처리 중 오류`, err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal_error', message: '서버에 문제가 생겼어요. 잠시 뒤 다시 시도해주세요.' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`모찌 일기장 2 (로그인) 백엔드 실행 중: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패 — DATABASE_URL 을 확인해주세요.', err);
    process.exit(1);
  });
