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
  MODULE_COUNT: 5
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
    { k: 'pub3',  ip: () => `${pick([8, 11, 52, 104, 203])}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`, wire: 'red', cls: '공인 IP' },
    { k: 'pub4',  ip: () => `172.${pick([8, 12, 15])}.${rand(0, 255)}.${rand(1, 254)}`, wire: 'red', cls: '공인 IP (172지만 16 미만)' },
    { k: 'pub5',  ip: () => `10${pick([1, 2, 3])}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`, wire: 'red', cls: '공인 IP (10 이 아니라 100번대)' }
  ];
  const kind = pick(kinds);
  const ip = kind.ip();
  const order = shuffle(WIRES);

  return {
    type: 'wire',
    section: 'wire',
    title: '배선 절단',
    prompt: `대상 호스트는 <b>${ip}</b> 입니다. 어느 대역인지 보고, 매뉴얼 §1을 보고 <b>자를 케이블 한 가닥</b>을 고르세요.`,
    render: 'wire',
    readout: { k: '대상 호스트', v: ip },
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
  { port: 110,  svc: 'POP3',   desc: '메일 수신(평문)' },
  { port: 143,  svc: 'IMAP',   desc: '메일 열람(평문)' },
  { port: 3389, svc: 'RDP',    desc: '원격 데스크톱' }
];

function makePortModule() {
  const target = pick(PORTS);
  const decoys = shuffle(PORTS.filter((p) => p.port !== target.port)).slice(0, 3);
  const { options, answer } = shuffleWithAnswer([target, ...decoys], target);

  return {
    type: 'port',
    section: 'port',
    title: '포트 키패드',
    prompt: `<b>${target.svc}</b> 서비스로 침해 트래픽이 들어오고 있어요. 매뉴얼 §2에서 표준 포트를 찾아 <b>차단 버튼</b>을 누르세요.`,
    render: 'keypad',
    readout: { k: '차단할 서비스', v: target.svc },
    options: options.map((p) => ({ main: String(p.port), sub: '포트' })),
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
  'https://www.gov.kr/portal',
  'https://www.wooribank.com/login',
  'https://mail.daum.net',
  'https://cert.kisa.or.kr'
];
const BAD_URLS = [
  { u: 'http://www.naver.com/login',            r: 'http 평문 로그인 페이지' },
  { u: 'https://nave-r.com/login',              r: '도메인 철자 변조(하이픈 삽입)' },
  { u: 'https://www.kakaoo.com/auth',           r: '도메인 철자 변조(문자 중복)' },
  { u: 'https://g00gle.com/account',            r: '숫자 0 으로 문자 치환' },
  { u: 'https://naver.com.login-kr.net/id',     r: '서브도메인 위장 — 실제 도메인은 login-kr.net' },
  { u: 'http://203.0.113.9/login',              r: 'IP 직접 접속' },
  { u: 'https://shinhan-bank.security-kr.top/', r: '무관한 최종 도메인(security-kr.top)' },
  { u: 'https://gov-kr.verify-login.info/auth',   r: '서브도메인 위장 — 실제 도메인은 verify-login.info' },
  { u: 'https://www.daum-net.com/mail',          r: '점을 하이픈으로 바꾼 철자 변조' },
  { u: 'http://192.168.0.77/admin',              r: 'IP 직접 접속 + http 평문 관리자 페이지' },
  { u: 'https://kisa-cert.or-kr.com/notice',     r: 'or.kr 을 or-kr.com 으로 위장' }
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
    title: '주소 판별',
    prompt: findSafe
      ? '네 주소 중 <b>접속을 허용해도 되는 것</b> 하나를 고르세요. (매뉴얼 §3)'
      : '네 주소 중 <b>바로 차단해야 할 피싱 주소</b> 하나를 고르세요. (매뉴얼 §3)',
    render: 'list',
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
    title: '프로토콜 스위치',
    prompt: findEncrypted
      ? '통신은 살려둬야 해요. 네 스위치 중 <b>암호화되는 프로토콜</b>을 올리세요. (매뉴얼 §4)'
      : '도청 위험을 없애야 해요. 네 스위치 중 <b>평문(암호화 안 되는) 프로토콜</b>을 내리세요. (매뉴얼 §4)',
    render: 'chip',
    options: options.map((p) => ({ main: p.name, sub: p.d, icon: findEncrypted ? 'lock' : 'unlock' })),
    answer,
    why: `${target.name} — ${target.d}.`
  };
}

