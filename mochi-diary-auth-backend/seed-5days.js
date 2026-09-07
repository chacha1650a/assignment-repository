/* 배포한 서버의 내 계정에 5일 기록과 규칙 변경을 한 번에 넣는 스크립트.
 *
 *   DIARY_URL=https://xxxx.onrender.com DIARY_EMAIL=나의@이메일 DIARY_PASSWORD='내 비밀번호' node seed-5days.js
 *
 * 비밀번호는 코드에 적지 않고 환경변수로 받습니다. 출력에도 찍지 않습니다.
 * 계정이 없으면 만들고, 있으면 로그인합니다. 같은 날짜가 이미 있으면 덮어씁니다.
 */
const BASE = (process.env.DIARY_URL || 'http://localhost:3100').replace(/\/$/, '');
const EMAIL = process.env.DIARY_EMAIL;
const PASSWORD = process.env.DIARY_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('DIARY_EMAIL 과 DIARY_PASSWORD 를 환경변수로 넣어주세요.');
  process.exit(1);
}

// 1일차에 한 번 정하고 그 뒤로 바꾸지 않는 값들
const SETTINGS = {
  question: '공부를 아침에 시작하면 하루 공부 시간이 늘어날까?',
  metric: '공부',
  unit: '분',
  calcRule: "그날 기록 중 '공부' 항목의 값을 모두 더해 하루 값으로 본다",
  planRule: '저녁을 먹은 뒤에 공부를 시작한다'
};

const DAYS = [
  { date: '2026-09-01', mood: 'soso',  value: 40, text: '1일차. 저녁 먹고 시작하려다 계속 미뤄서 밤 10시에 겨우 앉았다.' },
  { date: '2026-09-02', mood: 'sad',   value: 25, text: '2일차. 또 저녁 뒤로 미뤘고 졸려서 금방 접었다. 이틀 다 목표 60분에 못 미쳤다.' },
  { date: '2026-09-03', mood: 'good',  value: 75, text: '3일차. 아침에 일어나자마자 앉았더니 오히려 오래 갔다.' },
  { date: '2026-09-04', mood: 'great', value: 90, text: '4일차. 아침에 바로 시작. 오늘이 제일 길었다.' },
  { date: '2026-09-05', mood: 'good',  value: 55, text: '5일차. 아침에 약속이 있어 늦게 시작했지만 그래도 앞 이틀보다는 길었다.' }
];

// 2일차 기록 뒤 · 3일차 기록 앞
const RULE_CHANGE = {
  changedAt: '2026-09-02T13:10:00.000Z', // 2026-09-02 22:10 (KST)
  beforeRule: '저녁을 먹은 뒤에 공부를 시작한다',
  afterRule: '아침에 일어나자마자 공부를 시작한다',
  reason: '1일차·2일차 모두 저녁으로 미루다가 목표 60분을 못 채웠다. 시작 시각만 바꿔서 하루 공부 시간이 달라지는지 보려고.',
  basedOn: '1일차(2026-09-01) 40분, 2일차(2026-09-02) 25분 기록'
};

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

(async () => {
  console.log('서버:', BASE);
  console.log('(무료 서버가 잠들어 있으면 첫 요청에 30~60초 걸릴 수 있습니다)');

  let r = await call('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (r.status === 401) {
    console.log('계정이 없어 새로 만듭니다...');
    r = await call('POST', '/api/auth/signup', { body: { email: EMAIL, password: PASSWORD } });
  }
  if (!r.json || !r.json.token) {
    console.error('로그인/가입 실패:', r.status, r.json && r.json.message);
    process.exit(1);
  }
  const token = r.json.token;
  console.log('로그인 성공:', r.json.user.email);

  await call('PUT', '/api/settings', { token, body: SETTINGS });
  console.log('실험 설정 저장 완료');

  for (const d of DAYS.slice(0, 2)) {
    await call('PUT', `/api/entries/date/${d.date}`, {
      token, body: { mood: d.mood, text: d.text, habits: [{ item: SETTINGS.metric, value: d.value, unit: SETTINGS.unit }] }
    });
    console.log('기록 저장:', d.date, d.value + SETTINGS.unit);
  }

  const existing = await call('GET', '/api/rule-changes', { token });
  if (!existing.json.ruleChanges || existing.json.ruleChanges.length === 0) {
    await call('POST', '/api/rule-changes', { token, body: RULE_CHANGE });
    console.log('규칙 변경 기록:', RULE_CHANGE.changedAt, '(2일차 뒤 · 3일차 앞)');
  } else {
    console.log('규칙 변경 기록이 이미 있어 건너뜁니다.');
  }

  for (const d of DAYS.slice(2)) {
    await call('PUT', `/api/entries/date/${d.date}`, {
      token, body: { mood: d.mood, text: d.text, habits: [{ item: SETTINGS.metric, value: d.value, unit: SETTINGS.unit }] }
    });
    console.log('기록 저장:', d.date, d.value + SETTINGS.unit);
  }

  const list = await call('GET', '/api/entries', { token });
  const total = DAYS.reduce((a, d) => a + d.value, 0);
  console.log(`\n완료 — 내 계정 안에 ${Object.keys(list.json.entries).length}일치 기록.`);
  console.log(`합계 ${total}${SETTINGS.unit}, 평균 ${Math.round(total / DAYS.length * 100) / 100}${SETTINGS.unit}`);
  console.log('브라우저에서 로그인해 화면의 합계·평균과 맞는지 확인해보세요.');
})().catch(e => { console.error(e.message); process.exit(1); });
