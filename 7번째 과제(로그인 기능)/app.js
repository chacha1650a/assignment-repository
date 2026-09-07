(() => {
'use strict';

/* =========================================================================
   모찌의 일기장 2 — 로그인이 붙은 버전
   6번째 과제(다이어리)의 script.js를 이어받아, 저장소를 "브라우저/공용 서버"에서
   "내 계정 전용 서버"로 바꾼 것이 가장 큰 변화입니다.
   ========================================================================= */

// 배포한 인증 백엔드 주소. 다른 곳에 배포했다면 로그인 화면의 "서버 주소 바꾸기"에서 바꿀 수 있어요.
const DEFAULT_API_BASE = 'https://mochi-diary-auth-backend.onrender.com';
const API_BASE_KEY = 'mochiDiary2.apiBase';
const TOKEN_KEY = 'mochiDiary2.token';

function getApiBase(){
  try { return (localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE).replace(/\/$/, ''); }
  catch (e) { return DEFAULT_API_BASE; }
}
function getToken(){
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}
function setToken(t){
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

/* ---------- 서버 호출 ----------
   사람을 알아보는 값(토큰)은 항상 Authorization 헤더로만 보낸다.
   주소(URL)에는 절대 싣지 않는다 — 주소는 기록·공유·로그에 그대로 남기 때문에. */
async function api(path, options){
  options = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(getApiBase() + path, Object.assign({}, options, { headers }));
  } catch (e) {
    const err = new Error('서버에 연결할 수 없어요. 잠시 뒤 다시 시도해주세요.');
    err.network = true;
    throw err;
  }

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }

  if (!res.ok){
    const err = new Error((body && body.message) || `서버 오류 (${res.status})`);
    err.status = res.status;
    err.code = body && body.error;
    throw err;
  }
  return body;
}

/* ---------- 공용 유틸 (6번 과제와 같은 규칙) ---------- */
const DOW = ['일','월','화','수','목','금','토'];
const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const keyToDate = (key) => { const [y,m,d] = key.split('-').map(Number); return new Date(y, m-1, d); };
const startOfDay = (d) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
const todayDate = () => startOfDay(new Date());
const todayKey = () => dateKey(todayDate());
const roundNum = (n) => Math.round(n * 100) / 100;   // 소수 셋째 자리에서 반올림

function isValidDateKey(key){
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y,m,d] = key.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d;
}
function genId(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

/* ---------- 상태 ---------- */
const today = todayDate();
let me = null;             // 로그인한 사람 { id, email }
let entries = {};          // 내 일기만 담긴다
let settings = { question:'', metric:'', unit:'', calcRule:'', planRule:'' };
let ruleChanges = [];
let selectedKey = todayKey();
let calYear = today.getFullYear();
let calMonth = today.getMonth();

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const authView = $('authView');
const appView = $('appView');
const tabLogin = $('tabLogin');
const tabSignup = $('tabSignup');
const authForm = $('authForm');
const authEmail = $('authEmail');
const authPassword = $('authPassword');
const authSubmit = $('authSubmit');
const authMsg = $('authMsg');
const signupHint = $('signupHint');
const serverUrlInput = $('serverUrl');
const serverSaveBtn = $('serverSaveBtn');
const serverResetBtn = $('serverResetBtn');
const serverStatus = $('serverStatus');

const topToday = $('topToday');
const whoAmI = $('whoAmI');
const logoutBtn = $('logoutBtn');
const dataStatus = $('dataStatus');
const dataError = $('dataError');
const exportBtn = $('exportBtn');
const pwBtn = $('pwBtn');
const pwPanel = $('pwPanel');
const pwCurrent = $('pwCurrent');
const pwNew = $('pwNew');
const pwSaveBtn = $('pwSaveBtn');
const pwStatus = $('pwStatus');
const deleteAccountBtn = $('deleteAccountBtn');

const ddayLabel = $('ddayLabel');
const ddayNum = $('ddayNum');
const ddaySub = $('ddaySub');

const setupToggle = $('setupToggle');
const setupBody = $('setupBody');
const setupSummary = $('setupSummary');
const cfgQuestion = $('cfgQuestion');
const cfgMetric = $('cfgMetric');
const cfgUnit = $('cfgUnit');
const cfgCalcRule = $('cfgCalcRule');
const cfgPlanRule = $('cfgPlanRule');
const cfgSaveBtn = $('cfgSaveBtn');
const cfgStatus = $('cfgStatus');

const calLabel = $('calLabel');
const calGrid = $('calGrid');
const calPrev = $('calPrev');
const calNext = $('calNext');
const editorDate = $('editorDate');
const dayPrev = $('dayPrev');
const dayNext = $('dayNext');
const jumpToday = $('jumpToday');
const moodPicker = $('moodPicker');
const entryText = $('entryText');
const saveHint = $('saveHint');
const saveBtn = $('saveBtn');
const deleteBtn = $('deleteBtn');
const habitItemInput = $('habitItem');
const habitValueInput = $('habitValue');
const habitUnitInput = $('habitUnit');
const habitAddBtn = $('habitAddBtn');
const habitError = $('habitError');
const habitList = $('habitList');

const metricPeriod = $('metricPeriod');
const metricBody = $('metricBody');
const metricTable = $('metricTable');
const weekPeriod = $('weekPeriod');
const weekBody = $('weekBody');

const ruleToggle = $('ruleToggle');
const ruleForm = $('ruleForm');
const ruleBefore = $('ruleBefore');
const ruleAfter = $('ruleAfter');
const ruleReason = $('ruleReason');
const ruleBasedOn = $('ruleBasedOn');
const ruleSaveBtn = $('ruleSaveBtn');
const ruleStatus = $('ruleStatus');
const ruleList = $('ruleList');

const mochiBubble = $('mochiBubble');
const mochiBubbleText = $('mochiBubbleText');

/* =========================================================================
   로그인 화면
   ========================================================================= */
let authMode = 'login';

function setAuthMode(mode){
  authMode = mode;
  tabLogin.classList.toggle('active', mode === 'login');
  tabSignup.classList.toggle('active', mode === 'signup');
  authSubmit.textContent = mode === 'login' ? '로그인' : '가입하고 시작하기';
  authPassword.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  signupHint.hidden = mode !== 'signup';
  authMsg.textContent = '';
  authMsg.className = 'auth-msg';
}
tabLogin.addEventListener('click', () => setAuthMode('login'));
tabSignup.addEventListener('click', () => setAuthMode('signup'));

function showAuthMsg(text, ok){
  authMsg.textContent = text;
  authMsg.className = 'auth-msg ' + (ok ? 'ok' : 'err');
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password){ showAuthMsg('이메일과 비밀번호를 모두 입력해주세요.', false); return; }

  authSubmit.disabled = true;
  showAuthMsg(authMode === 'login' ? '로그인 중...' : '가입 중...', true);
  try {
    const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const data = await api(path, { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(data.token);
    // 비밀번호는 변수에서도 즉시 지운다 (화면에도 남기지 않는다)
    authPassword.value = '';
    me = data.user;
    await enterApp();
  } catch (err){
    showAuthMsg(err.message, false);
  } finally {
    authSubmit.disabled = false;
  }
});

/* 서버 주소 바꾸기 */
serverUrlInput.value = getApiBase();
serverSaveBtn.addEventListener('click', () => {
  const v = serverUrlInput.value.trim().replace(/\/$/, '');
  if (!v){ serverStatus.textContent = '주소를 입력해주세요.'; return; }
  try { localStorage.setItem(API_BASE_KEY, v); } catch (e) {}
  serverStatus.textContent = '저장했어요: ' + v;
});
serverResetBtn.addEventListener('click', () => {
  try { localStorage.removeItem(API_BASE_KEY); } catch (e) {}
  serverUrlInput.value = DEFAULT_API_BASE;
  serverStatus.textContent = '기본 주소로 되돌렸어요.';
});

/* =========================================================================
   화면 전환
   ========================================================================= */
function showLogin(message){
  me = null;
  entries = {};
  ruleChanges = [];
  settings = { question:'', metric:'', unit:'', calcRule:'', planRule:'' };
  selectedKey = todayKey();
  appView.hidden = true;
  authView.hidden = false;
  whoAmI.textContent = '';
  dataStatus.textContent = '';
  // 화면을 가리는 것만으로는 부족하다. 앞사람의 기록이 숨겨진 채로 DOM에 남아 있으면
  // 개발자 도구로 읽을 수 있으므로, 비운 상태로 다시 그려서 실제로 지운다.
  try { renderAll(); } catch (e) {}
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (message) showAuthMsg(message, false);
}

async function enterApp(){
  authView.hidden = true;
  appView.hidden = false;
  location.hash = '#/diary';
  whoAmI.textContent = me.email;
  topToday.textContent = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일 (${DOW[today.getDay()]})`;
  await loadAll();
}

// 서버가 401을 주면(로그아웃·만료·위조) 무조건 로그인 화면으로 돌려보낸다.
async function guard(fn){
  try { await fn(); }
  catch (err){
    if (err.status === 401){
      setToken('');
      showLogin(err.code === 'session_expired'
        ? '로그인이 만료됐어요. 다시 로그인해주세요.'
        : '로그인이 필요해요.');
      return;
    }
    throw err;
  }
}

async function loadAll(){
  await guard(async () => {
    const [entryData, settingData, ruleData] = await Promise.all([
      api('/api/entries'),
      api('/api/settings'),
      api('/api/rule-changes')
    ]);
    entries = entryData.entries || {};
    settings = settingData || settings;
    ruleChanges = (ruleData && ruleData.ruleChanges) || [];
    renderAll();
  });
}

function renderAll(){
  renderSetup();
  renderDDay();
  renderCalendar();
  renderEditor();
  renderMetric();
  renderWeek();
  renderRuleChanges();
}

/* =========================================================================
   로그아웃 / 비밀번호 변경 / 계정 삭제 / 내보내기
   ========================================================================= */
logoutBtn.addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); }
  catch (e) { /* 서버가 이미 끊었어도 아래에서 브라우저 쪽을 정리한다 */ }
  setToken('');
  showLogin('로그아웃했어요.');
});

pwBtn.addEventListener('click', () => { pwPanel.hidden = !pwPanel.hidden; pwStatus.textContent = ''; });

pwSaveBtn.addEventListener('click', async () => {
  const currentPassword = pwCurrent.value;
  const newPassword = pwNew.value;
  if (!currentPassword || !newPassword){ pwStatus.textContent = '두 칸을 모두 채워주세요.'; return; }
  try {
    const r = await api('/api/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword })
    });
    pwCurrent.value = ''; pwNew.value = '';
    setToken(''); // 비밀번호를 바꾸면 서버가 이전 토큰을 전부 끊으므로 다시 로그인해야 한다
    showLogin(r.message);
  } catch (err){
    pwStatus.textContent = err.message;
  }
});

exportBtn.addEventListener('click', async () => {
  clearDataError();
  await guard(async () => {
    const data = await api('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mochi-diary2-${me.email.split('@')[0]}-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    dataStatus.textContent = '내보내기 완료 (다운로드 폴더 확인)';
  });
});

deleteAccountBtn.addEventListener('click', async () => {
  if (!confirm('계정을 지우면 이 계정의 일기·습관 기록·규칙 변경 기록이 함께 영구 삭제돼요. 되돌릴 수 없어요. 계속할까요?')) return;
  if (!confirm('정말 지울까요? 먼저 [내보내기]로 백업을 받아두는 걸 권해요.')) return;
  await guard(async () => {
    const r = await api('/api/account', { method: 'DELETE' });
    setToken('');
    showLogin(`계정과 일기 ${r.deletedEntries}건을 모두 지웠어요.`);
  });
});

function showDataError(msg){ dataError.textContent = msg; dataError.classList.add('show'); }
function clearDataError(){ dataError.textContent = ''; dataError.classList.remove('show'); }

/* =========================================================================
   실험 설정 (1일차에 한 번 정하고 그대로 둔다)
   ========================================================================= */
setupToggle.addEventListener('click', () => {
  setupBody.hidden = !setupBody.hidden;
  setupToggle.textContent = setupBody.hidden ? '펼치기' : '접기';
});

function renderSetup(){
  cfgQuestion.value = settings.question || '';
  cfgMetric.value = settings.metric || '';
  cfgUnit.value = settings.unit || '';
  cfgCalcRule.value = settings.calcRule || '';
  cfgPlanRule.value = settings.planRule || '';

  setupSummary.innerHTML = '';
  if (!settings.question && !settings.metric){
    const p = document.createElement('div');
    p.className = 'week-empty';
    p.textContent = '아직 실험 설정이 없어요. [펼치기]를 눌러 질문·지표·단위·계산 규칙·계획 규칙을 한 번만 정해주세요.';
    setupSummary.appendChild(p);
    return;
  }
  const rows = [
    ['질문', settings.question],
    ['지표', settings.metric],
    ['단위', settings.unit],
    ['계산 규칙', settings.calcRule],
    ['지금의 계획 규칙', settings.planRule]
  ];
  for (const [k, v] of rows){
    if (!v) continue;
    const div = document.createElement('div');
    div.className = 'setup-line';
    const b = document.createElement('b');
    b.textContent = k + ' ';
    const s = document.createElement('span');
    s.textContent = v;
    div.appendChild(b); div.appendChild(s);
    setupSummary.appendChild(div);
  }
}

cfgSaveBtn.addEventListener('click', async () => {
  await guard(async () => {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        question: cfgQuestion.value, metric: cfgMetric.value, unit: cfgUnit.value,
        calcRule: cfgCalcRule.value, planRule: cfgPlanRule.value
      })
    });
    settings = await api('/api/settings');
    cfgStatus.textContent = '저장했어요.';
    renderSetup();
    renderMetric();
  });
});

/* =========================================================================
   D-Day / 달력 / 에디터 / 습관  (6번 과제 코드를 그대로 이어받고, 저장만 서버로 바꿈)
   ========================================================================= */
function renderDDay(){
  const keys = Object.keys(entries).sort();
  if (keys.length === 0){
    ddayLabel.textContent = '첫 일기를 써보세요';
    ddayNum.textContent = '';
    ddaySub.textContent = '';
    return;
  }
  const firstDate = keyToDate(keys[0]);
  const diffDays = Math.round((today - firstDate) / 86400000) + 1;
  ddayLabel.textContent = '모찌와 함께한 지';
  ddayNum.textContent = `D+${diffDays}`;
  ddaySub.textContent = `${firstDate.getFullYear()}.${firstDate.getMonth()+1}.${firstDate.getDate()}부터`;
}

function renderCalendar(){
  calLabel.textContent = `${calYear}년 ${calMonth+1}월`;
  calGrid.innerHTML = '';

  DOW.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = w;
    calGrid.appendChild(el);
  });

  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();

  for (let i=0; i<firstDow; i++){
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    calGrid.appendChild(el);
  }
  for (let day=1; day<=daysInMonth; day++){
    const d = new Date(calYear, calMonth, day);
    const key = dateKey(d);
    const el = document.createElement('div');
    el.className = 'cal-day';
    if (key === todayKey()) el.classList.add('today');
    if (key === selectedKey) el.classList.add('selected');
    if (d.getTime() > today.getTime()) el.classList.add('future');

    const label = document.createElement('span');
    label.textContent = String(day);
    el.appendChild(label);

    if (entries[key]){
      const dot = document.createElement('span');
      dot.className = 'dot';
      el.appendChild(dot);
    }
    el.addEventListener('click', () => selectDate(key));
    calGrid.appendChild(el);
  }
}
calPrev.addEventListener('click', () => {
  calMonth--; if (calMonth < 0){ calMonth = 11; calYear--; }
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calMonth++; if (calMonth > 11){ calMonth = 0; calYear++; }
  renderCalendar();
});

let currentMood = null;
let entryOpBusy = false;
async function withEntryLock(fn){
  if (entryOpBusy) return;
  entryOpBusy = true;
  try { await fn(); } finally { entryOpBusy = false; }
}

function renderEditor(){
  const d = keyToDate(selectedKey);
  editorDate.textContent = `${d.getMonth()+1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
  const entry = entries[selectedKey];
  currentMood = entry ? entry.mood : null;
  entryText.value = entry ? entry.text : '';
  saveHint.textContent = '';
  [...moodPicker.children].forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mood === currentMood);
  });
  renderHabitList();
}

moodPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.mood-btn');
  if (!btn) return;
  currentMood = (currentMood === btn.dataset.mood) ? null : btn.dataset.mood;
  [...moodPicker.children].forEach((b) => b.classList.toggle('active', b.dataset.mood === currentMood));
});

function selectDate(key){
  selectedKey = key;
  const d = keyToDate(key);
  if (d.getFullYear() !== calYear || d.getMonth() !== calMonth){
    calYear = d.getFullYear(); calMonth = d.getMonth();
  }
  renderCalendar(); renderEditor(); renderWeek();
}
dayPrev.addEventListener('click', () => { const d = keyToDate(selectedKey); d.setDate(d.getDate()-1); selectDate(dateKey(d)); });
dayNext.addEventListener('click', () => { const d = keyToDate(selectedKey); d.setDate(d.getDate()+1); selectDate(dateKey(d)); });
jumpToday.addEventListener('click', () => selectDate(todayKey()));

// 저장: 날짜 경로로 보내지만, 어느 계정의 그 날짜인지는 서버가 토큰에서 정한다.
async function putEntry(key, payload){
  const saved = await api(`/api/entries/date/${key}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (saved && saved.deleted) delete entries[key];
  else entries[key] = saved;
  return saved;
}

saveBtn.addEventListener('click', () => withEntryLock(async () => {
  const text = entryText.value.trim();
  const existing = entries[selectedKey];
  const habits = existing ? existing.habits : [];
  if (!text && !currentMood && habits.length === 0){
    saveHint.textContent = '기분, 내용, 습관 기록 중 하나는 입력해주세요.';
    return;
  }
  try {
    await guard(async () => {
      await putEntry(selectedKey, { mood: currentMood, text, habits });
      saveHint.textContent = '저장했어요 💕';
      renderCalendar(); renderDDay(); renderMetric(); renderWeek();
    });
  } catch (err){ saveHint.textContent = `저장 실패: ${err.message}`; }
}));

deleteBtn.addEventListener('click', () => withEntryLock(async () => {
  if (!entries[selectedKey]){ saveHint.textContent = '삭제할 일기가 없어요.'; return; }
  if (!confirm('이 날의 일기와 습관 기록을 모두 삭제할까요?')) return;
  try {
    await guard(async () => {
      await api(`/api/entries/date/${selectedKey}`, { method: 'DELETE' });
      delete entries[selectedKey];
      renderEditor(); renderCalendar(); renderDDay(); renderMetric(); renderWeek();
      saveHint.textContent = '삭제했어요.';
    });
  } catch (err){ saveHint.textContent = `삭제 실패: ${err.message}`; }
}));

function renderHabitList(){
  habitList.innerHTML = '';
  habitError.textContent = '';
  const entry = entries[selectedKey];
  const habits = entry ? entry.habits : [];
  if (!habits || habits.length === 0) return;

  for (const h of habits){
    const li = document.createElement('li');
    li.className = 'habit-row';
    const item = document.createElement('span'); item.className = 'habit-item'; item.textContent = h.item;
    const val = document.createElement('span'); val.className = 'habit-val'; val.textContent = h.value;
    const unit = document.createElement('span'); unit.className = 'habit-unit'; unit.textContent = h.unit;
    const del = document.createElement('button');
    del.className = 'habit-del'; del.setAttribute('aria-label','삭제'); del.dataset.id = h.id; del.textContent = '✕';
    li.append(item, val, unit, del);
    habitList.appendChild(li);
  }
}

habitAddBtn.addEventListener('click', () => withEntryLock(async () => {
  const item = habitItemInput.value.trim();
  const value = Number(habitValueInput.value);
  const unit = habitUnitInput.value.trim();

  if (!item){ habitError.textContent = '항목을 입력해주세요.'; return; }
  if (habitValueInput.value === '' || !Number.isFinite(value)){ habitError.textContent = '값은 숫자로 입력해주세요.'; return; }
  habitError.textContent = '';

  const existing = entries[selectedKey];
  const newHabit = { id: genId(), item: item.slice(0,20), value, unit: unit.slice(0,10) };
  const newHabits = (existing ? existing.habits : []).concat([newHabit]);

  try {
    await guard(async () => {
      await putEntry(selectedKey, {
        mood: existing ? existing.mood : null,
        text: existing ? existing.text : '',
        habits: newHabits
      });
      habitItemInput.value = ''; habitValueInput.value = ''; habitUnitInput.value = '';
      habitItemInput.focus();
      renderHabitList(); renderCalendar(); renderDDay(); renderMetric(); renderWeek();
    });
  } catch (err){ habitError.textContent = `저장 실패: ${err.message}`; }
}));

habitList.addEventListener('click', (e) => {
  const btn = e.target.closest('.habit-del');
  if (!btn) return;
  withEntryLock(async () => {
    const entry = entries[selectedKey];
    if (!entry) return;
    const newHabits = entry.habits.filter((h) => h.id !== btn.dataset.id);
    try {
      await guard(async () => {
        await putEntry(selectedKey, { mood: entry.mood, text: entry.text, habits: newHabits });
        renderHabitList(); renderCalendar(); renderDDay(); renderMetric(); renderWeek();
      });
    } catch (err){ habitError.textContent = `삭제 실패: ${err.message}`; }
  });
});

/* =========================================================================
   지표 요약 — 화면에 보이는 합계·평균은 아래 표의 값을 그대로 더한 것이다
   ========================================================================= */
// 계산 규칙: 그날 기록 중 '지표'와 이름이 같은 습관 항목의 값을 모두 더해 하루 값으로 본다.
// 값이 빠진 날: 0으로 채우지 않고 '없음'으로 두고, 평균의 분모에서도 뺀다.
// 같은 날 같은 항목이 여러 번 있으면: 지우지 않고 모두 더한다(중복이 아니라 나눠 기록한 것으로 본다).
// 유난히 튀는 값: 빼지 않고 그대로 쓰되, 표에 ! 표시를 남긴다.
function dailyMetricValue(entry, metricName){
  if (!entry || !Array.isArray(entry.habits)) return null;
  let sum = 0, found = false;
  for (const h of entry.habits){
    if (!h || typeof h.item !== 'string') continue;
    if (h.item.trim() !== metricName) continue;
    const v = Number(h.value);
    if (!Number.isFinite(v)) continue;
    sum += v; found = true;
  }
  return found ? sum : null;
}

function renderMetric(){
  const metricName = (settings.metric || '').trim();
  const unit = settings.unit || '';
  metricBody.innerHTML = '';
  metricTable.innerHTML = '';

  if (!metricName){
    metricPeriod.textContent = '';
    const p = document.createElement('div');
    p.className = 'week-empty';
    p.textContent = '실험 설정에서 관찰 지표를 정하면 여기에 합계와 평균이 나와요.';
    metricBody.appendChild(p);
    return;
  }

  const keys = Object.keys(entries).filter(isValidDateKey).sort();
  const rows = [];
  for (const k of keys){
    const v = dailyMetricValue(entries[k], metricName);
    if (v === null) continue;
    rows.push({ date: k, value: v });
  }

  metricPeriod.textContent = rows.length ? `${rows[0].date} ~ ${rows[rows.length-1].date} · ${rows.length}일` : '';

  if (rows.length === 0){
    const p = document.createElement('div');
    p.className = 'week-empty';
    p.textContent = `'${metricName}' 항목으로 기록된 날이 아직 없어요.`;
    metricBody.appendChild(p);
    return;
  }

  const total = rows.reduce((a, r) => a + r.value, 0);
  const avg = total / rows.length;
  const values = rows.map(r => r.value);
  const mean = total / rows.length;
  const spread = Math.max(...values) - Math.min(...values);

  // 규칙 변경 시각을 기준으로 앞/뒤를 같은 지표·같은 단위·같은 계산 규칙으로 비교한다.
  const changeAt = ruleChanges.length ? ruleChanges[0].changedAt.slice(0, 10) : null;
  let compareHtml = '';
  if (changeAt){
    const before = rows.filter(r => r.date <= changeAt);
    const after = rows.filter(r => r.date > changeAt);
    if (before.length && after.length){
      const bAvg = before.reduce((a,r)=>a+r.value,0) / before.length;
      const aAvg = after.reduce((a,r)=>a+r.value,0) / after.length;
      const diff = aAvg - bAvg;
      compareHtml = `규칙 변경 전 ${before.length}일 평균 <b>${roundNum(bAvg)}${unit}</b> → 변경 후 ${after.length}일 평균 <b>${roundNum(aAvg)}${unit}</b> (${diff >= 0 ? '+' : ''}${roundNum(diff)}${unit})`;
    }
  }

  const line1 = document.createElement('div');
  line1.className = 'metric-line';
  line1.innerHTML = `${metricName} 합계 <b>${roundNum(total)}${unit}</b> · 기록한 ${rows.length}일 평균 <b>${roundNum(avg)}${unit}</b>`;
  metricBody.appendChild(line1);

  if (compareHtml){
    const line2 = document.createElement('div');
    line2.className = 'metric-line compare';
    line2.innerHTML = compareHtml;
    metricBody.appendChild(line2);
  }

  const head = document.createElement('tr');
  head.innerHTML = '<th>날짜</th><th class="dow-col">요일</th><th>값</th><th>비고</th>';
  metricTable.appendChild(head);
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const d = keyToDate(r.date);
    const outlier = spread > 0 && Math.abs(r.value - mean) > 0.6 * spread;
    tr.innerHTML = `<td>${i+1}일차 ${r.date}</td><td class="dow-col">${DOW[d.getDay()]}</td><td>${roundNum(r.value)}${unit}</td><td>${outlier ? '! 튀는 값 (빼지 않고 그대로 씀)' : ''}</td>`;
    metricTable.appendChild(tr);
  });
  const foot = document.createElement('tr');
  foot.className = 'metric-total';
  foot.innerHTML = `<td colspan="2">합계 / 평균</td><td>${roundNum(total)}${unit}</td><td>${roundNum(avg)}${unit}</td>`;
  metricTable.appendChild(foot);
}

/* ---------- 주간 요약 (주 시작 = 월요일) ---------- */
function weekRangeMonToSun(d){
  const day = d.getDay();
  const diffToMonday = (day === 0) ? 6 : day - 1;
  const monday = startOfDay(new Date(d));
  monday.setDate(monday.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}
const fmtShort = (d) => `${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]})`;

function renderWeek(){
  const { monday, sunday } = weekRangeMonToSun(keyToDate(selectedKey));
  weekPeriod.textContent = `${fmtShort(monday)} ~ ${fmtShort(sunday)}`;

  const totals = {};
  for (const [key, entry] of Object.entries(entries)){
    if (!isValidDateKey(key)) continue;
    const d = keyToDate(key);
    if (d < monday || d > sunday) continue;
    if (!entry || !Array.isArray(entry.habits)) continue;
    for (const h of entry.habits){
      if (!h || typeof h.item !== 'string' || !h.item.trim()) continue;
      const num = Number(h.value);
      if (!Number.isFinite(num)) continue;
      const gkey = h.item.trim() + '§' + (typeof h.unit === 'string' ? h.unit : '');
      totals[gkey] = (totals[gkey] || 0) + num;
    }
  }

  const keys = Object.keys(totals).sort();
  weekBody.innerHTML = '';
  if (keys.length === 0){
    const p = document.createElement('div');
    p.className = 'week-empty';
    p.textContent = '이번 주 습관 기록이 아직 없어요.';
    weekBody.appendChild(p);
    return;
  }
  for (const k of keys){
    const [item, unit] = k.split('§');
    const chip = document.createElement('span');
    chip.className = 'week-chip';
    const b = document.createElement('b');
    b.textContent = ' ' + roundNum(totals[k]);
    chip.append(document.createTextNode(item), b, document.createTextNode(unit));
    weekBody.appendChild(chip);
  }
}

/* =========================================================================
   계획 규칙 변경 기록
   ========================================================================= */
ruleToggle.addEventListener('click', () => {
  ruleForm.hidden = !ruleForm.hidden;
  ruleToggle.textContent = ruleForm.hidden ? '규칙 바꾸기' : '접기';
  if (!ruleForm.hidden) ruleBefore.value = settings.planRule || '';
});

ruleSaveBtn.addEventListener('click', async () => {
  if (!ruleAfter.value.trim() || !ruleReason.value.trim()){
    ruleStatus.textContent = '바꾼 규칙과 바꾼 이유를 모두 적어주세요.';
    return;
  }
  await guard(async () => {
    await api('/api/rule-changes', {
      method: 'POST',
      body: JSON.stringify({
        beforeRule: ruleBefore.value, afterRule: ruleAfter.value,
        reason: ruleReason.value, basedOn: ruleBasedOn.value
      })
    });
    ruleAfter.value = ''; ruleReason.value = ''; ruleBasedOn.value = '';
    ruleStatus.textContent = '기록했어요.';
    settings = await api('/api/settings');
    const rd = await api('/api/rule-changes');
    ruleChanges = rd.ruleChanges || [];
    renderSetup(); renderRuleChanges(); renderMetric();
  });
});

function fmtSeoul(iso){
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} (KST)`;
}