/* --- M5. 인증 다이얼 (비밀번호 강도) --- */
const PW_STRONG = [
  'Tr0ub4dor&3Xk!', 'Qz#7mLp2$Wne', 'B!ue-Sky_92xR', 'Hx9@vTm4!Lqz',
  'Rn6%kDw8@Vxs2', 'Jm4!qYt7#Pza9', 'Wc3^bNu5*Kre1'
];
const PW_WEAK = [
  { p: 'password1',   r: '사전 단어 그대로 사용' },
  { p: 'admin1234',   r: '기본 계정명 + 연속 숫자' },
  { p: 'qwerty!',     r: '키보드 연속 배열, 8자 미만' },
  { p: '19980312',    r: '생년월일' },
  { p: 'ilovekorea',  r: '소문자 단어만, 조합 없음' },
  { p: 'Ab1!',        r: '조합은 좋지만 4자로 너무 짧음' },
  { p: '01012345678', r: '전화번호' },
  { p: 'abcd1234',    r: '알파벳·숫자 연속 나열' },
  { p: 'samsung2024', r: '회사명 + 연도' },
  { p: 'Pa$$w0rd',    r: 'password 를 기호로 살짝 바꾼 것뿐 (사전 공격에 그대로 뚫림)' },
  { p: '!Qq1',        r: '조합은 좋지만 4자로 너무 짧음' }
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
    title: '인증 다이얼',
    prompt: findStrong
      ? '기폭 잠금을 다시 걸어야 해요. <b>가장 안전한 비밀번호</b>를 고르세요. (매뉴얼 §5)'
      : '유출된 계정을 찾아야 해요. <b>가장 취약한 비밀번호</b>를 고르세요. (매뉴얼 §5)',
    render: 'list',
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
    },
    () => { // 외부 → 내부 메일·DB 포트 : DENY (표에 없으면 막는다)
      const p = pick([{ n: 110, s: 'POP3' }, { n: 143, s: 'IMAP' }, { n: 21, s: 'FTP' }]);
      return {
        src: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        dst: `192.168.0.${rand(2, 254)}`,
        port: `${p.n} (${p.s})`, dir: '외부 → 내부',
        verdict: 'DENY',
        why: `외부 → 내부 허용은 80·443 뿐이다. ${p.s}(${p.n}) 는 표에 없으므로 차단한다.`
      };
    },
    () => { // 내부 → 외부 위험 포트 : ALLOW (방향이 먼저다)
      const p = pick([{ n: 22, s: 'SSH' }, { n: 3389, s: 'RDP' }]);
      return {
        src: `192.168.0.${rand(2, 254)}`,
        dst: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        port: `${p.n} (${p.s})`, dir: '내부 → 외부',
        verdict: 'ALLOW',
        why: `${p.s}(${p.n}) 라도 나가는 방향이면 허용이다. 포트보다 방향을 먼저 본다.`
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
    title: '방화벽 정책',
    prompt: '이 패킷을 매뉴얼 §6 정책표와 맞춰 보고 <b>ALLOW / DENY</b> 를 정하세요.',
    render: 'verdict',
    packet: sc,
    options,
    answer: sc.verdict === 'ALLOW' ? 0 : 1,
    why: sc.why
  };
}

/* --- M7. 순서 회로 : 순서를 틀리면 그 자리에서 오조작 --- */
const SEQUENCES = [
  {
    section: 'order',
    label: 'TCP 연결 수립',
    prompt: 'TCP 연결이 맺어지는 순서대로 <b>접점을 밟으세요</b>. (매뉴얼 §7)',
    hint: '매뉴얼 §7 — 요청을 보낸 쪽이 마지막에 한 번 더 확인해 줍니다.',
    steps: [
      { main: 'SYN', sub: '연결 요청' },
      { main: 'SYN + ACK', sub: '요청 수락 + 되묻기' },
      { main: 'ACK', sub: '되묻기에 응답' }
    ],
    why: 'TCP 3-way 핸드셰이크는 SYN → SYN/ACK → ACK 순서다.'
  },
  {
    section: 'order',
    label: '침해 사고 대응',
    prompt: '침해 사고 대응 절차 순서대로 <b>접점을 밟으세요</b>. (매뉴얼 §7)',
    hint: '매뉴얼 §7 — 원인을 캐기 전에 번지는 것부터 막습니다.',
    steps: [
      { main: '탐지', sub: '이상 징후 확인' },
      { main: '차단·격리', sub: '확산 중지' },
      { main: '분석', sub: '원인·경로 파악' },
      { main: '복구', sub: '정상화 후 재발 방지' }
    ],
    why: '대응은 탐지 → 차단·격리 → 분석 → 복구 순서다. 격리보다 분석을 먼저 하면 피해가 번진다.'
  },
  {
    section: 'order',
    label: 'https 접속 흐름',
    prompt: '브라우저가 https 사이트에 닿기까지의 순서대로 <b>접점을 밟으세요</b>. (매뉴얼 §7)',
    hint: '매뉴얼 §7 — 주소를 숫자로 바꾸는 일이 가장 먼저입니다.',
    steps: [
      { main: 'DNS 조회', sub: '도메인 → IP' },
      { main: 'TCP 연결', sub: '3-way 핸드셰이크' },
      { main: 'TLS handshake', sub: '암호화 통로 개설' },
      { main: 'HTTP 요청', sub: '실제 데이터 주고받기' }
    ],
    why: '주소를 IP 로 바꾸고(DNS) → 연결을 맺고(TCP) → 암호화 통로를 열고(TLS) → 그제서야 요청을 보낸다.'
  },
  {
    section: 'order',
    label: '계층 아래에서 위로',
    prompt: '데이터가 거쳐 올라가는 계층 순서대로 <b>접점을 밟으세요</b>. (매뉴얼 §7)',
    hint: '매뉴얼 §7 — 케이블에 가장 가까운 것이 맨 아래입니다.',
    steps: [
      { main: '물리', sub: '케이블 · 전기 신호' },
      { main: '데이터링크', sub: 'MAC 주소 · 스위치' },
      { main: '네트워크', sub: 'IP 주소 · 라우터' },
      { main: '전송', sub: 'TCP · 포트' }
    ],
    why: '아래에서 위로 물리 → 데이터링크 → 네트워크 → 전송 순이다.'
  }
];

