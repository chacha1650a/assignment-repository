require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite'); // Node 22.13+ 내장 (네이티브 빌드 불필요)
// 22.13.0 미만에서는 --experimental-sqlite 플래그가 있어야 하고, 없으면 이 줄에서 바로 죽는다.

const PORT = process.env.PORT || 3100;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'diary-auth.db');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
// 세션 토큰을 DB에 그대로 두지 않기 위한 서버 전용 비밀키. .env 에만 두고 git에는 올리지 않는다.
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET 이 비어 있습니다. .env 에 긴 랜덤 값을 넣어주세요. (없으면 인증 요청이 500으로 거절됩니다)');
}

/* ---------------- DB ---------------- */
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL,
    email_lower   TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at  TEXT NOT NULL,
    before_rule TEXT NOT NULL,
    after_rule  TEXT NOT NULL,
    reason      TEXT NOT NULL,
    based_on    TEXT NOT NULL DEFAULT ''
  );
`);

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
function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url'); // 256비트 난수
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  db.prepare(
    'INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(userId, hashToken(token), createdAt.toISOString(), expiresAt.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}
function revokeSession(token) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(nowIso(), hashToken(token));
}
function revokeAllSessions(userId) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(nowIso(), userId);
}

/* ---------------- 로그인 확인 미들웨어 ---------------- */
// 여기가 "로그인 안 했으면 아무것도 못 본다"를 만드는 단 하나의 지점이다.
function requireAuth(req, res, next) {
  if (!SESSION_SECRET) {
    return res.status(500).json({ error: 'server_misconfigured', message: '서버에 SESSION_SECRET 이 설정돼 있지 않아요.' });
  }
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
  }
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token));
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return res.status(401).json({ error: 'session_expired', message: '로그인이 만료됐어요. 다시 로그인해주세요.' });
  }
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(row.user_id);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요해요.' });
  }
  // 주소(?userId=)·헤더(X-User-Id)·본문(userId)에 뭐라고 적어 보내든 여기서 정한 값만 쓴다.
  req.user = user;
  req.sessionToken = token;
  next();
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
app.post('/api/auth/signup', (req, res) => {
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
  const exists = db.prepare('SELECT id FROM users WHERE email_lower = ?').get(emailLower);
  if (exists) {
    return res.status(409).json({ error: 'email_taken', message: '이미 가입된 이메일이에요.' });
  }

  const info = db.prepare(
    'INSERT INTO users (email, email_lower, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(email, emailLower, hashPassword(password), nowIso());
  const userId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO settings (user_id, updated_at) VALUES (?, ?)').run(userId, nowIso());

  const { token, expiresAt } = issueSession(userId);
  res.status(201).json({ user: { id: userId, email }, token, expiresAt });
});

app.post('/api/auth/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const user = db.prepare('SELECT * FROM users WHERE email_lower = ?').get(email);
  // 계정이 없을 때와 비밀번호만 틀렸을 때의 응답을 똑같이 둔다 (계정 존재 여부를 알려주지 않기 위해).
  const ok = user ? verifyPassword(password, user.password_hash) : false;
  if (!ok) {
    return res.status(401).json({ error: 'invalid_credentials', message: '이메일 또는 비밀번호가 올바르지 않아요.' });
  }

  const { token, expiresAt } = issueSession(user.id);
  res.json({ user: { id: user.id, email: user.email }, token, expiresAt });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  revokeSession(req.sessionToken); // 브라우저에서만 지우는 게 아니라 서버에서 끊는다.
  res.json({ loggedOut: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const body = req.body || {};
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (next.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '새 비밀번호는 8자 이상이어야 해요.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: '현재 비밀번호가 올바르지 않아요.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  revokeAllSessions(req.user.id); // 비밀번호를 바꾸면 이전에 발급한 토큰은 전부 끊긴다.
  res.json({ changed: true, message: '비밀번호를 바꿨어요. 모든 기기에서 다시 로그인해주세요.' });
});

/* ---------- 일기 (전부 내 것만) ---------- */
app.get('/api/entries', requireAuth, (req, res) => {
  // 목록 조회에도 반드시 user_id 조건이 붙는다. 남의 기록이 섞일 자리가 없다.
  const rows = db.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY date').all(req.user.id);
  const entries = {};
  for (const row of rows) entries[row.date] = rowToEntry(row);
  res.json({ entries });
});

function upsertEntry(userId, date, body) {
  const mood = typeof body.mood === 'string' ? body.mood : null;
  const text = typeof body.text === 'string' ? body.text : '';
  const habits = sanitizeHabits(body.habits);
  const updatedAt = nowIso();

  if (!text.trim() && !mood && habits.length === 0) {
    db.prepare('DELETE FROM entries WHERE user_id = ? AND date = ?').run(userId, date);
    return { date, deleted: true };
  }
  db.prepare(
    `INSERT INTO entries (user_id, date, mood, text, habits, updated_at)
     VALUES (@userId, @date, @mood, @text, @habits, @updatedAt)
     ON CONFLICT(user_id, date) DO UPDATE SET mood=@mood, text=@text, habits=@habits, updated_at=@updatedAt`
  ).run({ userId, date, mood, text, habits: JSON.stringify(habits), updatedAt });

  const row = db.prepare('SELECT * FROM entries WHERE user_id = ? AND date = ?').get(userId, date);
  return rowToEntry(row);
}

app.put('/api/entries/date/:date', requireAuth, (req, res) => {
  const { date } = req.params;
  if (!isValidDateKey(date)) return res.status(400).json({ error: 'invalid_date', message: '날짜 형식이 올바르지 않아요 (YYYY-MM-DD).' });
  res.json(upsertEntry(req.user.id, date, req.body || {}));
});

app.delete('/api/entries/date/:date', requireAuth, (req, res) => {
  db.prepare('DELETE FROM entries WHERE user_id = ? AND date = ?').run(req.user.id, req.params.date);
  res.json({ date: req.params.date, deleted: true });
});

// id로 한 건을 다루는 경로. 남의 id를 넣으면 "없는 것"으로 답한다(404).
// 403(있지만 안 됨)이 아니라 404를 쓰는 이유: 남의 기록 id가 존재한다는 사실조차 알려주지 않기 위해서.
function findOwnEntry(userId, id) {
  if (!/^\d+$/.test(String(id))) return null;
  return db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(Number(id), userId) || null;
}
const notFound = (res) => res.status(404).json({ error: 'not_found', message: '그런 기록이 없어요.' });

app.get('/api/entries/:id', requireAuth, (req, res) => {
  const row = findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  res.json(rowToEntry(row));
});

app.put('/api/entries/:id', requireAuth, (req, res) => {
  // 주인 확인을 먼저 하고, 통과한 뒤에만 저장한다. (거절된 요청은 DB를 전혀 건드리지 않는다)
  const row = findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  res.json(upsertEntry(req.user.id, row.date, req.body || {}));
});

app.delete('/api/entries/:id', requireAuth, (req, res) => {
  const row = findOwnEntry(req.user.id, req.params.id);
  if (!row) return notFound(res);
  db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(row.id, req.user.id);
  res.json({ id: row.id, deleted: true });
});

app.delete('/api/entries', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM entries WHERE user_id = ?').run(req.user.id);
  res.json({ deleted: Number(info.changes) });
});

/* ---------- 실험 설정 / 규칙 변경 ---------- */
app.get('/api/settings', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id)
    || { question: '', metric: '', unit: '', calc_rule: '', plan_rule: '' };
  res.json({
    question: row.question, metric: row.metric, unit: row.unit,
    calcRule: row.calc_rule, planRule: row.plan_rule
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const b = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
  db.prepare(
    `INSERT INTO settings (user_id, question, metric, unit, calc_rule, plan_rule, updated_at)
     VALUES (@userId, @question, @metric, @unit, @calcRule, @planRule, @updatedAt)
     ON CONFLICT(user_id) DO UPDATE SET question=@question, metric=@metric, unit=@unit,
       calc_rule=@calcRule, plan_rule=@planRule, updated_at=@updatedAt`
  ).run({
    userId: req.user.id, question: str(b.question), metric: str(b.metric), unit: str(b.unit),
    calcRule: str(b.calcRule), planRule: str(b.planRule), updatedAt: nowIso()
  });
  res.json({ saved: true });
});

app.get('/api/rule-changes', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM rule_changes WHERE user_id = ? ORDER BY changed_at').all(req.user.id);
  res.json({
    ruleChanges: rows.map(r => ({
      id: r.id, changedAt: r.changed_at, beforeRule: r.before_rule,
      afterRule: r.after_rule, reason: r.reason, basedOn: r.based_on
    }))
  });
});

app.post('/api/rule-changes', requireAuth, (req, res) => {
  const b = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
  const after = str(b.afterRule);
  const reason = str(b.reason);
  if (!after || !reason) {
    return res.status(400).json({ error: 'invalid_rule_change', message: '바꾼 규칙과 바꾼 이유를 모두 적어주세요.' });
  }
  const changedAt = typeof b.changedAt === 'string' && b.changedAt ? b.changedAt : nowIso();
  const info = db.prepare(
    'INSERT INTO rule_changes (user_id, changed_at, before_rule, after_rule, reason, based_on) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, changedAt, str(b.beforeRule), after, reason, str(b.basedOn));
  // 규칙을 바꾸면 지금 규칙도 같이 갱신해 둔다.
  db.prepare('UPDATE settings SET plan_rule = ?, updated_at = ? WHERE user_id = ?').run(after, nowIso(), req.user.id);
  res.status(201).json({ id: Number(info.lastInsertRowid), changedAt });
});

/* ---------- 내보내기 / 계정 삭제 ---------- */
app.get('/api/export', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY date').all(req.user.id);
  const entries = {};
  for (const row of rows) entries[row.date] = rowToEntry(row);
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id) || {};
  const ruleRows = db.prepare('SELECT * FROM rule_changes WHERE user_id = ? ORDER BY changed_at').all(req.user.id);
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
});

app.delete('/api/account', requireAuth, (req, res) => {
  // 계정을 지우면 그 계정의 일기·설정·규칙 변경·세션이 함께 지워진다 (ON DELETE CASCADE).
  const count = db.prepare('SELECT COUNT(*) AS c FROM entries WHERE user_id = ?').get(req.user.id).c;
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ deleted: true, deletedEntries: Number(count) });
});

app.use((req, res) => res.status(404).json({ error: 'not_found', message: '그런 주소가 없어요.' }));

app.listen(PORT, () => {
  console.log(`모찌 일기장 2 (로그인) 백엔드 실행 중: http://localhost:${PORT}`);
});
