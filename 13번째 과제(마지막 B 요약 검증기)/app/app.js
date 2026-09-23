// 요약 검증기 — 모든 대조는 브라우저 안에서만 이루어집니다. 입력한 글은 어디에도 전송되지 않습니다.
(function () {
  "use strict";

  var MAX_LEN = 20000;

  // ---------- 글 다듬기 ----------
  function clean(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[*`#>|]/g, " ")
      .replace(/[ \t]+/g, " ");
  }

  function squash(text) {
    return text.replace(/[\s,]/g, "").toLowerCase();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 문장 나누기: 마침표 뒤 공백, 줄바꿈 기준 (3.11 같은 소수점은 나누지 않음)
  function splitSentences(text) {
    return clean(text)
      .split(/\n+|(?<=[.!?。])\s+/)
      .map(function (s) { return s.replace(/^\s*(?:[-•·]|\d+[.)])\s+/, "").trim(); })
      .filter(function (s) { return s.replace(/[^0-9A-Za-z가-힣]/g, "").length >= 4; });
  }

  // ---------- 값(사실) 뽑기 ----------
  var DATE_RE = /(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/g;
  var FILE_RE = /[A-Za-z0-9_\-]+\.(?:py|js|ts|jsx|tsx|sql|ya?ml|json|md|txt|csv|html|css|java|go|rb|sh|xml|toml|ini|env|c|cpp|h)\b/gi;
  var NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
  var WORD_RE = /[A-Za-z][A-Za-z0-9+#]+/g;
  var NAME_RES = [
    /([가-힣]{2,3})\s?(?=(?:팀장|개발자|대표|부장|과장|대리|매니저|연구원|교수)(?:[^가-힣]|[은는이가과와의도]|$))/g,
    /(?:팀장|대표|부장|과장|대리|매니저)\s([가-힣]{2,3})(?=[^가-힣]|[은는이가과와의도]|$)/g
  ];
  var SKIP_WORDS = { ms: 1, kb: 1, mb: 1, gb: 1 };
  var NOT_NAMES = { "원래": 1, "외주": 1, "단독": 1, "담당": 1, "새로운": 1, "프로젝트": 1, "개발": 1 };

  function extractFacts(sentence) {
    var facts = [];
    var rest = sentence;
    function take(re, type) {
      rest = rest.replace(re, function (m, g1) {
        var value = type === "name" ? g1 : m;
        facts.push({ type: type, text: value.trim() });
        return " ";
      });
    }
    take(DATE_RE, "date");
    take(FILE_RE, "file");
    NAME_RES.forEach(function (re) { take(re, "name"); });
    take(NUM_RE, "number");
    (rest.match(WORD_RE) || []).forEach(function (w) {
      if (!SKIP_WORDS[w.toLowerCase()]) facts.push({ type: "word", text: w });
    });
    return facts.filter(function (f) { return !(f.type === "name" && NOT_NAMES[f.text]); });
  }

  function buildSourceIndex(sourceText) {
    var flat = clean(sourceText);
    var nums = {};
    (flat.replace(DATE_RE, function (m) { return " " + m + " "; }).match(NUM_RE) || []).forEach(function (n) {
      nums[n.replace(/,/g, "")] = 1;
    });
    return { flat: flat, squashed: squash(flat), nums: nums, sentences: splitSentences(String(sourceText || "").replace(/^\s*#.*$/gm, "")) };
  }

  function factFound(fact, idx) {
    if (fact.type === "number") return !!idx.nums[fact.text.replace(/,/g, "")];
    if (fact.type === "date") {
      var d = squash(fact.text);
      if (idx.squashed.indexOf(d) !== -1) return true;
      return false;
    }
    return idx.squashed.indexOf(squash(fact.text)) !== -1;
  }

  // ---------- 낱말 겹침 (근거 문장 찾기) ----------
  var STOP = { "문서": 1, "원문": 1, "내용": 1, "정보": 1, "해당": 1, "관련": 1, "및": 1, "그": 1, "따른": 1, "대한": 1, "있다": 1, "있으며": 1, "했다": 1, "됐다": 1, "이다": 1, "중": 1, "기준": 1, "요약": 1, "입니다": 1 };
  var PARTICLE = /(에서는|으로는|에서|으로|에는|에게|까지|부터|이며|이고|이나|은|는|이|가|을|를|의|에|과|와|로|도|나|다)$/;

  function tokens(text) {
    return clean(text)
      .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
      .split(/\s+/)
      .map(function (t) {
        var s = t.length > 2 ? t.replace(PARTICLE, "") : t;
        return s.length >= 1 ? s : t;
      })
      .filter(function (t) { return t && !STOP[t] && !/^\d/.test(t); });
  }

  function tokenIn(tok, sentence) {
    if (sentence.indexOf(tok) !== -1) return true;
    return tok.length >= 3 && /[가-힣]/.test(tok) && sentence.indexOf(tok.slice(0, 2)) !== -1;
  }

  // 낱말이 가장 많이 겹치는 원문 문장. 요약의 값(숫자·날짜 등)이 들어 있는 문장을 우선합니다.
  function bestSource(toks, idx, facts) {
    var best = { ratio: 0, score: 0, sentence: "", index: -1 };
    if (!toks.length && !(facts && facts.length)) return best;
    idx.sentences.forEach(function (s, i) {
      var hit = toks.filter(function (t) { return tokenIn(t, s); }).length;
      var ratio = toks.length ? hit / toks.length : 0;
      var sq = squash(s);
      var bonus = (facts || []).filter(function (f) { return f.found && f.text.length >= 2 && sq.indexOf(squash(f.text)) !== -1; }).length;
      var score = ratio + bonus;
      if (score > best.score) best = { ratio: ratio, score: score, sentence: s, index: i };
    });
    return best;
  }

  // ---------- "문서에 없음" 표시 찾기 ----------
  var MISSING_RE = /(문서에\s*없|원문에\s*없|자료에\s*없|언급(?:되지|이)\s*(?:않|없)|명시(?:되지|돼\s*있지)\s*않|나와\s*있지\s*않|확인\s*(?:불가|할\s*수\s*없)|알\s*수\s*없)/;

  function units(summaryText) {
    var out = [];
    splitSentences(summaryText).forEach(function (s) {
      if (MISSING_RE.test(s)) {
        s.split(/[,;]\s*/).forEach(function (c) { if (c.trim()) out.push(c.trim()); });
      } else {
        out.push(s);
      }
    });
    return out;
  }

  // ---------- 판정 ----------
  function judge(unit, idx) {
    var m = unit.match(MISSING_RE);
    if (m) {
      var topic = unit.slice(0, m.index);
      var toks = tokens(topic);
      var b = bestSource(toks, idx);
      if (toks.length && b.ratio === 1) {
        return { kind: "over", unit: unit, evidence: b.sentence, evIdx: b.index, facts: [] };
      }
      return { kind: "honest", unit: unit, evidence: "", evIdx: -1, facts: [] };
    }

    var facts = extractFacts(unit).map(function (f) {
      return { type: f.type, text: f.text, found: factFound(f, idx) };
    });
    var b2 = bestSource(tokens(unit), idx, facts);
    var missing = facts.filter(function (f) { return !f.found; });
    var ev = { evidence: b2.sentence, evIdx: b2.index };
    if (missing.length) return mix({ kind: "invent", unit: unit, facts: facts }, ev);
    if (facts.length || b2.ratio >= 0.5) return mix({ kind: "ok", unit: unit, facts: facts }, ev);
    return mix({ kind: "check", unit: unit, facts: facts }, b2.ratio >= 0.3 ? ev : { evidence: "", evIdx: -1 });
  }

  // 요약 한 줄이 기대는 원문 줄 모두: 가장 비슷한 줄 + 값이 딱 한 줄에만 있는 경우 그 줄 (최대 3줄)
  function supportLines(r, idx) {
    if (r.evIdx < 0) return [];
    var set = [r.evIdx];
    if (r.kind === "ok") {
      r.facts.forEach(function (f) {
        if (!f.found) return;
        var q = squash(f.text), hits = [];
        if (f.type === "number" && f.text.replace(/,/g, "").length < 2) {
          // 한 자리 숫자는 뒤의 단위까지 붙여서 찾습니다 (예: "7건")
          var u = r.unit.match(new RegExp("(?:^|[^0-9.,])" + f.text + "\\s*([가-힣A-Za-z%])"));
          if (!u) return;
          q = squash(f.text + u[1]);
        }
        idx.sentences.forEach(function (s, i) { if (squash(s).indexOf(q) !== -1) hits.push(i); });
        if (hits.length === 1 && set.indexOf(hits[0]) === -1) set.push(hits[0]);
      });
    }
    var main = set[0];
    return [main].concat(set.slice(1).sort(function (a, b) { return Math.abs(a - main) - Math.abs(b - main); }).slice(0, 2))
      .sort(function (a, b) { return a - b; });
  }

  function mix(a, b) {
    Object.keys(b).forEach(function (k) { a[k] = b[k]; });
    return a;
  }

  var KIND = {
    ok: { label: "근거 있음", cls: "ok" },
    invent: { label: "원문에 없는 값", cls: "bad" },
    over: { label: "과잉 방어 의심", cls: "warn" },
    honest: { label: "'없음' 표시 적절", cls: "ok" },
    check: { label: "직접 확인", cls: "muted" }
  };

  function highlight(unit, facts) {
    if (!facts.length) return escapeHtml(unit);
    // 긴 값부터 한 번에 찾아 표시 (예: "850" 안의 "5"를 따로 칠하지 않도록)
    var found = {};
    facts.forEach(function (f) { found[f.text] = found[f.text] || f.found; });
    var keys = Object.keys(found).sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp(keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g");
    var out = "", last = 0, m;
    while ((m = re.exec(unit)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      out += escapeHtml(unit.slice(last, m.index)) +
        '<mark class="' + (found[m[0]] ? "fact-found" : "fact-missing") + '">' + escapeHtml(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + escapeHtml(unit.slice(last));
  }


  // ---------- 화면 (IntelliJ 느낌의 작업 화면) ----------
  var $ = function (id) { return document.getElementById(id); };
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var RING_C = 2 * Math.PI * 52;
  var state = { list: [], sources: [], timers: [], runId: 0 };

  var SEV = {
    ok: '<svg class="sev" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="var(--ok)"/><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg class="sev" viewBox="0 0 16 16"><path d="M8 1.8l6.6 11.6H1.4z" fill="var(--warn-dot)" stroke="var(--warn-dot)" stroke-linejoin="round"/><path d="M8 6v3.4M8 11.4v.1" stroke="#1e1f22" stroke-width="1.6" stroke-linecap="round"/></svg>',
    bad: '<svg class="sev" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="var(--bad)"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    muted: '<svg class="sev" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--gray)" stroke-width="1.4"/><path d="M6.3 6.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.3M8 11.3v.1" fill="none" stroke="var(--gray)" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }
  function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }
  function mode() { return $("ide").getAttribute("data-mode"); }
  function setMode(m) {
    $("ide").setAttribute("data-mode", m);
    $("run").querySelector(".run-label").textContent = m === "scanning" ? "중지" : m === "review" ? "다시 검사" : "검사하기";
    $("run").title = m === "scanning" ? "중지 (Esc)" : "검사하기 (Ctrl+Enter)";
  }

  // ---- 줄 번호 (줄바꿈된 긴 줄도 번호가 맞도록 실제 높이를 잽니다) ----
  var mirror = null;
  function syncGutter(ta, g) {
    try {
      if (!mirror) {
        mirror = document.createElement("div");
        mirror.setAttribute("aria-hidden", "true");
        mirror.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-break:break-all;";
        document.body.appendChild(mirror);
      }
      var cs = getComputedStyle(ta);
      mirror.style.font = cs.font;
      mirror.style.lineHeight = cs.lineHeight;
      mirror.style.width = (ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + "px";
      var lines = ta.value.split("\n");
      if (lines.length > 2000) lines = lines.slice(0, 2000);
      mirror.innerHTML = "";
      lines.forEach(function (l) {
        var d = document.createElement("div");
        d.textContent = l || "​";
        mirror.appendChild(d);
      });
      var html = "";
      each(mirror.children, function (d, i) { html += '<div style="height:' + d.offsetHeight + 'px">' + (i + 1) + "</div>"; });
      g.innerHTML = html + '<div style="height:40px"></div>';
      g.scrollTop = ta.scrollTop;
    } catch (e) { /* 줄 번호는 꾸밈이라 실패해도 앱은 계속 동작합니다 */ }
  }
  function syncGutters() {
    syncGutter($("source"), $("g-source"));
    syncGutter($("summary"), $("g-summary"));
  }

  // ---- 콘솔 ----
  function log(html, cls) {
    var p = document.createElement("p");
    if (cls) p.className = cls;
    p.innerHTML = html;
    var c = $("console");
    c.appendChild(p);
    c.parentNode.scrollTop = c.parentNode.scrollHeight;
    return p;
  }
  function clearConsole() { $("console").innerHTML = ""; }

  function showBottom(tab) {
    $("tw-bottom").hidden = false;
    setPressed("tw-bottom", true);
    each(document.querySelectorAll("[data-bt]"), function (b) {
      var on = b.getAttribute("data-bt") === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("console").hidden = tab !== "run";
    $("problems").hidden = tab !== "problems";
  }
  function showRight(tab) {
    each(document.querySelectorAll("[data-rt]"), function (b) {
      var on = b.getAttribute("data-rt") === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("rt-result").hidden = tab !== "result";
    $("rt-paper").hidden = tab !== "paper";
  }
  function setPressed(id, on) {
    var b = document.querySelector('[data-toggle="' + id + '"]');
    if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
  }
  function status(text) { $("sb-info").textContent = text; }
  function crumb(text) { $("sb-crumb").textContent = "요약-검증기 › " + text; }

  // ---- 예시 ----
  function renderSamples() {
    var sel = $("sample-select");
    var tree = $("tree-samples");
    window.SAMPLES.samples.forEach(function (s, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = s.label;
      sel.appendChild(o);
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "t-row";
      b.setAttribute("data-depth", "2");
      b.setAttribute("data-sample", String(i));
      b.title = s.note;
      b.innerHTML = '<i class="ico ex" data-l="' + "ABC".charAt(i) + '"></i>' + escapeHtml(s.file || s.label);
      li.appendChild(b);
      tree.appendChild(li);
    });
  }
  function loadSample(i, andRun) {
    var s = window.SAMPLES.samples[i];
    if (!s) return;
    if (mode() !== "edit") backToEdit();
    $("source").value = window.SAMPLES.source;
    $("summary").value = s.text;
    $("sample-select").value = String(i);
    each(document.querySelectorAll("[data-sample]"), function (b) { b.classList.toggle("is-current", b.getAttribute("data-sample") === String(i)); });
    syncGutters();
    status(s.label + " 불러옴");
    if (andRun) run();
  }

  // ---- 실행 ----
  function fail(msg) {
    clearTimers();
    state.runId++;
    setMode("edit");
    showBottom("run");
    clearConsole();
    log("▶ 요약-검증기 실행", "c-cmd");
    log("✖ " + escapeHtml(msg), "c-bad");
    status("실행 안 됨");
  }

  function run() {
    if (mode() === "scanning") { stop(); return; }
    try {
      var src = $("source").value;
      var sum = $("summary").value;
      if (!src.trim() || !sum.trim()) return fail("원문과 요약을 둘 다 붙여 넣어 주세요. 처음이라면 [예시로 바로 실행]을 눌러 보세요.");
      if (src.length > MAX_LEN || sum.length > MAX_LEN) return fail("글이 너무 깁니다. 원문과 요약을 각각 " + MAX_LEN.toLocaleString() + "자 이하로 나눠서 검사해 주세요.");
      var t0 = (window.performance || Date).now();
      var idx = buildSourceIndex(src);
      if (!idx.sentences.length) return fail("원문에서 문장을 찾지 못했습니다. 글자가 들어 있는 원문을 붙여 넣어 주세요.");
      var list = units(sum).map(function (u) { var r = judge(u, idx); r.evAll = supportLines(r, idx); return r; });
      if (!list.length) return fail("요약에서 검사할 문장을 찾지 못했습니다. 문장으로 된 요약을 붙여 넣어 주세요.");
      var ms = ((window.performance || Date).now() - t0).toFixed(1);
      process(list, idx.sentences, ms);
    } catch (e) {
      fail("검사 중 문제가 생겼습니다. 입력을 조금 줄이거나 다시 시도해 주세요.");
    }
  }

  function stop() {
    clearTimers();
    state.runId++;
    setMode("edit");
    $("report").hidden = true;
    $("empty").hidden = false;
    log("■ 중지했습니다.", "c-warn");
    status("중지됨");
  }

  // 검증 과정을 콘솔에 한 줄씩 보여 준 뒤 검토 화면으로 넘어갑니다.
  function process(list, sources, ms) {
    clearTimers();
    var runId = ++state.runId;
    state.list = list;
    state.sources = sources;
    var c = countKinds(list);
    var facts = list.reduce(function (n, r) { return n + r.facts.length; }, 0);
    var marks = c.over + c.honest;

    setMode("scanning");
    showRight("result");
    $("empty").hidden = true;
    $("report").hidden = false;
    $("report").classList.add("is-loading");
    showBottom("run");
    clearConsole();
    status("검증 중…");
    $("sb-fill").style.width = "0%";

    var stages = [
      ["요약을 문장으로 나누는 중", list.length + "문장"],
      ["숫자·날짜·파일명·이름을 찾는 중", "값 " + facts + "개"],
      ["원문 " + sources.length + "문장과 하나씩 대조하는 중", "근거 " + (c.ok) + " · 없는 값 " + c.invent + " · 직접 확인 " + c.check],
      ["'문서에 없음' 표시를 원문에서 다시 찾는 중", marks ? marks + "곳 중 " + c.over + "곳 의심" : "해당 없음"]
    ];
    var step = reducedMotion() ? 0 : 620;
    log("▶ 요약-검증기 실행   요약.md ↔ 원문.md", "c-cmd");
    stages.forEach(function (s, k) {
      later(function () {
        if (runId !== state.runId) return;
        var p = log('<span class="c-dim">[' + (k + 1) + "/4]</span> " + s[0] + '<span class="dots"></span>');
        $("sb-task").textContent = s[0];
        $("sb-fill").style.width = ((k + 0.5) / 4 * 100) + "%";
        later(function () {
          if (runId !== state.runId) return;
          p.innerHTML = '<span class="c-dim">[' + (k + 1) + "/4]</span> " + s[0] + ' <span class="c-res">… ' + escapeHtml(s[1]) + "</span>";
          $("sb-fill").style.width = ((k + 1) / 4 * 100) + "%";
        }, step * 0.75);
      }, 180 + step * k);
    });
    later(function () {
      if (runId !== state.runId) return;
      var n = c.invent + c.over + c.check;
      log(n ? "✔ 완료 — 확인이 필요한 문장 " + n + "개 · 계산 " + ms + "ms" : "✔ 완료 — 문제 없음 · 계산 " + ms + "ms", n ? (c.invent ? "c-bad" : "c-warn") : "c-ok");
      log("  (계산은 순식간에 끝나지만, 단계를 볼 수 있도록 천천히 보여 줍니다)", "c-dim");
      review(runId);
    }, 180 + step * stages.length + 120);
  }

  function countKinds(list) {
    var c = { ok: 0, invent: 0, over: 0, honest: 0, check: 0 };
    list.forEach(function (r) { c[r.kind]++; });
    return c;
  }

  // ---- 검토 화면 ----
  function lensText(r) {
    var missing = r.facts.filter(function (f) { return !f.found; }).map(function (f) { return f.text; });
    if (r.kind === "invent") return "원문에 없는 값: " + missing.join(", ");
    if (r.kind === "over") return "과잉 방어 의심 — 원문 " + (r.evIdx + 1) + "번 줄에 관련 내용이 있습니다";
    if (r.kind === "honest") return "'없음' 표시 적절 — 원문에서도 찾지 못했습니다";
    if (r.kind === "check") return "직접 확인 — 자동으로 대조할 값이 없습니다";
    return "";
  }
  function docText(r) {
    var d = {
      ok: "요약의 값이 원문과 같습니다.",
      invent: "원문에서 찾지 못한 값이 있습니다. 지어냈거나 잘못 옮겼을 수 있습니다.",
      over: "요약은 '없다'고 했지만, 원문에 관련 문장이 있습니다.",
      honest: "원문에서도 이 내용을 찾지 못했습니다. '없음'이라고 쓴 것이 맞아 보입니다.",
      check: "자동으로 대조할 값을 찾지 못했습니다. 원문과 직접 비교해 주세요."
    }[r.kind];
    var ev = r.kind === "invent"
      ? "<div><b>원문 " + (r.evIdx + 1) + " (가장 비슷한 줄)</b>" + escapeHtml(r.evidence) + "</div>"
      : r.evAll.map(function (e) { return "<div><b>원문 " + (e + 1) + "</b>" + escapeHtml(state.sources[e] || "") + "</div>"; }).join("");
    return ev + '<div class="c-res">' + d + "</div>";
  }

  function review(runId) {
    var list = state.list;
    var worst = {};
    var rank = { bad: 3, warn: 2, ok: 1, muted: 0 };
    list.forEach(function (r) {
      var k = KIND[r.kind].cls;
      r.evAll.forEach(function (e) { if (!(e in worst) || rank[k] > rank[worst[e]]) worst[e] = k; });
    });
    $("srclist").innerHTML = state.sources.map(function (s, i) {
      return '<li class="src' + (worst[i] ? " used " + worst[i] : "") + '" data-src="' + i + '"><span class="ln-no">' + (i + 1) + '</span><span class="txt">' + escapeHtml(s) + "</span></li>";
    }).join("");

    $("list").innerHTML = list.map(function (r, i) {
      var k = KIND[r.kind].cls;
      var claim = highlight(r.unit, r.facts);
      if (r.kind === "over") claim = '<span class="whole">' + claim + "</span>";
      var lens = lensText(r);
      return '<li class="row ' + k + '" data-i="' + i + '" tabindex="0" aria-label="' + (i + 1) + "번 줄, " + KIND[r.kind].label + '">' +
        '<span class="ln-no">' + SEV[k] + (i + 1) + "</span>" +
        '<div><span class="claim">' + claim + "</span>" + (lens ? '<span class="lens">' + escapeHtml(lens) + "</span>" : "") + "</div>" +
        '<div class="doc">' + docText(r) + "</div></li>";
    }).join("");

    var c = countKinds(list);
    $("n-bad").textContent = c.invent;
    $("n-warn").textContent = c.over + c.check;
    $("n-ok").textContent = c.ok + c.honest;
    renderProblems();

    setMode("review");
    resetReport();
    drawBands();

    var rows = $("list").children;
    var step = reducedMotion() ? 0 : Math.max(60, Math.min(160, 1300 / rows.length));
    each(rows, function (row, i) {
      later(function () {
        if (runId !== state.runId) return;
        row.classList.add("in");
        state.list[i].evAll.forEach(function (e) { if ($("srclist").children[e]) $("srclist").children[e].classList.add("lit"); });
        each($("bands").querySelectorAll('[data-i="' + i + '"]'), function (b) { b.classList.add("drawn"); });
      }, step * i);
    });
    later(function () {
      if (runId !== state.runId) return;
      $("report").classList.remove("is-loading");
      fillReport(list);
      status("검토 중 · " + list.length + "문장");
      crumb("요약.md");
    }, step * Math.min(rows.length, 4));
  }

  function renderProblems() {
    var items = [];
    state.list.forEach(function (r, i) {
      if (r.kind === "ok" || r.kind === "honest") return;
      var k = KIND[r.kind].cls;
      items.push('<li><button type="button" data-jump="' + i + '">' + SEV[k] + '<span class="msg">' + escapeHtml(lensText(r)) + " — " + escapeHtml(r.unit) + '</span><span class="loc">요약.md:' + (i + 1) + "</span></button></li>");
    });
    $("problems").innerHTML = items.length ? items.join("") : '<li class="none">✔ 확인이 필요한 문장이 없습니다.</li>';
    var badge = $("prob-count");
    badge.textContent = String(items.length);
    badge.className = "badge-n show" + (items.length ? "" : " zero");
  }

  function resetReport() {
    var ring = $("ring-fg");
    ring.style.transition = "none";
    ring.style.strokeDasharray = RING_C;
    ring.style.strokeDashoffset = RING_C;
    $("ring-num").textContent = "0";
    ["ok", "bad", "warn", "muted"].forEach(function (k) { $("seg-" + k).style.width = "0%"; $("stat-" + k).textContent = "0"; });
    $("tips").innerHTML = "";
  }

  function fillReport(list) {
    var c = countKinds(list);
    var total = list.length;
    var good = c.ok + c.honest;
    var ring = $("ring-fg");
    void ring.getBoundingClientRect();
    ring.style.transition = "";
    ring.style.strokeDashoffset = RING_C * (1 - good / total);
    ring.setAttribute("class", "ring-fg " + (c.invent ? "bad" : c.over ? "warn" : "ok"));
    countUp($("ring-num"), Math.round(good / total * 100));
    var parts = { ok: good, bad: c.invent, warn: c.over, muted: c.check };
    Object.keys(parts).forEach(function (k) {
      $("seg-" + k).style.width = (parts[k] / total * 100) + "%";
      countUp($("stat-" + k), parts[k]);
    });
    $("verdict").textContent = c.invent ? "원문에 없는 값이 섞여 있어요"
      : c.over ? "있는 정보를 '없다'고 쓴 곳이 있어요"
      : c.check ? "대부분 확인됐고, 몇 줄은 직접 봐 주세요"
      : "요약의 값이 모두 원문에 있어요";
    var used = {};
    list.forEach(function (r) { if (r.kind !== "invent") r.evAll.forEach(function (e) { used[e] = 1; }); });
    $("coverage").textContent = "원문 " + state.sources.length + "줄 중 " + Object.keys(used).length + "줄이 요약의 근거로 쓰였습니다. 흐린 원문 줄은 요약에서 빠진 내용일 수 있습니다.";
    $("tips").innerHTML = tipsFor(c);
  }

  function countUp(el, to) {
    if (reducedMotion() || to === 0) { el.textContent = String(to); return; }
    var start = null, dur = 900;
    function tick(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function tipsFor(c) {
    var t = [];
    if (c.over) t.push("<li><b>'문서에 없음'을 다시 확인하세요.</b> 논문 실험에서 \"확실하지 않으면 '문서에 없음'이라고 써라\"를 넣은 요약 10번 가운데 1번은 원문에 있는 날짜를 없다고 썼습니다. 지시문을 \"없다고 쓰기 전에 원문을 한 번 더 찾고, 찾은 문장을 그대로 인용해라\"로 바꿔 보세요.</li>");
    if (c.invent) t.push("<li><b>원문에 없는 값이 있습니다.</b> 원문을 대화에 그대로 준 짧은 요약에서는 \"요약해줘\"만으로도 10번 모두 지어낸 값이 없었습니다. 원문이 잘려서 들어갔는지, AI가 원문 밖 지식을 끌어왔는지 먼저 확인하고 \"숫자·날짜·파일명은 원문 그대로 옮겨라\"라고 요청해 보세요.</li>");
    if (!c.over && !c.invent) t.push("<li><b>대조한 값은 모두 원문에 있습니다.</b> 원문이 대화 안에 다 들어 있는 짧은 요약이라면 금지 지시를 길게 붙이지 않아도 결과가 좋았습니다(논문: 모호 지시 0/10, 구체 지시 1/10). 지시문을 늘리기보다 결과를 대조하는 편이 낫습니다.</li>");
    if (c.check) t.push("<li><b>'직접 확인' 줄이 있습니다.</b> 이 앱은 숫자·날짜·파일명·영문 낱말·직함 붙은 이름만 자동으로 대조합니다. 나머지는 원문과 눈으로 비교해 주세요.</li>");
    return t.join("");
  }

  // ---- 줄 맞춤: 요약 줄을 근거 원문 줄 높이까지 내려서 띠가 거의 수평으로 이어지게 합니다 (IntelliJ Diff처럼) ----
  function alignRows() {
    var rows = $("list").children, srcs = $("srclist").children;
    each(rows, function (row) { row.style.marginTop = ""; });
    if (mode() !== "review" || !$("srclist").offsetParent) return;
    state.list.forEach(function (r, i) {
      var row = rows[i];
      if (!row || !r.evAll.length || !srcs[r.evAll[0]]) return;
      var gap = srcs[r.evAll[0]].offsetTop - row.offsetTop;
      if (gap > 1) row.style.marginTop = gap + "px";
    });
  }

  // ---- 연결선: 요약 줄 ↔ 근거 원문 줄 ----
  // 평소엔 가는 곡선과 양 끝 점만, 마우스를 올린 줄은 띠로 강조합니다. 멀리 거슬러 가는 선은 흐리게 둡니다.
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function drawBands() {
    var svg = $("bands");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    alignRows();
    if (mode() !== "review" || !$("srclist").offsetParent) return;
    var sr = $("split").getBoundingClientRect();
    var srcBody = $("srclist").parentNode.getBoundingClientRect().top - sr.top;
    var sumBody = $("list").parentNode.getBoundingClientRect().top - sr.top;
    var xL = $("ed-src").getBoundingClientRect().right - sr.left + 5;
    var xR = $("ed-sum").getBoundingClientRect().left - sr.left - 5;
    var xm = (xL + xR) / 2;
    svg.setAttribute("width", sr.width);
    svg.setAttribute("height", sr.height);
    svg.setAttribute("viewBox", "0 0 " + sr.width + " " + sr.height);
    var rows = $("list").children, srcs = $("srclist").children;
    state.list.forEach(function (r, i) {
      var row = rows[i];
      if (!row || !row.offsetHeight) return;
      var y2 = sumBody + row.offsetTop + 17;
      r.evAll.forEach(function (e) {
        var s = srcs[e];
        if (!s) return;
        var y1 = srcBody + s.offsetTop + 14;
        var cls = KIND[r.kind].cls;
        var g = svgEl("g", {
          "class": "link " + cls + (Math.abs(y2 - y1) > 140 ? " far" : "") + (row.classList.contains("in") ? " drawn" : "") + (row.classList.contains("active") ? " active" : ""),
          "data-i": i, "data-src": e
        });
        // 강조용 띠: 원문 줄 높이 ↔ 요약 줄 높이
        var bt = srcBody + s.offsetTop + 1, bb = srcBody + s.offsetTop + s.offsetHeight - 1;
        var at = sumBody + row.offsetTop + 1, ab = sumBody + row.offsetTop + row.offsetHeight - 1;
        g.appendChild(svgEl("path", { "class": "ribbon", d: "M" + (xL - 5) + " " + bt + " C" + xm + " " + bt + " " + xm + " " + at + " " + (xR + 5) + " " + at +
          " L" + (xR + 5) + " " + ab + " C" + xm + " " + ab + " " + xm + " " + bb + " " + (xL - 5) + " " + bb + " Z" }));
        var wire = svgEl("path", { "class": "wire", d: "M" + xL + " " + y1 + " C" + xm + " " + y1 + " " + xm + " " + y2 + " " + xR + " " + y2 });
        g.appendChild(wire);
        g.appendChild(svgEl("circle", { "class": "end", cx: xL, cy: y1, r: 2.5 }));
        g.appendChild(svgEl("circle", { "class": "end", cx: xR, cy: y2, r: 2.5 }));
        svg.appendChild(g);
        wire.style.setProperty("--len", Math.ceil(wire.getTotalLength ? wire.getTotalLength() : 200));
      });
    });
  }

  // ---- 한 쌍 강조 ----
  function focusPair(i, srcIdx) {
    $("split").classList.add("focusing");
    each($("list").children, function (row, j) { row.classList.toggle("active", i !== null ? j === i : state.list[j].evAll.indexOf(srcIdx) !== -1); });
    each($("srclist").children, function (s, j) { s.classList.toggle("active", srcIdx !== null ? j === srcIdx : state.list[i].evAll.indexOf(j) !== -1); });
    each($("bands").children, function (b) { b.classList.toggle("active", i !== null ? +b.getAttribute("data-i") === i : +b.getAttribute("data-src") === srcIdx); });
    if (i !== null) crumb("요약.md › " + (i + 1) + "번 줄 › " + KIND[state.list[i].kind].label);
    else crumb("원문.md › " + (srcIdx + 1) + "번 줄");
  }
  function clearFocus() {
    $("split").classList.remove("focusing");
    each(document.querySelectorAll("#split .active"), function (el) { el.classList.remove("active"); });
    crumb("요약.md");
  }

  function backToEdit() {
    clearTimers();
    state.runId++;
    setMode("edit");
    clearFocus();
    drawBands();
    $("report").hidden = true;
    $("empty").hidden = false;
    $("n-bad").textContent = $("n-warn").textContent = $("n-ok").textContent = "0";
    status("편집 중");
    requestAnimationFrame(syncGutters);
  }

  // ---- 테마 ----
  function toggleTheme() {
    var root = document.documentElement;
    var cur = root.getAttribute("data-theme");
    if (!cur) cur = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    var next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("sv-theme", next); } catch (e) {}
  }

  // ---- 연결 ----
  document.addEventListener("DOMContentLoaded", function () {
    renderSamples();
    $("source").value = window.SAMPLES.source;
    syncGutters();

    $("run").addEventListener("click", run);
    $("edit").addEventListener("click", backToEdit);
    $("theme").addEventListener("click", toggleTheme);
    $("quick").addEventListener("click", function () { loadSample(1, true); });
    $("quick2").addEventListener("click", function () { loadSample(1, true); });
    $("sample-select").addEventListener("change", function (e) {
      if (e.target.value === "") { if (mode() !== "edit") backToEdit(); $("summary").value = ""; syncGutters(); $("summary").focus(); return; }
      loadSample(+e.target.value, false);
    });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
      if (e.key === "Escape" && mode() === "scanning") stop();
    });

    ["source", "summary"].forEach(function (id) {
      var ta = $(id), g = $("g-" + id);
      ta.addEventListener("input", function () { syncGutter(ta, g); if (id === "summary") $("sample-select").value = ""; });
      ta.addEventListener("scroll", function () { g.scrollTop = ta.scrollTop; });
      ta.addEventListener("focus", function () { crumb(id === "source" ? "원문.md" : "요약.md"); });
    });

    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var el;
      if ((el = t.closest("[data-sample]"))) { loadSample(+el.getAttribute("data-sample"), true); return; }
      if ((el = t.closest("[data-go]"))) { if (mode() !== "edit") backToEdit(); $(el.getAttribute("data-go")).focus(); return; }
      if ((el = t.closest("[data-open-paper]"))) { showRight("paper"); return; }
      if ((el = t.closest("[data-rt]"))) { showRight(el.getAttribute("data-rt")); return; }
      if ((el = t.closest("[data-bt]"))) { showBottom(el.getAttribute("data-bt")); return; }
      if ((el = t.closest("[data-toggle]"))) {
        var w = $(el.getAttribute("data-toggle"));
        w.hidden = !w.hidden;
        setPressed(w.id, !w.hidden);
        requestAnimationFrame(function () { syncGutters(); drawBands(); });
        return;
      }
      if ((el = t.closest("#insp"))) { showBottom("problems"); return; }
      if ((el = t.closest("[data-jump]"))) {
        var i = +el.getAttribute("data-jump");
        var row = $("list").children[i];
        if (row) {
          row.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
          row.focus({ preventScroll: true });
          focusPair(i, null);
        }
      }
    });

    var list = $("list"), srcList = $("srclist");
    function rowOf(e) { var el = e.target.closest && e.target.closest(".row"); return el ? +el.getAttribute("data-i") : null; }
    function srcOf(e) { var el = e.target.closest && e.target.closest(".src.used"); return el ? +el.getAttribute("data-src") : null; }
    list.addEventListener("mouseover", function (e) { var i = rowOf(e); if (i !== null) focusPair(i, null); });
    list.addEventListener("focusin", function (e) { var i = rowOf(e); if (i !== null) focusPair(i, null); });
    srcList.addEventListener("mouseover", function (e) { var s = srcOf(e); if (s !== null) focusPair(null, s); });
    list.addEventListener("mouseleave", clearFocus);
    list.addEventListener("focusout", clearFocus);
    srcList.addEventListener("mouseleave", clearFocus);

    var pending = null;
    function relayout() {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        if (mode() === "review") drawBands(); else syncGutters();
      });
    }
    window.addEventListener("resize", relayout);
    if (window.ResizeObserver) new ResizeObserver(relayout).observe($("split"));
    status("준비됨");
  });
})();