function makeSequenceModule() {
  const sc = pick(SEQUENCES);
  const options = shuffle(sc.steps.map((st, i) => ({ main: st.main, sub: st.sub, step: i })));
  return {
    type: 'sequence',
    section: sc.section,
    title: '순서 회로',
    prompt: sc.prompt,
    hint: sc.hint,
    render: 'seq',
    readout: { k: '절차', v: sc.label },
    options,
    why: sc.why
  };
}

/* --- M8. 다중 차단 : 해당하는 것을 전부 올린 뒤 레버로 확정 --- */
const PRIVATE_IPS = [
  () => '10.' + rand(0, 255) + '.' + rand(0, 255) + '.' + rand(1, 254),
  () => '172.' + rand(16, 31) + '.' + rand(0, 255) + '.' + rand(1, 254),
  () => '192.168.' + rand(0, 255) + '.' + rand(1, 254)
];
const PUBLIC_IPS = [
  () => pick([8, 13, 45, 104, 203]) + '.' + rand(0, 255) + '.' + rand(0, 255) + '.' + rand(1, 254),
  () => '172.' + rand(32, 90) + '.' + rand(0, 255) + '.' + rand(1, 254),
  () => '192.' + pick([167, 169, 170]) + '.' + rand(0, 255) + '.' + rand(1, 254)
];

/** 적중 항목의 인덱스 목록 */
function hitIndexes(options) {
  return options.map((o, i) => (o.hit ? i : -1)).filter((i) => i >= 0);
}

function makeMultiModule() {
  const kind = pick(['proto', 'ip', 'url']);

  if (kind === 'proto') {
    const hits = shuffle(PROTO_PLAIN).slice(0, rand(2, 3)).map((p) => ({ main: p.name, sub: p.d, icon: 'unlock', hit: true }));
    const rest = shuffle(PROTO_ENC).slice(0, 5 - hits.length).map((p) => ({ main: p.name, sub: p.d, icon: 'lock', hit: false }));
    const options = shuffle(hits.concat(rest));
    return {
      type: 'multi', section: 'protocol', title: '다중 차단',
      prompt: '평문 프로토콜을 <b>남김없이</b> 올린 뒤 레버로 확정하세요. 하나라도 빠지면 도청이 남습니다. (매뉴얼 §4)',
      hint: '매뉴얼 §4 — 암호화 열에 없는 것은 전부 평문입니다.',
      render: 'multi',
      readout: { k: '차단 조건', v: '평문 프로토콜' },
      options,
      answerSet: hitIndexes(options),
      why: '평문은 ' + hits.map((h) => h.main).join(' · ') + ' 다. 나머지는 암호화 계열이라 끊으면 통신이 죽는다.'
    };
  }

  if (kind === 'ip') {
    const hits = shuffle(PRIVATE_IPS).slice(0, rand(2, 3)).map((f) => ({ main: f(), sub: '', hit: true }));
    const rest = shuffle(PUBLIC_IPS).slice(0, 5 - hits.length).map((f) => ({ main: f(), sub: '', hit: false }));
    const options = shuffle(hits.concat(rest));
    return {
      type: 'multi', section: 'wire', title: '다중 차단',
      prompt: '아래 주소 중 <b>사설 IP 를 전부</b> 올린 뒤 레버로 확정하세요. (매뉴얼 §1)',
      hint: '매뉴얼 §1 — 172 와 192 는 숫자를 끝까지 봐야 합니다.',
      render: 'multi',
      readout: { k: '차단 조건', v: '사설 IP 대역' },
      options,
      answerSet: hitIndexes(options),
      why: '사설 대역은 ' + hits.map((h) => h.main).join(' · ') + ' 다. 10 / 172.16~31 / 192.168 세 갈래만 사설이다.'
    };
  }

  const bads = shuffle(BAD_URLS).slice(0, rand(2, 3)).map((b) => ({ main: b.u, sub: '', hit: true, r: b.r }));
  const safes = shuffle(SAFE_URLS).slice(0, 5 - bads.length).map((u) => ({ main: u, sub: '', hit: false }));
  const options = shuffle(bads.concat(safes));
  return {
    type: 'multi', section: 'phish', title: '다중 차단',
    prompt: '아래 주소 중 <b>피싱을 전부</b> 올린 뒤 레버로 확정하세요. 정상 주소를 올리면 서비스가 끊깁니다. (매뉴얼 §3)',
    hint: '매뉴얼 §3 — 맨 끝 도메인이 원본과 같은지 하나씩 보세요.',
    render: 'multi',
    readout: { k: '차단 조건', v: '피싱 주소' },
    options,
    answerSet: hitIndexes(options),
    why: bads.map((b) => b.main + ' — ' + b.r).join(' / ')
  };
}

