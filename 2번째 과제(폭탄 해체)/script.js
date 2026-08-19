/* =========================================================
   PROTOCOL ZERO — script.js
   30초 / 오답 3회 / 모듈 5개 / 매판 랜덤 출제
   ========================================================= */
'use strict';

/* ---------- 0. 설정 ---------- */
const CONFIG = {
  TIME_MAX: 30,      // 상한이자 시작값 (초)
  TIME_BONUS: 5,     // 정답 시 회복량 (초)
  MAX_STRIKES: 3,
  MODULE_COUNT: 5,
  RING_LEN: 326.7    // 2πr, r=52
};

/* ---------- 1. 유틸 ---------- */
const $ = (id) => document.getElementById(id);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 정답 객체를 섞은 뒤 새 인덱스를 함께 반환 */
function shuffleWithAnswer(options, answerObj) {
  const mixed = shuffle(options);
  return { options: mixed, answer: mixed.indexOf(answerObj) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/* ---------- 2. 아이콘 (SVG) ---------- */
const ICON = {
  cross: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="10.5" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="10.5" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7.5a4 4 0 0 1 7.4-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  shieldOk: '<svg viewBox="0 0 64 64" fill="none"><path d="M32 5 55 14v18c0 13-9.6 23.6-23 27C18.6 55.6 9 45 9 32V14L32 5Z" stroke="#86a869" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 32.5 29.2 40 43 25.5" stroke="#86a869" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shieldBad: '<svg viewBox="0 0 64 64" fill="none"><path d="M32 5 55 14v18c0 13-9.6 23.6-23 27C18.6 55.6 9 45 9 32V14L32 5Z" stroke="#cf4740" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 24l16 16m0-16-16 16" stroke="#cf4740" stroke-width="3.4" stroke-linecap="round"/></svg>'
};

/* =========================================================
   3. 문제 은행 — 각 생성기는 모듈 객체를 반환
   { type, section, title, prompt, render, options, answer, why }
   ========================================================= */

/* --- M1. 배선 절단 : 사설/공인/루프백 IP --- */
/* 등불 아래에서 본 피복 색 — 채도를 낮춰 형광기를 뺀다 */
const WIRES = [
  { key: 'red',    ko: '빨강', hex: '#c4453d' },
  { key: 'blue',   ko: '파랑', hex: '#4a6d9e' },
  { key: 'yellow', ko: '노랑', hex: '#cf9c3c' },
  { key: 'green',  ko: '초록', hex: '#5f8a55' }
];

function makeWireModule() {
  const kinds = [
    { k: 'p10',   ip: () => `10.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,   wire: 'blue',   cls: '사설 IP (10.0.0.0/8)' },
    { k: 'p172',  ip: () => `172.${rand(16, 31)}.${rand(0, 255)}.${rand(1, 254)}`,  wire: 'blue',   cls: '사설 IP (172.16~31)' },
    { k: 'p192',  ip: () => `192.168.${rand(0, 255)}.${rand(1, 254)}`,              wire: 'blue',   cls: '사설 IP (192.168.0.0/16)' },
    { k: 'loop',  ip: () => `127.0.0.${rand(1, 254)}`,                              wire: 'yellow', cls: '루프백 주소' },
    { k: 'pub1',  ip: () => `172.${rand(32, 90)}.${rand(0, 255)}.${rand(1, 254)}`,  wire: 'red',    cls: '공인 IP (172지만 16~31 범위 밖)' },
    { k: 'pub2',  ip: () => `192.${pick([169, 170, 167])}.${rand(0, 255)}.${rand(1, 254)}`, wire: 'red', cls: '공인 IP (192.168이 아님)' },
    { k: 'pub3',  ip: () => `${pick([8, 11, 52, 104, 203])}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`, wire: 'red', cls: '공인 IP' }
  ];
  const kind = pick(kinds);
  const ip = kind.ip();
  const order = shuffle(WIRES);

  return {
    type: 'wire',
    section: 'wire',
    title: 'WIRE CUTTER',
    prompt: `대상 호스트 <b>${ip}</b> 의 대역을 판별하고, 매뉴얼 §1에 따라 <b>절단할 케이블 1가닥</b>을 고르시오.`,
    render: 'wire',
    readout: { k: 'TARGET HOST', v: ip, badge: 'IPv4' },
    options: order,
    answer: order.findIndex((w) => w.key === kind.wire),
    why: `${ip} 는 ${kind.cls} → ${WIRES.find((w) => w.key === kind.wire).ko} 선을 절단한다.`
  };
}

/* --- M2. 포트 키패드 --- */
const PORTS = [
  { port: 21,   svc: 'FTP',    desc: '파일 전송' },
  { port: 22,   svc: 'SSH',    desc: '보안 원격 접속' },
  { port: 23,   svc: 'Telnet', desc: '평문 원격 접속' },
  { port: 25,   svc: 'SMTP',   desc: '메일 발송' },
  { port: 53,   svc: 'DNS',    desc: '도메인 질의' },
  { port: 80,   svc: 'HTTP',   desc: '웹(평문)' },
  { port: 443,  svc: 'HTTPS',  desc: '웹(암호화)' },
  { port: 3389, svc: 'RDP',    desc: '원격 데스크톱' }
];

function makePortModule() {
  const target = pick(PORTS);
  const decoys = shuffle(PORTS.filter((p) => p.port !== target.port)).slice(0, 3);
  const { options, answer } = shuffleWithAnswer([target, ...decoys], target);

  return {
    type: 'port',
    section: 'port',
    title: 'PORT KEYPAD',
    prompt: `침해 트래픽이 <b>${target.svc}</b> 서비스로 유입 중이다. 매뉴얼 §2에서 표준 포트를 찾아 <b>차단 버튼</b>을 누르시오.`,
    render: 'keypad',
    readout: { k: 'BLOCK SERVICE', v: target.svc, badge: target.desc },
    options: options.map((p) => ({ main: String(p.port), sub: 'PORT' })),
    answer,
    why: `${target.svc} 의 표준 포트는 ${target.port} 번이다.`
  };
}

/* --- M3. 피싱 URL --- */
const SAFE_URLS = [
  'https://www.naver.com/login',
  'https://accounts.google.com',
  'https://www.kakaocorp.com',
  'https://banking.shinhan.com',
  'https://www.gov.kr/portal'
];
const BAD_URLS = [
  { u: 'http://www.naver.com/login',            r: 'http 평문 로그인 페이지' },
  { u: 'https://nave-r.com/login',              r: '도메인 철자 변조(하이픈 삽입)' },
  { u: 'https://www.kakaoo.com/auth',           r: '도메인 철자 변조(문자 중복)' },
  { u: 'https://g00gle.com/account',            r: '숫자 0 으로 문자 치환' },
  { u: 'https://naver.com.login-kr.net/id',     r: '서브도메인 위장 — 실제 도메인은 login-kr.net' },
  { u: 'http://203.0.113.9/login',              r: 'IP 직접 접속' },
  { u: 'https://shinhan-bank.security-kr.top/', r: '무관한 최종 도메인(security-kr.top)' }
];

function makePhishModule() {
  const findSafe = Math.random() < 0.5;
  const safe = pick(SAFE_URLS);
  const bads = shuffle(BAD_URLS).slice(0, 3);

  const target = findSafe
    ? { main: safe, sub: '' }
    : { main: bads[0].u, sub: '' };

  let pool;
  if (findSafe) {
    pool = [target, ...bads.map((b) => ({ main: b.u, sub: '' }))];
  } else {
    const otherSafe = shuffle(SAFE_URLS.filter((s) => s !== safe)).slice(0, 3);
    pool = [target, ...otherSafe.map((s) => ({ main: s, sub: '' }))];
  }
  const { options, answer } = shuffleWithAnswer(pool, target);

  return {
    type: 'phish',
    section: 'phish',
    title: 'URL VALIDATOR',
    prompt: findSafe
      ? '아래 4개 주소 중 <b>접속을 허용할 정상 주소</b> 하나를 고르시오. (매뉴얼 §3)'
      : '아래 4개 주소 중 <b>즉시 차단할 피싱 주소</b> 하나를 고르시오. (매뉴얼 §3)',
    render: 'list',
    readout: { k: 'MODE', v: findSafe ? 'ALLOW-LIST' : 'BLOCK-LIST', badge: findSafe ? '정상 1개 선택' : '피싱 1개 선택' },
    options,
    answer,
    why: findSafe
      ? `${safe} 만 https 이면서 도메인 철자가 원본과 일치한다.`
      : `${bads[0].u} — ${bads[0].r}.`
  };
}

/* --- M4. 프로토콜 스위치 --- */
const PROTO_ENC = [
  { name: 'HTTPS', d: '웹 트래픽 암호화' },
  { name: 'SSH',   d: '원격 접속 암호화' },
  { name: 'SFTP',  d: '파일 전송 암호화' },
  { name: 'TLS',   d: '전송 계층 암호화' }
];
const PROTO_PLAIN = [
  { name: 'HTTP',   d: '웹 트래픽 평문' },
  { name: 'Telnet', d: '원격 접속 평문' },
  { name: 'FTP',    d: '파일 전송 평문' },
  { name: 'POP3',   d: '메일 수신 평문' }
];

function makeProtocolModule() {
  const findEncrypted = Math.random() < 0.5;
  const target = findEncrypted ? pick(PROTO_ENC) : pick(PROTO_PLAIN);
  const decoyPool = findEncrypted ? PROTO_PLAIN : PROTO_ENC;
  const decoys = shuffle(decoyPool).slice(0, 3);
  const { options, answer } = shuffleWithAnswer([target, ...decoys], target);

  return {
    type: 'protocol',
    section: 'protocol',
    title: 'PROTOCOL SWITCH',
    prompt: findEncrypted
      ? '통신을 유지해야 한다. 4개 스위치 중 <b>암호화되는 프로토콜</b>을 올리시오. (매뉴얼 §4)'
      : '도청 위험을 제거해야 한다. 4개 스위치 중 <b>평문(암호화 안 됨) 프로토콜</b>을 내리시오. (매뉴얼 §4)',
    render: 'chip',
    readout: { k: 'SELECT', v: findEncrypted ? 'ENCRYPTED' : 'PLAINTEXT', badge: findEncrypted ? '안전한 것 1개' : '위험한 것 1개' },
    options: options.map((p) => ({ main: p.name, sub: p.d, icon: findEncrypted ? 'lock' : 'unlock' })),
    answer,
    why: `${target.name} — ${target.d}.`
  };
}

/* --- M5. 인증 다이얼 (비밀번호 강도) --- */
const PW_STRONG = ['Tr0ub4dor&3Xk!', 'Qz#7mLp2$Wne', 'B!ue-Sky_92xR', 'Hx9@vTm4!Lqz'];
const PW_WEAK = [
  { p: 'password1',   r: '사전 단어 그대로 사용' },
  { p: 'admin1234',   r: '기본 계정명 + 연속 숫자' },
  { p: 'qwerty!',     r: '키보드 연속 배열, 8자 미만' },
  { p: '19980312',    r: '생년월일' },
  { p: 'ilovekorea',  r: '소문자 단어만, 조합 없음' },
  { p: 'Ab1!',        r: '조합은 좋지만 4자로 너무 짧음' },
  { p: '01012345678', r: '전화번호' }
];

function makeAuthModule() {
  const findStrong = Math.random() < 0.5;
  const strong = pick(PW_STRONG);
  const weaks = shuffle(PW_WEAK).slice(0, 3);

  let pool, target, why;
  if (findStrong) {
    target = { main: strong, sub: '' };
    pool = [target, ...weaks.map((w) => ({ main: w.p, sub: '' }))];
    why = `${strong} 만 12자 이상이면서 대문자·소문자·숫자·특수문자를 모두 포함한다.`;
  } else {
    target = { main: weaks[0].p, sub: '' };
    const others = shuffle(PW_STRONG.filter((s) => s !== strong)).slice(0, 3);
    pool = [target, ...others.map((s) => ({ main: s, sub: '' }))];
    why = `${weaks[0].p} — ${weaks[0].r}.`;
  }
  const { options, answer } = shuffleWithAnswer(pool, target);

  return {
    type: 'auth',
    section: 'auth',
    title: 'AUTH DIAL',
    prompt: findStrong
      ? '기폭 잠금을 재설정한다. <b>가장 안전한 비밀번호</b>를 고르시오. (매뉴얼 §5)'
      : '유출 계정을 찾아야 한다. <b>가장 취약한 비밀번호</b>를 고르시오. (매뉴얼 §5)',
    render: 'list',
    readout: { k: 'MODE', v: findStrong ? 'SET-STRONG' : 'FIND-WEAK', badge: findStrong ? '안전 1개 선택' : '취약 1개 선택' },
    options,
    answer,
    why
  };
}

/* --- M6. 방화벽 정책 --- */
function makeFirewallModule() {
  const scenarios = [
    () => { // 외부 → 내부 위험 포트 : DENY
      const p = pick([{ n: 22, s: 'SSH' }, { n: 23, s: 'Telnet' }, { n: 3389, s: 'RDP' }]);
      return {
        src: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        dst: `192.168.0.${rand(2, 254)}`,
        port: `${p.n} (${p.s})`, dir: '외부 → 내부',
        verdict: 'DENY',
        why: `외부에서 들어오는 ${p.s}(${p.n}) 접속은 정책상 차단 대상이다.`
      };
    },
    () => { // 외부 → 내부 웹 포트 : ALLOW
      const p = pick([{ n: 80, s: 'HTTP' }, { n: 443, s: 'HTTPS' }]);
      return {
        src: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        dst: `192.168.0.${rand(2, 254)}`,
        port: `${p.n} (${p.s})`, dir: '외부 → 내부',
        verdict: 'ALLOW',
        why: `웹 서비스 포트 ${p.n}(${p.s}) 는 외부 유입을 허용한다.`
      };
    },
    () => { // 내부 → 외부 : ALLOW
      const p = pick([{ n: 443, s: 'HTTPS' }, { n: 53, s: 'DNS' }, { n: 25, s: 'SMTP' }]);
      return {
        src: `192.168.0.${rand(2, 254)}`,
        dst: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        port: `${p.n} (${p.s})`, dir: '내부 → 외부',
        verdict: 'ALLOW',
        why: '내부에서 외부로 나가는 트래픽은 전체 허용이다.'
      };
    },
    () => { // 스푸핑 : DENY
      const p = pick([{ n: 443, s: 'HTTPS' }, { n: 80, s: 'HTTP' }]);
      return {
        src: pick([`10.0.0.${rand(2, 254)}`, `192.168.1.${rand(2, 254)}`, `172.20.0.${rand(2, 254)}`]),
        dst: `192.168.0.${rand(2, 254)}`,
        port: `${p.n} (${p.s})`, dir: '외부 → 내부',
        verdict: 'DENY',
        why: '외부 인터페이스로 들어온 패킷의 출발지가 사설 IP다 → IP 스푸핑, 포트와 무관하게 차단.'
      };
    }
  ];
  const sc = pick(scenarios)();
  const options = [
    { main: 'ALLOW', sub: '', tone: 'allow' },
    { main: 'DENY',  sub: '', tone: 'deny' }
  ];

  return {
    type: 'firewall',
    section: 'firewall',
    title: 'FIREWALL RULE',
    prompt: '아래 패킷을 매뉴얼 §6 정책표와 대조하여 <b>ALLOW / DENY</b> 를 결정하시오.',
    render: 'verdict',
    packet: sc,
    options,
    answer: sc.verdict === 'ALLOW' ? 0 : 1,
    why: sc.why
  };
}

const BANK = [makeWireModule, makePortModule, makePhishModule, makeProtocolModule, makeAuthModule, makeFirewallModule];

/** 매판 서로 다른 유형 5개를 비복원 추출 */
function buildRound() {
  return shuffle(BANK).slice(0, CONFIG.MODULE_COUNT).map((fn) => fn());
}

/* =========================================================
   4. 렌더러
   ========================================================= */
function renderReadout(r) {
  if (!r) return '';
  return `<div class="readout">
    <div><p class="readout__k">${esc(r.k)}</p><p class="readout__v">${esc(r.v)}</p></div>
    <span class="readout__badge">${esc(r.badge)}</span>
  </div>`;
}

function renderWire(mod) {
  const Y = [46, 102, 158, 214];
  const cables = mod.options.map((w, i) => {
    const y = Y[i];
    return `<g class="wire-hit" data-i="${i}" style="color:${w.hex}">
      <rect x="16" y="${y - 20}" width="448" height="40" fill="transparent"/>
      <path class="wire-seg wire-seg--l" d="M28 ${y} C 96 ${y - 10} 168 ${y + 10} 232 ${y}"
            stroke="${w.hex}" stroke-width="11" stroke-linecap="round" fill="none"/>
      <path class="wire-seg wire-seg--r" d="M248 ${y} C 312 ${y - 10} 384 ${y + 10} 452 ${y}"
            stroke="${w.hex}" stroke-width="11" stroke-linecap="round" fill="none"/>
      <rect x="14" y="${y - 13}" width="16" height="26" rx="4" fill="#2b241a" stroke="rgba(255,232,200,.16)"/>
      <rect x="450" y="${y - 13}" width="16" height="26" rx="4" fill="#2b241a" stroke="rgba(255,232,200,.16)"/>
      <text class="wire-label" x="240" y="${y - 20}" text-anchor="middle">${w.ko}</text>
    </g>`;
  }).join('');

  return `<div class="wirebox"><svg viewBox="0 0 480 250" role="group" aria-label="케이블 4가닥">${cables}</svg></div>`;
}

function renderPacket(p) {
  return `<dl class="packet">
    <div><dt>SOURCE</dt><dd>${esc(p.src)}</dd></div>
    <div><dt>DESTINATION</dt><dd>${esc(p.dst)}</dd></div>
    <div><dt>DEST PORT</dt><dd>${esc(p.port)}</dd></div>
    <div><dt>DIRECTION</dt><dd>${esc(p.dir)}</dd></div>
  </dl>`;
}

function renderOptions(mod) {
  const kind = mod.render;
  const cls = kind === 'keypad' ? 'opts opts--grid4'
            : kind === 'chip' ? 'opts opts--grid4'
            : kind === 'verdict' ? 'opts opts--grid2'
            : 'opts';

  const items = mod.options.map((o, i) => {
    if (kind === 'keypad') {
      return `<button type="button" class="opt opt--key" data-i="${i}">
        <span class="opt__main">${esc(o.main)}</span><span class="opt__sub">${esc(o.sub)}</span></button>`;
    }
    if (kind === 'chip') {
      return `<button type="button" class="opt opt--chip" data-i="${i}">
        ${ICON[o.icon] || ''}<span class="opt__main">${esc(o.main)}</span>
        <span class="opt__sub">${esc(o.sub)}</span></button>`;
    }
    if (kind === 'verdict') {
      return `<button type="button" class="opt opt--verdict" data-tone="${o.tone}" data-i="${i}">${esc(o.main)}</button>`;
    }
    return `<button type="button" class="opt" data-i="${i}">
      <span class="opt__idx">${i + 1}</span>
      <span class="opt__main">${esc(o.main)}${o.sub ? `<span class="opt__sub">${esc(o.sub)}</span>` : ''}</span>
    </button>`;
  }).join('');

  return `<div class="${cls}">${items}</div>`;
}

/* 오답 시 노출하는 힌트 — 정답 자체는 알려주지 않는다 */
const HINT = {
  wire:     '매뉴얼 §1의 대역 경계를 다시 확인하라. 172와 192는 예외 구간이 있다.',
  port:     '매뉴얼 §2 포트표에서 해당 서비스 행을 다시 찾아라.',
  phish:    '매뉴얼 §3 — 프로토콜(http/https)과 맨 끝 도메인을 함께 보라.',
  protocol: '매뉴얼 §4 — 암호화 열과 평문 열을 혼동하지 마라.',
  auth:     '매뉴얼 §5 — 길이와 문자 조합을 동시에 만족하는지 보라.',
  firewall: '매뉴얼 §6 — 방향, 목적지 포트, 출발지 IP 세 가지를 모두 대조하라.'
};

/* =========================================================
   5. 게임 상태 / 루프
   ========================================================= */
const state = {
  round: [],
  idx: 0,
  time: CONFIG.TIME_MAX,
  strikes: 0,
  running: false,
  locked: false,
  lastTs: 0,
  raf: 0,
  log: []
};

const el = {};
['screenBrief', 'screenGame', 'screenEnd', 'btnStart', 'btnRetry', 'pips', 'strikes',
 'ringBar', 'timerDigits', 'bonusFx', 'deviceTitle', 'deviceSerial', 'modulePrompt',
 'deviceBody', 'feedback', 'devicePanel', 'resultTitle', 'resultDesc',
 'resultMark', 'resultLog', 'statModules', 'statStrikes', 'statTime',
 'book', 'bookStage', 'pageL', 'pageR', 'leaf', 'leafFront', 'leafBack',
 'bookPrev', 'bookNext', 'bookTabs', 'bookPageNo']
  .forEach((k) => { el[k] = $(k); });

function showScreen(name) {
  [el.screenBrief, el.screenGame, el.screenEnd].forEach((s) => s.classList.remove('is-active'));
  ({ brief: el.screenBrief, game: el.screenGame, end: el.screenEnd })[name].classList.add('is-active');
}

/* ---- HUD ---- */
function drawPips() {
  el.pips.innerHTML = state.round.map((_, i) => {
    const c = i < state.idx ? 'pip is-done' : i === state.idx ? 'pip is-current' : 'pip';
    return `<span class="${c}"></span>`;
  }).join('');
}

function drawStrikes() {
  let out = '';
  for (let i = 0; i < CONFIG.MAX_STRIKES; i++) {
    out += `<span class="strike${i < state.strikes ? ' is-hit' : ''}">${ICON.cross}</span>`;
  }
  el.strikes.innerHTML = out;
}

function drawTimer() {
  const t = Math.max(0, state.time);
  el.timerDigits.textContent = t.toFixed(1);
  const ratio = t / CONFIG.TIME_MAX;
  el.ringBar.style.strokeDashoffset = String(CONFIG.RING_LEN * (1 - ratio));
  document.body.classList.toggle('is-danger', t <= 10 && state.running);
}

/* ---- 타이머 루프 ---- */
function loop(ts) {
  if (!state.running) return;
  if (!state.lastTs) state.lastTs = ts;
  const dt = (ts - state.lastTs) / 1000;
  state.lastTs = ts;

  state.time -= dt;
  if (state.time <= 0) {
    state.time = 0;
    drawTimer();
    return endGame(false, 'timeout');
  }
  drawTimer();
  state.raf = requestAnimationFrame(loop);
}

/* ---- 모듈 출력 ---- */
function loadModule() {
  const mod = state.round[state.idx];
  state.locked = false;

  el.deviceTitle.textContent = mod.title;
  el.deviceSerial.textContent = `MOD ${state.idx + 1}/${CONFIG.MODULE_COUNT}`;
  el.modulePrompt.innerHTML = mod.prompt;
  el.feedback.className = 'feedback';
  el.feedback.textContent = '매뉴얼의 강조된 항목을 확인하라.';

  let html = '';
  if (mod.render === 'wire') html = renderReadout(mod.readout) + renderWire(mod);
  else if (mod.render === 'verdict') html = renderPacket(mod.packet) + renderOptions(mod);
  else html = renderReadout(mod.readout) + renderOptions(mod);

  el.deviceBody.innerHTML = html;
  el.deviceBody.querySelectorAll('[data-i]').forEach((node) => {
    node.addEventListener('click', () => answer(Number(node.dataset.i), node));
  });

  drawPips();
  book.openTo(mod.section);
}

/* ---- 판정 ---- */
function answer(i, node) {
  if (state.locked || !state.running) return;
  if (node.classList.contains('is-spent')) return;
  const mod = state.round[state.idx];
  const correct = i === mod.answer;
  state.locked = true;

  if (mod.render === 'wire') node.classList.add('is-cut');
  else node.classList.add(correct ? 'is-ok' : 'is-bad');

  state.log.push({ ok: correct, title: mod.title, why: mod.why });

  if (correct) {
    const before = state.time;
    state.time = Math.min(CONFIG.TIME_MAX, state.time + CONFIG.TIME_BONUS);
    const gained = state.time - before;
    flashBonus(gained);
    el.feedback.className = 'feedback is-ok';
    el.feedback.textContent = `해제 성공 — ${mod.why}`;
    drawTimer();

    setTimeout(() => {
      state.idx++;
      if (state.idx >= state.round.length) return endGame(true);
      loadModule();
    }, 780);
  } else {
    state.strikes++;
    drawStrikes();
    el.devicePanel.classList.add('is-wrong');
    setTimeout(() => el.devicePanel.classList.remove('is-wrong'), 460);
    el.feedback.className = 'feedback is-bad';
    const last = state.strikes >= CONFIG.MAX_STRIKES;
    // 기회가 남았으면 정답을 노출하지 않는다
    el.feedback.textContent = last
      ? `기폭 — ${mod.why}`
      : `오답 (${state.strikes}/${CONFIG.MAX_STRIKES}) — ${HINT[mod.type]}`;

    if (last) {
      return setTimeout(() => endGame(false, 'strikes'), 620);
    }
    // 같은 모듈 재시도 — 방금 고른 오답은 잠근다
    node.classList.add('is-spent');
    setTimeout(() => { state.locked = false; }, 620);
  }
}

function flashBonus(sec) {
  if (sec <= 0) {
    el.bonusFx.textContent = 'MAX';
  } else {
    el.bonusFx.textContent = `+${sec.toFixed(1)}s`;
  }
  el.bonusFx.classList.remove('is-on');
  void el.bonusFx.offsetWidth;
  el.bonusFx.classList.add('is-on');
}

/* ---- 종료 ---- */
function endGame(win, reason) {
  state.running = false;
  cancelAnimationFrame(state.raf);
  document.body.classList.remove('is-danger');

  if (!win) boom();

  el.statModules.textContent = `${state.idx} / ${CONFIG.MODULE_COUNT}`;
  el.statStrikes.textContent = String(state.strikes);
  el.statTime.textContent = `${Math.max(0, state.time).toFixed(1)}s`;

  const card = $('resultCard');
  card.classList.toggle('is-win', win);
  card.classList.toggle('is-lose', !win);
  el.resultMark.innerHTML = win ? ICON.shieldOk : ICON.shieldBad;
  el.resultTitle.textContent = win ? 'DEFUSED' : 'DETONATED';
  el.resultDesc.textContent = win
    ? '모든 모듈을 규정대로 해제했다. 기폭 회로가 완전히 차단되었다.'
    : reason === 'timeout'
      ? '타이머가 0에 도달했다. 규칙표를 먼저 읽고 조작 순서를 줄여라.'
      : '오답 3회로 기폭 회로가 활성화됐다. 매뉴얼의 예외 조항을 놓쳤다.';

  el.resultLog.innerHTML = state.log.map((l) => `
    <div class="logrow ${l.ok ? 'ok' : 'bad'}">
      <i></i><b>${esc(l.title)}</b>
      <span>${l.ok ? 'CLEARED' : 'FAILED'}</span>
    </div>`).join('') || '<div class="logrow"><i></i>기록 없음</div>';

  setTimeout(() => showScreen('end'), win ? 700 : 900);
}

function boom() {
  document.body.classList.add('is-blown');   // 등이 나간다
  const f = document.createElement('div');
  f.className = 'boom';
  document.body.appendChild(f);
  void f.offsetWidth;
  f.classList.add('is-on');
  setTimeout(() => f.remove(), 1000);
}

/* =========================================================
   6. 필드 매뉴얼 — 펼쳐지는 책
   ========================================================= */
const book = (() => {
  const SHEETS = [...$('manualSource').content.querySelectorAll('.man')]
    .map((a) => ({ sec: a.dataset.man, label: a.querySelector('h3 i').textContent, html: a.outerHTML }));

  const FLIP_MS = 620;
  let spread = 0;        // 현재 펼침면 번호
  let perView = 2;       // 화면당 페이지 수 (2 = 펼침, 1 = 낱장)
  let flipping = false;
  let activeSec = null;  // 현재 모듈이 참조하는 절

  const lastSpread = () => Math.ceil(SHEETS.length / perView) - 1;
  const leftIdx  = (s) => (perView === 2 ? s * 2 : -1);
  const rightIdx = (s) => (perView === 2 ? s * 2 + 1 : s);
  const spreadOf = (i) => Math.floor(i / perView);

  function pageHTML(i) {
    const sheet = SHEETS[i];
    if (!sheet) return '<div class="page__blank">부록 여백</div>';
    return `<div class="page__body">${sheet.html}</div><span class="page__no">${i + 1}</span>`;
  }

  function paint(node, i) {
    node.innerHTML = pageHTML(i);
    node.classList.toggle('is-active', !!SHEETS[i] && SHEETS[i].sec === activeSec);
  }

  function renderNow() {
    if (perView === 2) paint(el.pageL, leftIdx(spread));
    else { el.pageL.innerHTML = ''; el.pageL.classList.remove('is-active'); }
    paint(el.pageR, rightIdx(spread));
    updateChrome();
  }

  function updateChrome() {
    const shown = perView === 2 ? [leftIdx(spread), rightIdx(spread)] : [rightIdx(spread)];
    const valid = shown.filter((i) => SHEETS[i]);
    el.bookPageNo.textContent = `${valid.map((i) => i + 1).join('–')} / ${SHEETS.length}`;
    el.bookPrev.disabled = spread <= 0;
    el.bookNext.disabled = spread >= lastSpread();

    [...el.bookTabs.children].forEach((tab, i) => {
      tab.classList.toggle('is-open', valid.includes(i));
      tab.classList.toggle('is-current', SHEETS[i].sec === activeSec);
    });
  }

  /** 낱장을 실제로 넘긴다 */
  function goto(target, animate = true) {
    if (syncLayout()) animate = false;   // 모드가 막 바뀌었으면 애니메이션 없이 다시 그린다
    target = Math.max(0, Math.min(lastSpread(), target));
    if (flipping) return;
    if (target === spread) { renderNow(); return; }
    // 모션을 줄여달라고 한 사용자에겐 넘김 연출 없이 즉시 바꿔준다
    if (!animate || REDUCED.matches) { spread = target; renderNow(); return; }

    const forward = target > spread;
    flipping = true;

    if (forward) {
      // 오른쪽 낱장이 왼쪽으로 넘어간다
      el.leafFront.innerHTML = pageHTML(rightIdx(spread));
      el.leafBack.innerHTML = perView === 2 ? pageHTML(leftIdx(target)) : '';
      paint(el.pageR, rightIdx(target));           // 낱장 뒤에 새 오른쪽 페이지를 미리 깔아둔다
      el.leaf.className = 'leaf is-on';
      animateLeaf(0, -180, target);
    } else {
      // 왼쪽 낱장이 오른쪽으로 돌아온다
      el.leafFront.innerHTML = perView === 2 ? pageHTML(leftIdx(spread)) : pageHTML(rightIdx(spread));
      el.leafBack.innerHTML = pageHTML(rightIdx(target));
      if (perView === 2) paint(el.pageL, leftIdx(target));
      el.leaf.className = 'leaf is-on is-back';
      animateLeaf(0, 180, target);
    }
  }

  function animateLeaf(from, to, target) {
    const leaf = el.leaf;
    leaf.style.transition = 'none';
    leaf.style.transform = `rotateY(${from}deg)`;
    requestAnimationFrame(() => {
      leaf.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.42, .06, .28, 1)`;
      leaf.style.transform = `rotateY(${to}deg)`;
    });
    setTimeout(() => {
      spread = target;
      renderNow();
      leaf.className = 'leaf';
      leaf.style.transition = 'none';
      leaf.style.transform = 'rotateY(0deg)';
      flipping = false;
    }, FLIP_MS + 20);
  }

  /** 해당 절이 실린 면으로 펼친다 */
  function openTo(section) {
    activeSec = section;
    syncLayout();
    const i = SHEETS.findIndex((s) => s.sec === section);
    if (i < 0) { renderNow(); return; }
    const target = spreadOf(i);
    if (target === spread || flipping) { renderNow(); return; }
    goto(target);
  }

  /** 폭에 맞는 모드로 맞춘다. 바뀌었으면 true. (그리기는 호출한 쪽에서) */
  function syncLayout() {
    const next = NARROW.matches ? 1 : 2;
    if (next === perView) return false;
    // 현재 보고 있던 페이지를 유지한 채 모드 전환
    const keep = perView === 2 ? leftIdx(spread) : rightIdx(spread);
    perView = next;
    el.book.classList.toggle('is-single', perView === 1);
    spread = Math.min(lastSpread(), Math.max(0, spreadOf(Math.max(0, keep))));
    return true;
  }
  function applyLayout() { if (syncLayout()) renderNow(); }

  // 탭 버튼
  el.bookTabs.innerHTML = SHEETS.map((s, i) => `<button class="book__tab" type="button" data-i="${i}">${esc(s.label)}</button>`).join('');
  el.bookTabs.addEventListener('click', (e) => {
    const b = e.target.closest('.book__tab');
    if (b) goto(spreadOf(Number(b.dataset.i)));
  });
  el.bookPrev.addEventListener('click', () => goto(spread - 1));
  el.bookNext.addEventListener('click', () => goto(spread + 1));

  // resize 이벤트만 믿지 않는다 — 미디어 쿼리 자체의 변화를 듣는다
  const NARROW = window.matchMedia('(max-width: 760px)');
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (NARROW.addEventListener) NARROW.addEventListener('change', applyLayout);
  else NARROW.addListener(applyLayout);          // 구형 사파리
  window.addEventListener('resize', applyLayout);

  perView = NARROW.matches ? 1 : 2;
  el.book.classList.toggle('is-single', perView === 1);
  renderNow();

  return { openTo, goto, prev: () => goto(spread - 1), next: () => goto(spread + 1) };
})();

/* ---- 시작 ---- */
function startGame() {
  state.round = buildRound();
  state.idx = 0;
  state.time = CONFIG.TIME_MAX;
  state.strikes = 0;
  state.log = [];
  state.lastTs = 0;
  state.running = true;
  state.locked = false;

  document.body.classList.remove('is-blown');   // 등을 다시 켠다
  drawStrikes();
  drawTimer();
  showScreen('game');
  loadModule();

  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(loop);
}

el.btnStart.addEventListener('click', startGame);
el.btnRetry.addEventListener('click', startGame);

/* 숫자키 1~4 = 선택, 좌우 화살표 = 책장 넘기기 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft')  { book.prev(); return; }
  if (e.key === 'ArrowRight') { book.next(); return; }
  if (!state.running || state.locked) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    const node = el.deviceBody.querySelector(`[data-i="${n - 1}"]`);
    if (node) answer(n - 1, node);
  }
});

drawTimer();
