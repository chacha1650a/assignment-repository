(() => {
'use strict';

const STORAGE_KEY = 'mochiDiary.entries.v1';
const CURRENT_SCHEMA = 2;

const DOW = ['일','월','화','수','목','금','토'];

const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const keyToDate = (key) => {
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d);
};
const startOfDay = (d) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
const todayDate = () => startOfDay(new Date());
const todayKey = () => dateKey(todayDate());

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
function sanitizeHabits(list){
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const h of list){
    if (!h || typeof h.item !== 'string' || !h.item.trim()) continue;
    const value = Number(h.value);
    if (!Number.isFinite(value)) continue;
    out.push({
      id: (typeof h.id === 'string' && h.id) ? h.id : genId(),
      item: h.item.trim().slice(0, 20),
      value,
      unit: typeof h.unit === 'string' ? h.unit.trim().slice(0, 10) : ''
    });
  }
  return out;
}
function sanitizeEntry(raw){
  return {
    mood: (raw && typeof raw.mood === 'string') ? raw.mood : null,
    text: (raw && typeof raw.text === 'string') ? raw.text : '',
    habits: sanitizeHabits(raw && raw.habits),
    updatedAt: (raw && typeof raw.updatedAt === 'string') ? raw.updatedAt : new Date().toISOString()
  };
}

/* ---------- 저장소 (스키마 버전 관리 + 자동 변환) ---------- */
function persist(schemaVersion, entriesObj){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion, entries: entriesObj })); }
  catch (e) {}
}
function loadStore(){
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch (e) { raw = null; }

  if (!raw){
    return { schemaVersion: CURRENT_SCHEMA, entries: {}, migrated:false };
  }

  // 이미 v2(schemaVersion+entries 래퍼) 형식인 경우
  if (raw.schemaVersion === CURRENT_SCHEMA && raw.entries && typeof raw.entries === 'object'){
    const cleaned = {};
    for (const [k,v] of Object.entries(raw.entries)){
      if (!isValidDateKey(k)) continue;
      cleaned[k] = sanitizeEntry(v);
    }
    return { schemaVersion: CURRENT_SCHEMA, entries: cleaned, migrated:false };
  }

  // v1(래퍼 없이 날짜키가 바로 최상위에 있던 예전 형식) -> v2로 자동 변환
  if (!raw.schemaVersion && !raw.entries){
    const migrated = {};
    for (const [k,v] of Object.entries(raw)){
      if (!isValidDateKey(k)) continue;
      migrated[k] = sanitizeEntry(v);
    }
    persist(CURRENT_SCHEMA, migrated); // 변환 결과를 바로 저장 -> 다음 로드부터는 재변환하지 않음(멱등)
    return { schemaVersion: CURRENT_SCHEMA, entries: migrated, migrated:true };
  }

  // 알 수 없는 손상된 형식 -> 기존 값은 건드리지 않고 빈 상태로 안전하게 시작
  return { schemaVersion: CURRENT_SCHEMA, entries: {}, migrated:false };
}

let store = loadStore();
let schemaVersion = store.schemaVersion;
let entries = store.entries;
let justMigrated = store.migrated;

function saveEntries(){ persist(schemaVersion, entries); }

/* ---------- 상태 ---------- */
const today = todayDate();
let selectedKey = todayKey();
let calYear = today.getFullYear();
let calMonth = today.getMonth(); // 0-11

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const topToday = $('topToday');
const schemaBadge = $('schemaBadge');
const dataStatus = $('dataStatus');
const dataError = $('dataError');
const exportBtn = $('exportBtn');
const importBtn = $('importBtn');
const importFile = $('importFile');
const resetAllBtn = $('resetAllBtn');
const ddayLabel = $('ddayLabel');
const ddayNum = $('ddayNum');
const ddaySub = $('ddaySub');
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
const weekPeriod = $('weekPeriod');
const weekBody = $('weekBody');