/* --- M9. 다이얼 : 눈금을 돌려 값을 맞추고 잠근다 --- */
const MASKS = [
  { cidr: '/8',  bytes: 1, mask: '255.0.0.0' },
  { cidr: '/16', bytes: 2, mask: '255.255.0.0' },
  { cidr: '/24', bytes: 3, mask: '255.255.255.0' }
];

/** 시작 눈금은 정답이 아닌 자리에서 출발한다 */
function offAnswer(answer, len) {
  return (answer + rand(1, len - 1)) % len;
}

function makeDialModule() {
  const kind = pick(['toMask', 'toCidr', 'toPort']);

  if (kind === 'toMask') {
    const t = pick(MASKS);
    const options = MASKS.map((m) => ({ main: m.mask })).concat([{ main: '255.255.255.255' }, { main: '0.0.0.0' }]);
    const answer = options.findIndex((o) => o.main === t.mask);
    return {
      type: 'dial', section: 'subnet', title: '서브넷 다이얼',
      prompt: '프리픽스 <b>' + t.cidr + '</b> 에 해당하는 서브넷 마스크로 눈금을 돌린 뒤 잠그세요. (매뉴얼 §8)',
      hint: '매뉴얼 §8 — 프리픽스 숫자를 8 로 나누면 255 가 몇 칸인지 나옵니다.',
      render: 'dial',
      readout: { k: '프리픽스', v: t.cidr },
      options,
      answer,
      start: offAnswer(answer, options.length),
      why: t.cidr + ' 는 앞 ' + t.bytes + ' 칸이 255 → ' + t.mask + ' 다.'
    };
  }

  if (kind === 'toCidr') {
    const t = pick(MASKS);
    const options = MASKS.map((m) => ({ main: m.cidr })).concat([{ main: '/32' }, { main: '/0' }]);
    const answer = options.findIndex((o) => o.main === t.cidr);
    return {
      type: 'dial', section: 'subnet', title: '서브넷 다이얼',
      prompt: '서브넷 마스크 <b>' + t.mask + '</b> 를 프리픽스 표기로 돌린 뒤 잠그세요. (매뉴얼 §8)',
      hint: '매뉴얼 §8 — 255 한 칸이 8 비트입니다.',
      render: 'dial',
      readout: { k: '서브넷 마스크', v: t.mask },
      options,
      answer,
      start: offAnswer(answer, options.length),
      why: t.mask + ' 는 255 가 ' + t.bytes + ' 칸 → ' + t.cidr + ' 다.'
    };
  }

  const t = pick(PORTS);
  const pool = shuffle(PORTS.filter((p) => p.port !== t.port)).slice(0, 4);
  const options = shuffle([t].concat(pool)).map((p) => ({ main: String(p.port) }));
  const answer = options.findIndex((o) => o.main === String(t.port));
  return {
    type: 'dial', section: 'port', title: '포트 다이얼',
    prompt: '<b>' + t.svc + '</b> 의 표준 포트로 눈금을 돌린 뒤 잠그세요. (매뉴얼 §2)',
    hint: '매뉴얼 §2 포트표에서 그 서비스가 있는 줄을 찾아보세요.',
    render: 'dial',
    readout: { k: '대상 서비스', v: t.svc },
    options,
    answer,
    start: offAnswer(answer, options.length),
    why: t.svc + ' 의 표준 포트는 ' + t.port + ' 번이다.'
  };
}

