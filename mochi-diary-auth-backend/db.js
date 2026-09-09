// Postgres 연결 계층. server.js는 이 모듈이 내부적으로 SQLite였는지 Postgres였는지 몰라도 되게
// get/all/run 세 함수만 쓴다 (전에 better-sqlite3 스타일 API를 흉내낸 것과 최대한 비슷하게 맞췄다).
'use strict';
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.warn('[warn] DATABASE_URL 이 비어 있습니다. Postgres 연결 문자열을 .env 에 넣어주세요.');
}

// Neon 같은 관리형 Postgres는 SSL이 필요하다. 로컬 postgres://localhost 는 보통 필요 없어서
// 연결 문자열에 sslmode=require 가 있거나 로컬이 아닌 호스트일 때만 켠다.
const useSsl = /sslmode=require/.test(DATABASE_URL) || (/^postgres(ql)?:\/\//.test(DATABASE_URL) && !/localhost|127\.0\.0\.1/.test(DATABASE_URL));

const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  // 유휴 커넥션에서 나는 에러로 프로세스 전체가 죽지 않게 한다.
  console.error('[db] 유휴 커넥션 오류', err.message);
});

// 이 프로젝트의 모든 쿼리는 '?' 자리표시자로 적혀 있다(SQLite 시절 코드를 최대한 그대로 두려고).
// Postgres는 $1, $2... 를 쓰므로 여기서만 한 번 변환한다.
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function get(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return r.rows[0] || null;
}
async function all(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return r.rows;
}
// run은 INSERT/UPDATE/DELETE용. rowCount와 (RETURNING을 붙였다면) rows를 그대로 돌려준다.
async function run(sql, params = []) {
  return pool.query(toPg(sql), params);
}

module.exports = { pool, get, all, run };