/* ---------- 상단 오늘 날짜 ---------- */
topToday.textContent = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일 (${DOW[today.getDay()]})`;

/* ---------- 데이터 형식 표시 ---------- */
function renderSchemaBadge(){
  schemaBadge.textContent = `데이터 형식 v${schemaVersion}`;
  dataStatus.textContent = justMigrated ? '이전 형식(v1) 기록을 자동으로 변환했어요' : '';
}
function showDataError(msg){
  dataError.textContent = msg;
  dataError.classList.add('show');
}
function clearDataError(){
  dataError.textContent = '';
  dataError.classList.remove('show');
}

/* ---------- D-Day (첫 일기 작성일 기준) ---------- */
function renderDDay(){
  const keys = Object.keys(entries).sort();
  if (keys.length === 0){
    ddayLabel.textContent = '첫 일기를 써보세요';
    ddayNum.textContent = '';
    ddaySub.textContent = '';
    return;
  }
  const firstKey = keys[0];
  const firstDate = keyToDate(firstKey);
  const diffDays = Math.round((today - firstDate) / 86400000) + 1;
  ddayLabel.textContent = '모찌와 함께한 지';
  ddayNum.textContent = `D+${diffDays}`;
  ddaySub.textContent = `${firstDate.getFullYear()}.${firstDate.getMonth()+1}.${firstDate.getDate()}부터`;
}

/* ---------- 달력 ---------- */
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
  calMonth--;
  if (calMonth < 0){ calMonth = 11; calYear--; }
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11){ calMonth = 0; calYear++; }
  renderCalendar();
});

/* ---------- 에디터 (기분 + 텍스트) ---------- */
let currentMood = null;

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
  [...moodPicker.children].forEach((b) => {
    b.classList.toggle('active', b.dataset.mood === currentMood);
  });
});

function selectDate(key){
  selectedKey = key;
  const d = keyToDate(key);
  if (d.getFullYear() !== calYear || d.getMonth() !== calMonth){
    calYear = d.getFullYear();
    calMonth = d.getMonth();
  }
  renderCalendar();
  renderEditor();
  renderWeek();
}

dayPrev.addEventListener('click', () => {
  const d = keyToDate(selectedKey);
  d.setDate(d.getDate() - 1);
  selectDate(dateKey(d));
});
dayNext.addEventListener('click', () => {
  const d = keyToDate(selectedKey);
  d.setDate(d.getDate() + 1);
  selectDate(dateKey(d));
});
jumpToday.addEventListener('click', () => selectDate(todayKey()));

saveBtn.addEventListener('click', () => {
  const text = entryText.value.trim();
  const existing = entries[selectedKey];
  const habits = existing ? existing.habits : [];

  if (!text && !currentMood && habits.length === 0){
    saveHint.textContent = '기분, 내용, 습관 기록 중 하나는 입력해주세요.';
    return;
  }

  entries[selectedKey] = { mood: currentMood, text, habits, updatedAt: new Date().toISOString() };
  saveEntries();

  saveHint.textContent = '저장했어요 💕';
  renderCalendar();
  renderDDay();
  renderWeek();
});

deleteBtn.addEventListener('click', () => {
  if (!entries[selectedKey]){
    saveHint.textContent = '삭제할 일기가 없어요.';
    return;
  }
  if (!confirm('이 날의 일기와 습관 기록을 모두 삭제할까요?')) return;
  delete entries[selectedKey];
  saveEntries();
  renderEditor();
  renderCalendar();
  renderDDay();
  renderWeek();
  saveHint.textContent = '삭제했어요.';
});

/* ---------- 습관 기록 ---------- */
function renderHabitList(){
  habitList.innerHTML = '';
  habitError.textContent = '';
  const entry = entries[selectedKey];
  const habits = entry ? entry.habits : [];
  if (!habits || habits.length === 0) return;

  for (const h of habits){
    const li = document.createElement('li');
    li.className = 'habit-row';
    li.innerHTML = `
      <span class="habit-item"></span>
      <span class="habit-val"></span>
      <span class="habit-unit"></span>
      <button class="habit-del" aria-label="삭제" data-id="${h.id}">✕</button>
    `;
    li.querySelector('.habit-item').textContent = h.item;
    li.querySelector('.habit-val').textContent = h.value;
    li.querySelector('.habit-unit').textContent = h.unit;
    habitList.appendChild(li);
  }
}

habitAddBtn.addEventListener('click', () => {
  const item = habitItemInput.value.trim();
  const value = Number(habitValueInput.value);
  const unit = habitUnitInput.value.trim();

  if (!item){
    habitError.textContent = '항목을 입력해주세요.';
    return;
  }
  if (habitValueInput.value === '' || !Number.isFinite(value)){
    habitError.textContent = '값은 숫자로 입력해주세요.';
    return;
  }
  habitError.textContent = '';

  if (!entries[selectedKey]){
    entries[selectedKey] = { mood: null, text: '', habits: [], updatedAt: new Date().toISOString() };
  }
  entries[selectedKey].habits.push({ id: genId(), item: item.slice(0,20), value, unit: unit.slice(0,10) });
  entries[selectedKey].updatedAt = new Date().toISOString();
  saveEntries();

  habitItemInput.value = '';
  habitValueInput.value = '';
  habitUnitInput.value = '';
  habitItemInput.focus();

  renderHabitList();
  renderCalendar();
  renderDDay();
  renderWeek();
});

habitList.addEventListener('click', (e) => {
  const btn = e.target.closest('.habit-del');
  if (!btn) return;
  const entry = entries[selectedKey];
  if (!entry) return;
  entry.habits = entry.habits.filter((h) => h.id !== btn.dataset.id);
  if (!entry.text && !entry.mood && entry.habits.length === 0){
    delete entries[selectedKey];
  }
  saveEntries();
  renderHabitList();
  renderCalendar();
  renderDDay();
  renderWeek();
});

/* ---------- 주간 요약 (월요일~일요일, 잘못된 값/날짜 방어) ---------- */
function weekRangeMonToSun(d){
  const day = d.getDay(); // 0=일 ... 6=토
  const diffToMonday = (day === 0) ? 6 : day - 1;
  const monday = startOfDay(new Date(d));
  monday.setDate(monday.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}
function fmtShort(d){
  return `${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]})`;
}
function roundNum(n){
  return Math.round(n * 100) / 100;
}
function renderWeek(){
  const base = keyToDate(selectedKey);
  const { monday, sunday } = weekRangeMonToSun(base);
  weekPeriod.textContent = `${fmtShort(monday)} ~ ${fmtShort(sunday)}`;

  const totals = {};
  for (const [key, entry] of Object.entries(entries)){
    if (!isValidDateKey(key)) continue;          // 잘못된 날짜 키 방어
    const d = keyToDate(key);
    if (d < monday || d > sunday) continue;      // 이번 주 범위 밖
    if (!entry || !Array.isArray(entry.habits)) continue;

    for (const h of entry.habits){
      if (!h || typeof h.item !== 'string' || !h.item.trim()) continue;
      const num = Number(h.value);
      if (!Number.isFinite(num)) continue;        // 숫자가 아닌 값 방어
      const unit = typeof h.unit === 'string' ? h.unit : '';
      const gkey = h.item.trim() + '§' + unit;
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
    chip.innerHTML = `${item} <b>${roundNum(totals[k])}</b>${unit}`;
    weekBody.appendChild(chip);
  }
}

/* ---------- 내보내기 / 가져오기 / 전체 삭제 ---------- */
exportBtn.addEventListener('click', () => {
  clearDataError();
  const payload = { schemaVersion, entries };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mochi-diary-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  dataStatus.textContent = '내보내기 완료 (다운로드 폴더 확인)';
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const file = importFile.files && importFile.files[0];
  importFile.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e){
      showDataError('가져오기 실패: JSON 형식이 아니에요. 기존 기록은 그대로예요.');
      return;
    }
    if (!parsed || typeof parsed !== 'object'){
      showDataError('가져오기 실패: 올바른 백업 파일이 아니에요. 기존 기록은 그대로예요.');
      return;
    }

    const rawEntries = (parsed.entries && typeof parsed.entries === 'object')
      ? parsed.entries
      : parsed; // schemaVersion 래퍼 없이 통째로 온 예전 형식도 허용

    const sanitized = {};
    let count = 0;
    for (const [k, v] of Object.entries(rawEntries)){
      if (!isValidDateKey(k)) continue;
      sanitized[k] = sanitizeEntry(v);
      count++;
    }

    if (count === 0){
      showDataError('가져오기 실패: 파일 안에 유효한 날짜 기록이 없어요. 기존 기록은 그대로예요.');
      return;
    }

    if (!confirm(`이 파일에서 ${count}개의 날짜 기록을 찾았어요. 가져오면 지금 있는 기록을 덮어써요. 계속할까요?`)) return;

    entries = sanitized;
    schemaVersion = CURRENT_SCHEMA;
    justMigrated = false;
    saveEntries();
    clearDataError();
    renderSchemaBadge();
    dataStatus.textContent = `가져오기 완료 (${count}건)`;
    renderCalendar();
    renderEditor();
    renderDDay();
    renderWeek();
  };
  reader.onerror = () => {
    showDataError('가져오기 실패: 파일을 읽을 수 없어요. 기존 기록은 그대로예요.');
  };
  reader.readAsText(file);
});

resetAllBtn.addEventListener('click', () => {
  if (!confirm('정말 모든 일기·습관 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
  entries = {};
  schemaVersion = CURRENT_SCHEMA;
  justMigrated = false;
  saveEntries();
  clearDataError();
  renderSchemaBadge();
  dataStatus.textContent = '전체 삭제 완료';
  renderCalendar();
  renderEditor();
  renderDDay();
  renderWeek();
});

/* ---------- 초기 렌더 ---------- */
renderSchemaBadge();
renderCalendar();
renderEditor();
renderDDay();
renderWeek();
})();