/* --- M10. 무선 암호화 스위치 --- */
const WIFI = [
  { name: 'WEP',  d: '가장 오래된 방식 — 몇 분이면 뚫린다' },
  { name: 'WPA',  d: 'WEP 의 땜질 — 여전히 취약점이 남아 있다' },
  { name: 'WPA2', d: 'AES 암호화 — 오랫동안 표준으로 쓰였다' },
  { name: 'WPA3', d: '지금 시점에서 가장 강한 방식' }
];

function makeWifiModule() {
  const findStrongest = Math.random() < 0.5;
  const target = findStrongest ? WIFI[3] : WIFI[0];
  const options = shuffle(WIFI);
  const answer = options.findIndex((w) => w.name === target.name);

  return {
    type: 'wifi',
    section: 'wifi',
    title: '무선 암호화 스위치',
    prompt: findStrongest
      ? '무선 인증을 새로 걸어야 해요. 넷 중 <b>가장 강한 암호화 방식</b>을 고르세요. (매뉴얼 §9)'
      : '오래된 공유기부터 정리해야 해요. 넷 중 <b>가장 취약한 암호화 방식</b>을 고르세요. (매뉴얼 §9)',
    render: 'list',
    options: options.map((w) => ({ main: w.name, sub: w.d })),
    answer,
    why: `${target.name} — ${target.d}.`
  };
}

/* --- M11. 짝 맞추기 : 두 번 눌러 서로 대응하는 것을 잇는다 --- */
const MATCH_PROTO_PAIRS = [
  { a: 'HTTP',   b: 'HTTPS', aSub: '평문', bSub: '암호화 버전' },
  { a: 'FTP',    b: 'SFTP',  aSub: '평문', bSub: '암호화 버전' },
  { a: 'Telnet', b: 'SSH',   aSub: '평문', bSub: '암호화 버전' }
];

function makeMatchModule() {
  const kind = pick(['port', 'proto']);

  if (kind === 'port') {
    const chosen = shuffle(PORTS).slice(0, 3);
    const tiles = [];
    chosen.forEach((p, i) => {
      tiles.push({ main: String(p.port), sub: '포트', pair: i });
      tiles.push({ main: p.svc, sub: '서비스', pair: i });
    });
    return {
      type: 'match',
      section: 'port',
      title: '짝 맞추기',
      prompt: '포트 번호와 서비스 이름을 <b>짝지어</b> 두 번씩 누르세요. (매뉴얼 §2)',
      hint: '매뉴얼 §2 포트표에서 번호와 서비스를 나란히 보세요.',
      render: 'match',
      options: shuffle(tiles),
      pairCount: chosen.length,
      why: chosen.map((p) => `${p.port} = ${p.svc}`).join(' · ')
    };
  }

  const tiles = [];
  MATCH_PROTO_PAIRS.forEach((pr, i) => {
    tiles.push({ main: pr.a, sub: pr.aSub, pair: i });
    tiles.push({ main: pr.b, sub: pr.bSub, pair: i });
  });
  return {
    type: 'match',
    section: 'protocol',
    title: '짝 맞추기',
    prompt: '평문 프로토콜과 이를 대신할 <b>암호화 버전</b>을 짝지어 두 번씩 누르세요. (매뉴얼 §4)',
    hint: '매뉴얼 §4 표에서 같은 줄에 있는 것끼리 짝입니다.',
    render: 'match',
    options: shuffle(tiles),
    pairCount: MATCH_PROTO_PAIRS.length,
    why: MATCH_PROTO_PAIRS.map((p) => `${p.a} → ${p.b}`).join(' · ')
  };
}

const BANK = [
  makeWireModule, makePortModule, makePhishModule, makeProtocolModule, makeAuthModule, makeFirewallModule,
  makeSequenceModule, makeMultiModule, makeDialModule, makeWifiModule, makeMatchModule
];

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
    <div><dt>출발지</dt><dd>${esc(p.src)}</dd></div>
    <div><dt>목적지</dt><dd>${esc(p.dst)}</dd></div>
    <div><dt>목적지 포트</dt><dd>${esc(p.port)}</dd></div>
    <div><dt>방향</dt><dd>${esc(p.dir)}</dd></div>
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

/* ---- 순서 회로 : 번호가 매겨지는 발판 ---- */
function renderSeq(mod) {
  const steps = mod.options.map((o, i) => `<button type="button" class="opt opt--seq" data-i="${i}" data-step="${o.step}">
      <span class="opt__order"></span>
      <span class="opt__main">${esc(o.main)}${o.sub ? `<span class="opt__sub">${esc(o.sub)}</span>` : ''}</span>
    </button>`).join('');
  return `<div class="opts opts--seq">${steps}</div>
    <p class="strip"><span>순서대로 밟으세요</span><b class="seq__count">0 / ${mod.options.length}</b></p>`;
}

