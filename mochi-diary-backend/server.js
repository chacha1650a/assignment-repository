require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // Node 22+ 내장 모듈 (네이티브 빌드 불필요)

const PORT = process.env.PORT || 3000;
// 쉼표로 여러 키를 등록할 수 있어요 (예: 실제 사용 키,검증용 공개 키)
const API_KEYS = (process.env.API_KEY || '').split(',').map(s => s.trim()).filter(Boolean);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'diary.db');
const CURRENT_SCHEMA = 2;

/* ---------- DB ---------- */
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    date TEXT PRIMARY KEY,
    mood TEXT,
    text TEXT NOT NULL DEFAULT '',
    habits TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );
`);

/* ---------- 검증 유틸 (프론트엔드와 동일한 규칙) ---------- */
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
    mood: row.mood,
    text: row.text,
    habits: JSON.parse(row.habits || '[]'),
    updatedAt: row.updated_at
  };
}

/* ---------- 인증 (간단한 API 키) ---------- */
function requireApiKey(req, res, next) {
  if (API_KEYS.length === 0) {
    return res.status(500).json({ error: 'server_misconfigured', message: '서버에 API_KEY 환경변수가 설정돼 있지 않아요.' });
  }
  const key = req.header('X-Api-Key');
  if (!key || !API_KEYS.includes(key)) {
    return res.status(401).json({ error: 'unauthorized', message: 'API 키가 올바르지 않아요.' });
  }
  next();
}

/* ---------- 앱 ---------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/entries', requireApiKey, (req, res) => {
  const rows = db.prepare('SELECT * FROM entries').all();
  const entries = {};
  for (const row of rows) entries[row.date] = rowToEntry(row);
  res.json({ schemaVersion: CURRENT_SCHEMA, entries });
});

app.put('/api/entries/:date', requireApiKey, (req, res) => {
  const { date } = req.params;
  if (!isValidDateKey(date)) return res.status(400).json({ error: 'invalid_date', message: '날짜 형식이 올바르지 않아요 (YYYY-MM-DD).' });

  const body = req.body || {};
  const mood = typeof body.mood === 'string' ? body.mood : null;
  const text = typeof body.text === 'string' ? body.text : '';
  const habits = sanitizeHabits(body.habits);
  const updatedAt = new Date().toISOString();

  if (!text.trim() && !mood && habits.length === 0) {
    db.prepare('DELETE FROM entries WHERE date = ?').run(date);
    return res.json({ date, deleted: true });
  }

  db.prepare(
    `INSERT INTO entries (date, mood, text, habits, updated_at)
     VALUES (@date, @mood, @text, @habits, @updatedAt)
     ON CONFLICT(date) DO UPDATE SET mood=@mood, text=@text, habits=@habits, updated_at=@updatedAt`
  ).run({ date, mood, text, habits: JSON.stringify(habits), updatedAt });

  res.json({ date, mood, text, habits, updatedAt });
});

app.delete('/api/entries/:date', requireApiKey, (req, res) => {
  const { date } = req.params;
  db.prepare('DELETE FROM entries WHERE date = ?').run(date);
  res.json({ date, deleted: true });
});

app.delete('/api/entries', requireApiKey, (req, res) => {
  db.prepare('DELETE FROM entries').run();
  res.json({ deleted: 'all' });
});

app.post('/api/import', requireApiKey, (req, res) => {
  const body = req.body || {};
  const rawEntries = body.entries && typeof body.entries === 'object' ? body.entries : body;

  const rows = [];
  for (const [date, v] of Object.entries(rawEntries)) {
    if (!isValidDateKey(date)) continue;
    rows.push({
      date,
      mood: v && typeof v.mood === 'string' ? v.mood : null,
      text: v && typeof v.text === 'string' ? v.text : '',
      habits: JSON.stringify(sanitizeHabits(v && v.habits)),
      updatedAt: v && typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString()
    });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: 'no_valid_entries', message: '가져올 수 있는 유효한 날짜 기록이 없어요.' });
  }

  const insert = db.prepare(
    `INSERT INTO entries (date, mood, text, habits, updated_at)
     VALUES (@date, @mood, @text, @habits, @updatedAt)
     ON CONFLICT(date) DO UPDATE SET mood=@mood, text=@text, habits=@habits, updated_at=@updatedAt`
  );
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM entries').run();
    for (const r of rows) insert.run(r);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ imported: rows.length });
});

app.listen(PORT, () => {
  console.log(`모찌 일기장 백엔드 실행 중: http://localhost:${PORT}`);
  if (API_KEYS.length === 0) console.warn('⚠ API_KEY가 설정되지 않았어요. .env 파일을 만들어 API_KEY=원하는비밀값 을 넣어주세요.');
});