function renderRuleChanges(){
  ruleList.innerHTML = '';
  if (ruleChanges.length === 0){
    const p = document.createElement('div');
    p.className = 'week-empty';
    p.textContent = '아직 규칙을 바꾼 적이 없어요.';
    ruleList.appendChild(p);
    return;
  }
  for (const rc of ruleChanges){
    const box = document.createElement('div');
    box.className = 'rule-item';
    const when = document.createElement('div');
    when.className = 'rule-when';
    when.textContent = '바꾼 시각 ' + fmtSeoul(rc.changedAt);
    box.appendChild(when);

    const rows = [
      ['전', rc.beforeRule],
      ['후', rc.afterRule],
      ['이유', rc.reason],
      ['근거로 본 기록', rc.basedOn]
    ];
    for (const [k, v] of rows){
      if (!v) continue;
      const line = document.createElement('div');
      line.className = 'rule-line';
      const b = document.createElement('b');
      b.textContent = k + ' ';
      const s = document.createElement('span');
      s.textContent = v;
      line.append(b, s);
      box.appendChild(line);
    }
    ruleList.appendChild(box);
  }
}

/* =========================================================================
   모찌 대사
   ========================================================================= */
function currentStreak(){
  let d = new Date(today);
  if (!entries[dateKey(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (entries[dateKey(d)]){ streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
const MOOD_LINES = {
  great: '오늘 최고의 하루였다면서요? 저도 덩달아 신나요!',
  good: '오늘 기분 좋았다니 다행이에요.',
  soso: '그냥 그런 날도 있는 거죠. 내일은 더 나을 거예요.',
  sad: '오늘 좀 힘들었나봐요... 제가 옆에 있을게요.',
  angry: '오늘 화나는 일 있었어요? 저한테 실컷 얘기해도 돼요.'
};
function pickMochiLine(){
  const candidates = [];
  const keys = Object.keys(entries).sort();
  const entry = entries[todayKey()];
  if (keys.length === 0) candidates.push('아직 일기가 하나도 없어요! 오늘 처음 써볼까요?');
  else if (!entry) candidates.push('오늘 일기 아직 안 쓰셨어요~ 저 기다리고 있어요!');
  else {
    if (entry.mood && MOOD_LINES[entry.mood]) candidates.push(MOOD_LINES[entry.mood]);
    if (entry.habits && entry.habits.length > 0){
      const h = entry.habits[Math.floor(Math.random() * entry.habits.length)];
      candidates.push(`오늘 ${h.item} ${h.value}${h.unit} 하셨다고 적어주셨네요, 대단해요!`);
    }
  }
  const streak = currentStreak();
  if (streak >= 2) candidates.push(`벌써 ${streak}일째 기록 중이시네요! 완전 습관이 됐어요.`);
  candidates.push('오늘 하루도 고생 많았어요.');
  candidates.push('저 쓰다듬어주는 거 진짜 좋아요, 헤헤.');
  return candidates[Math.floor(Math.random() * candidates.length)];
}
let bubbleHideTimer = null;
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'mochi:clicked') return;
  mochiBubbleText.textContent = pickMochiLine();
  mochiBubble.classList.add('show');
  clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => mochiBubble.classList.remove('show'), 3600);
});

/* =========================================================================
   시작 — 토큰이 있어도 서버에 물어봐서 통과할 때만 일기 화면을 연다.
   (#/diary 를 직접 주소창에 넣어도 서버가 401을 주면 로그인 화면이 나온다)
   ========================================================================= */
(async function start(){
  setAuthMode('login');
  const token = getToken();
  if (!token){ showLogin(); return; }
  try {
    const data = await api('/api/auth/me');
    me = data.user;
    await enterApp();
  } catch (err){
    setToken('');
    showLogin(err.network ? err.message : '');
  }
})();

})();