/* ---- 다중 차단 : 스위치를 올린 뒤 레버를 내려야 확정된다 ---- */
function renderMulti(mod) {
  const rows = mod.options.map((o, i) => `<button type="button" class="opt opt--multi" data-i="${i}" aria-pressed="false">
      <span class="opt__latch" aria-hidden="true"></span>
      <span class="opt__main">${esc(o.main)}${o.sub ? `<span class="opt__sub">${esc(o.sub)}</span>` : ''}</span>
    </button>`).join('');
  return `<div class="opts">${rows}</div>
    <p class="strip"><span>올린 스위치</span><b class="multi__count">0 / ${mod.answerSet.length}</b>
      <button type="button" class="lever" data-commit>내려서 확정</button></p>`;
}

/* ---- 다이얼 : 눈금을 돌려 값을 맞춘다 ---- */
function renderDial(mod) {
  return `<div class="dial">
      <button type="button" class="dial__knob" data-dir="-1" aria-label="왼쪽으로 돌리기">
        <svg viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="dial__win">
        <span class="dial__val"></span>
        <span class="dial__pos"></span>
      </div>
      <button type="button" class="dial__knob" data-dir="1" aria-label="오른쪽으로 돌리기">
        <svg viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <p class="strip"><span>눈금을 맞춘 뒤 잠그세요</span>
      <button type="button" class="lever" data-commit>눌러서 잠금</button></p>`;
}

/* ---- 짝 맞추기 : 두 장을 눌러 서로 대응하는지 본다 ---- */
function renderMatch(mod) {
  const tiles = mod.options.map((o, i) => `<button type="button" class="opt opt--match" data-i="${i}" data-pair="${o.pair}">
      <span class="opt__main">${esc(o.main)}${o.sub ? `<span class="opt__sub">${esc(o.sub)}</span>` : ''}</span>
    </button>`).join('');
  return `<div class="opts opts--match">${tiles}</div>
    <p class="strip"><span>짝을 찾아 두 번 누르세요</span><b class="match__count">0 / ${mod.pairCount}</b></p>`;
}

/* 오답 시 노출하는 힌트 — 정답 자체는 알려주지 않는다 */
const HINT = {
  wire:     '매뉴얼 §1의 대역 경계를 다시 볼까요. 172와 192에는 예외 구간이 있어요.',
  port:     '매뉴얼 §2 포트표에서 그 서비스가 있는 줄을 다시 찾아보세요.',
  phish:    '매뉴얼 §3 — 프로토콜(http/https)과 맨 끝 도메인을 같이 봐야 해요.',
  protocol: '매뉴얼 §4 — 암호화 열과 평문 열이 헷갈리기 쉬워요.',
  auth:     '매뉴얼 §5 — 길이와 문자 조합을 동시에 만족하는지 보세요.',
  firewall: '매뉴얼 §6 — 방향과 목적지 포트, 출발지 IP 를 하나씩 맞춰 보세요.',
  sequence: '매뉴얼 §7 의 순서를 다시 확인해 보세요.',
  multi:    '해당하는 것을 하나도 빠뜨리지 않아야 합니다.',
  dial:     '눈금을 한 칸씩 돌려 매뉴얼의 값과 맞춰 보세요.',
  wifi:     '매뉴얼 §9 — 뒤에 붙은 숫자가 클수록 최신 방식입니다.',
  match:    '먼저 고른 한 장을 다시 보고, 매뉴얼에서 같은 줄에 있는 짝을 찾아보세요.'
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
 'fuseBar', 'timerDigits', 'bonusFx', 'deviceTitle', 'deviceSerial', 'modulePrompt',
 'deviceBody', 'feedback', 'bombBody', 'resultTitle', 'resultDesc',
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
  el.fuseBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
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
  el.deviceSerial.textContent = `회로 ${state.idx + 1} / ${CONFIG.MODULE_COUNT}`;
  el.modulePrompt.innerHTML = mod.prompt;
  el.feedback.className = 'feedback';
  el.feedback.textContent = '매뉴얼에서 해당 조항을 찾아 대조하세요.';

  let html = '';
  if (mod.render === 'wire') html = renderReadout(mod.readout) + renderWire(mod);
  else if (mod.render === 'verdict') html = renderPacket(mod.packet) + renderOptions(mod);
  else if (mod.render === 'seq') html = renderReadout(mod.readout) + renderSeq(mod);
  else if (mod.render === 'multi') html = renderReadout(mod.readout) + renderMulti(mod);
  else if (mod.render === 'dial') html = renderReadout(mod.readout) + renderDial(mod);
  else if (mod.render === 'match') html = renderReadout(mod.readout) + renderMatch(mod);
  else html = renderReadout(mod.readout) + renderOptions(mod);

  el.deviceBody.innerHTML = html;

  // 조작 방식마다 손이 다르다 — 하나씩 고르기 / 순서대로 밟기 / 여럿 올리고 확정 / 돌려 맞추기 / 짝짓기
  if (mod.render === 'seq') bindSequence(mod);
  else if (mod.render === 'multi') bindMulti(mod);
  else if (mod.render === 'dial') bindDial(mod);
  else if (mod.render === 'match') bindMatch(mod);
  else {
    el.deviceBody.querySelectorAll('[data-i]').forEach((node) => {
      node.addEventListener('click', () => answer(Number(node.dataset.i), node));
    });
  }

  drawPips();
  book.openTo(mod.section);
}

/* =========================================================
   5-1. 채점 — 조작 방식이 달라도 판정 이후는 똑같다
   ========================================================= */

/** 성공 : 시간 회복 → 다음 회로 (없으면 해제 완료) */
function scoreCorrect(mod) {
  state.locked = true;
  state.log.push({ ok: true, title: mod.title, why: mod.why });

  const before = state.time;
  state.time = Math.min(CONFIG.TIME_MAX, state.time + CONFIG.TIME_BONUS);
  flashBonus(state.time - before);
  el.feedback.className = 'feedback is-ok';
  el.feedback.textContent = `끊었습니다 — ${mod.why}`;
  drawTimer();

  setTimeout(() => {
    state.idx++;
    if (state.idx >= state.round.length) return endGame(true);
    loadModule();
  }, 780);
}

/**
 * 실패 : 오조작 1회 적립. 세 번째면 기폭.
 * @param onRetry 아직 기회가 남았을 때 회로를 되돌리는 처리
 */
function scoreWrong(mod, onRetry) {
  state.locked = true;
  state.log.push({ ok: false, title: mod.title, why: mod.why });

  state.strikes++;
  drawStrikes();
  el.bombBody.classList.add('is-wrong');
  setTimeout(() => el.bombBody.classList.remove('is-wrong'), 460);

  const last = state.strikes >= CONFIG.MAX_STRIKES;
  el.feedback.className = 'feedback is-bad';
  // 기회가 남았으면 정답을 노출하지 않는다
  el.feedback.textContent = last
    ? `기폭 — ${mod.why}`
    : `오조작 (${state.strikes}/${CONFIG.MAX_STRIKES}) — ${mod.hint || HINT[mod.type]}`;

  if (last) return setTimeout(() => endGame(false, 'strikes'), 620);
  setTimeout(() => { state.locked = false; if (onRetry) onRetry(); }, 620);
}

/* ---- 조작 1. 하나 고르기 (배선 · 키패드 · 목록 · 칩 · 판정) ---- */
function answer(i, node) {
  if (state.locked || !state.running) return;
  if (node.classList.contains('is-spent')) return;
  const mod = state.round[state.idx];
  const correct = i === mod.answer;

  if (mod.render === 'wire') node.classList.add('is-cut');
  else node.classList.add(correct ? 'is-ok' : 'is-bad');

  if (correct) return scoreCorrect(mod);
  // 같은 회로 재시도 — 방금 고른 것만 잠근다
  scoreWrong(mod, () => node.classList.add('is-spent'));
}

/* ---- 조작 2. 순서대로 밟기 ---- */
function bindSequence(mod) {
  const box = el.deviceBody;
  let step = 0;
  const counter = box.querySelector('.seq__count');
  const nodes = [...box.querySelectorAll('[data-i]')];

  const reset = () => {
    step = 0;
    nodes.forEach((n) => { n.classList.remove('is-ok', 'is-bad'); n.querySelector('.opt__order').textContent = ''; });
    counter.textContent = `0 / ${nodes.length}`;
  };

  nodes.forEach((node) => {
    node.addEventListener('click', () => {
      if (state.locked || !state.running) return;
      if (node.classList.contains('is-ok')) return;

      if (Number(node.dataset.step) !== step) {
        node.classList.add('is-bad');
        return scoreWrong(mod, reset);
      }
      step++;
      node.classList.add('is-ok');
      node.querySelector('.opt__order').textContent = String(step);
      counter.textContent = `${step} / ${nodes.length}`;
      if (step === nodes.length) scoreCorrect(mod);
    });
  });
}

/* ---- 조작 3. 여럿 올리고 확정 ---- */
function bindMulti(mod) {
  const box = el.deviceBody;
  const nodes = [...box.querySelectorAll('[data-i]')];
  const commit = box.querySelector('[data-commit]');
  const counter = box.querySelector('.multi__count');
  const need = mod.answerSet.length;

  const picked = () => nodes.filter((n) => n.classList.contains('is-picked'));
  const refresh = () => {
    counter.textContent = `${picked().length} / ${need}`;
    commit.disabled = picked().length === 0;
  };

  nodes.forEach((node) => {
    node.addEventListener('click', () => {
      if (state.locked || !state.running) return;
      node.classList.toggle('is-picked');
      node.setAttribute('aria-pressed', String(node.classList.contains('is-picked')));
      refresh();
    });
  });

  commit.addEventListener('click', () => {
    if (state.locked || !state.running) return;
    const got = picked().map((n) => Number(n.dataset.i)).sort((a, b) => a - b);
    const want = [...mod.answerSet].sort((a, b) => a - b);
    const same = got.length === want.length && got.every((v, i) => v === want[i]);

    if (same) {
      picked().forEach((n) => n.classList.add('is-ok'));
      return scoreCorrect(mod);
    }
    picked().forEach((n) => n.classList.add('is-bad'));
    scoreWrong(mod, () => {
      nodes.forEach((n) => { n.classList.remove('is-picked', 'is-bad'); n.setAttribute('aria-pressed', 'false'); });
      refresh();
    });
  });

  refresh();
}

/* ---- 조작 4. 돌려서 맞추기 ---- */
function bindDial(mod) {
  const box = el.deviceBody;
  const val = box.querySelector('.dial__val');
  const commit = box.querySelector('[data-commit]');
  let at = mod.start;

  const paint = () => {
    val.textContent = mod.options[at].main;
    val.classList.remove('is-turn');
    void val.offsetWidth;
    val.classList.add('is-turn');
    box.querySelector('.dial__pos').textContent = `${at + 1} / ${mod.options.length}`;
  };

  box.querySelectorAll('[data-dir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.locked || !state.running) return;
      const n = mod.options.length;
      at = (at + Number(btn.dataset.dir) + n) % n;   // 눈금은 끝에서 이어진다
      paint();
    });
  });

  commit.addEventListener('click', () => {
    if (state.locked || !state.running) return;
    if (at === mod.answer) { val.classList.add('is-ok'); return scoreCorrect(mod); }
    val.classList.add('is-bad');
    scoreWrong(mod, () => val.classList.remove('is-bad'));
  });

  paint();
}

/* ---- 조작 5. 짝 맞추기 : 두 장을 눌러 짝이 맞는지 본다 ---- */
function bindMatch(mod) {
  const box = el.deviceBody;
  const nodes = [...box.querySelectorAll('[data-i]')];
  const counter = box.querySelector('.match__count');
  let first = null;
  let matched = 0;

  const reset = () => {
    nodes.forEach((n) => n.classList.remove('is-ok', 'is-bad', 'is-selected'));
    first = null;
    matched = 0;
    counter.textContent = `0 / ${mod.pairCount}`;
  };

  nodes.forEach((node) => {
    node.addEventListener('click', () => {
      if (state.locked || !state.running) return;
      if (node.classList.contains('is-ok') || node === first) return;

      if (!first) {
        first = node;
        node.classList.add('is-selected');
        return;
      }

      if (node.dataset.pair === first.dataset.pair) {
        node.classList.add('is-ok');
        first.classList.remove('is-selected');
        first.classList.add('is-ok');
        first = null;
        matched++;
        counter.textContent = `${matched} / ${mod.pairCount}`;
        if (matched === mod.pairCount) scoreCorrect(mod);
        return;
      }

      node.classList.add('is-bad');
      first.classList.remove('is-selected');
      first.classList.add('is-bad');
      first = null;
      scoreWrong(mod, reset);
    });
  });
}

function flashBonus(sec) {
  if (sec <= 0) {
    el.bonusFx.textContent = '최대';
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
  el.resultTitle.textContent = win ? '해제 완료' : '기폭';
  el.resultDesc.textContent = win
    ? '회로 다섯 개를 모두 규정대로 끊었어요. 기폭 회로가 완전히 죽었습니다.'
    : reason === 'timeout'
      ? '시간이 다 됐습니다. 손대기 전에 매뉴얼을 먼저 펴 두면 훨씬 빨라져요.'
      : '세 번째 오조작에 기폭 회로가 열렸습니다. 매뉴얼의 예외 조항을 한 번 더 보세요.';

  el.resultLog.innerHTML = state.log.map((l) => `
    <div class="logrow ${l.ok ? 'ok' : 'bad'}">
      <i></i><b>${esc(l.title)}</b>
      <span>${l.ok ? '해제' : '실패'}</span>
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
  // 숫자키는 '하나 고르기' 회로에서만 통한다 (순서·다중·다이얼은 손으로 조작한다)
  const mod = state.round[state.idx];
  if (!mod || ['seq', 'multi', 'dial', 'match'].includes(mod.render)) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    const node = el.deviceBody.querySelector(`[data-i="${n - 1}"]`);
    if (node) answer(n - 1, node);
  }
});

drawTimer();
