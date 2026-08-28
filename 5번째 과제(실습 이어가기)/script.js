(() => {
  "use strict";

  // ---- 설정 (비밀값 없음: Open-Meteo는 API 키가 필요 없는 공개 출처) ----
  const LAT = 37.5665, LON = 126.9780; // 서울
  const TIMEZONE = "Asia/Seoul";
  const API_URL =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode,is_day` +
    `&hourly=temperature_2m&forecast_days=1&timezone=${encodeURIComponent(TIMEZONE)}`;

  // WMO weathercode -> 표시용 상태 (실제 날씨에 맞춰 하늘 배경·이모지가 바뀜)
  function weatherToSky(code, isDay) {
    const day = isDay !== 0;
    if (code === 0) return day ? { tone: "day-clear", emoji: "☀️", mode: "" } : { tone: "night-clear", emoji: "🌕", mode: "" };
    if ([1, 2].includes(code)) return day ? { tone: "day-clear", emoji: "🌤️", mode: "" } : { tone: "night-cloud", emoji: "🌥️", mode: "cloud" };
    if (code === 3) return { tone: day ? "day-cloud" : "night-cloud", emoji: "☁️", mode: "cloud" };
    if ([45, 48].includes(code)) return { tone: day ? "day-cloud" : "night-cloud", emoji: "🌫️", mode: "cloud" };
    if ([51, 53, 55, 56, 57, 80, 81, 82].includes(code)) return { tone: day ? "day-rain" : "night-rain", emoji: "🌦️", mode: "rain" };
    if ([61, 63, 65, 66, 67].includes(code)) return { tone: day ? "day-rain" : "night-rain", emoji: "🌧️", mode: "rain" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { tone: "day-snow", emoji: "❄️", mode: "snow" };
    if ([95, 96, 99].includes(code)) return { tone: "day-storm", emoji: "⛈️", mode: "storm" };
    return { tone: day ? "day-cloud" : "night-cloud", emoji: "🌤️", mode: "" };
  }

  const RECORDS_KEY = "today-info-board-records-v1";
  const LASTGOOD_KEY = "today-info-board-lastgood-v1";
  const TIMEOUT_MS = 8000;

  // ---- DOM ----
  const $status = document.getElementById("statusBadge");
  const $staleNote = document.getElementById("staleNote");
  const $value = document.getElementById("valueEl");
  const $unit = document.getElementById("unitEl");
  const $humidity = document.getElementById("humidityEl");
  const $sourceLink = document.getElementById("sourceLink");
  const $checkedAt = document.getElementById("checkedAtEl");
  const $lastGoodAt = document.getElementById("lastGoodAtEl");
  const $retryBtn = document.getElementById("retryBtn");
  const $deltaInline = document.getElementById("deltaInline");
  const $compareLine = document.getElementById("compareLine");
  const $recordsList = document.getElementById("recordsList");
  const $recordsCount = document.getElementById("recordsCount");
  const $testButtons = document.querySelectorAll(".test-buttons button");
  const $currentCard = document.getElementById("currentCard");
  const $liveClock = document.getElementById("liveClock");
  const $sky = document.getElementById("sky");
  const $skyEmoji = document.getElementById("skyEmoji");
  const $skyEmoji2 = document.getElementById("skyEmoji2");
  const $pageFlash = document.getElementById("pageFlash");
  const $boardRoot = document.getElementById("boardRoot");
  const $tempChart = document.getElementById("tempChart");
  const $chartRange = document.getElementById("chartRange");
  const $chartEmpty = document.getElementById("chartEmpty");

  // ---- 조회 결과에 따라 화면 전체가 반응하는 연출 ----
  function pageReact(kind) {
    // kind: "ok" | "stale" | "error"
    $pageFlash.className = "page-flash";
    void $pageFlash.offsetWidth; // 리플로우 강제 → 재생 보장
    $pageFlash.classList.add("flash-" + kind);
    if (kind === "error") {
      $boardRoot.classList.remove("shake");
      void $boardRoot.offsetWidth;
      $boardRoot.classList.add("shake");
    }
  }

  function applySky(code, isDay) {
    const s = weatherToSky(code, isDay);
    $sky.className = "sky tone-" + s.tone;
    $skyEmoji.textContent = s.emoji;
    $skyEmoji.className = "sky-emoji" + (s.mode ? " mode-" + s.mode : "");
    $skyEmoji2.hidden = s.mode !== "cloud";
  }

  $sourceLink.href = API_URL;
  $sourceLink.textContent = "Open-Meteo 원자료 (JSON) 열기";

  // ---- 지도 (Leaflet + Esri World Imagery 위성사진 — API 키 없이 무료 공개 타일) ----
  // 위치는 정보판이 보여주는 서울 좌표로 고정, 인터랙션은 확대/축소·이동 정도만.
  // Esri의 전통적인 REST 타일 서비스(server.arcgisonline.com)는 계정·키 없이 쓸 수 있다.
  // 일반 지도(World_Street_Map)에서 위성사진(World_Imagery)으로 바꾼 이유: 어두운 실사
  // 이미지가 다크 글래스 카드와 톤이 맞고, "실제 그 자리"를 보여줘서 임팩트가 크다.
  function initMap() {
    if (typeof L === "undefined") return; // CDN 로드 실패해도 나머지 정보판은 정상 동작
    const map = L.map("map", { scrollWheelZoom: false }).setView([LAT, LON], 13);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 18,
        attribution: "&copy; Esri &middot; Maxar, Earthstar Geographics",
      }
    ).addTo(map);
    L.marker([LAT, LON]).addTo(map)
      .bindPopup("서울 — 이 정보판이 보여주는 위치").openPopup();
    // 초기 레이아웃 계산 시점에 컨테이너 크기가 아직 확정 안 됐을 수 있어
    // (지난 버전에서 실제로 줌이 어긋나 화면이 훨씬 넓게 보이는 문제가 있었음) 한 번 더 보정한다.
    requestAnimationFrame(() => map.invalidateSize());
  }
  initMap();

  // ---- 실시간 브라우저 시계 (장식용, API 조회시각과 별개) ----
  function tickLiveClock() {
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: TIMEZONE, hour12: false,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value ?? "00";
    $liveClock.innerHTML = `${get("hour")}<span class="blink">:</span>${get("minute")}<span class="blink">:</span>${get("second")}`;
  }
  tickLiveClock();
  setInterval(tickLiveClock, 1000);

  // ---- 시각/날짜 유틸 (KST 기준) ----
  const kstDate = (d = new Date()) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(d); // YYYY-MM-DD
  const kstTime = (d = new Date()) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: TIMEZONE, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).format(d);

  // ---- 로컬 저장소 ----
  const getRecords = () => {
    try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; }
    catch { return []; }
  };
  const saveRecordIfNew = (rec) => {
    const records = getRecords();
    if (records.some(r => r.date === rec.date)) return records; // 같은 날짜 중복 방지
    records.push(rec);
    records.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return records;
  };
  const getLastGood = () => {
    try { return JSON.parse(localStorage.getItem(LASTGOOD_KEY)); }
    catch { return null; }
  };
  const setLastGood = (obj) => localStorage.setItem(LASTGOOD_KEY, JSON.stringify(obj));

  // ---- 렌더링 ----
  function setStatus(kind, label) {
    $status.className = "status-badge " + kind; // ok | stale | error | loading
    $status.textContent = label;
    $currentCard.classList.toggle("is-loading", kind === "loading");
  }

  // 습도 구간: 30% 미만 = 건조(먼지), 70% 초과 = 다습(빗방울), 그 사이는 연출 없음.
  function humidityZone(h) {
    if (typeof h !== "number" || !Number.isFinite(h)) return "";
    if (h < 30) return "dry";
    if (h > 70) return "humid";
    return "";
  }

  // 습도는 값이 없거나 숫자가 아니어도(응답 형식이 바뀌어도) 화면이 죽지 않도록
  // 안전하게 "--%"로 표시한다 — 기온과 달리 오류로 취급하지 않는다.
  function renderHumidity(humidity) {
    const ok = typeof humidity === "number" && Number.isFinite(humidity);
    const zone = humidityZone(humidity);
    $humidity.hidden = false;
    $humidity.textContent = ok ? `💧 ${Math.round(humidity)}%` : "💧 --%";
    $humidity.className = "humidity-badge" + (zone ? " zone-" + zone : "");
    $currentCard.classList.remove("zone-dry", "zone-humid");
    if (zone) $currentCard.classList.add("zone-" + zone);
  }

  function renderValue({ value, unit, time, source, humidity }, stale) {
    const changed = $value.textContent !== String(value);
    $value.textContent = value;
    $unit.textContent = unit;
    $checkedAt.textContent = time;
    $staleNote.hidden = !stale;
    if (source) { $sourceLink.href = source; }
    renderHumidity(humidity);
    if (changed) {
      $value.classList.remove("pop");
      void $value.offsetWidth; // 리플로우 강제 → 애니메이션 재생
      $value.classList.add("pop");
    }
  }

  function renderEmpty(message) {
    $value.textContent = "—";
    $unit.textContent = "";
    $checkedAt.textContent = message;
    $staleNote.hidden = true;
    $humidity.hidden = false;
    $humidity.textContent = "💧 —";
    $humidity.className = "humidity-badge";
    $currentCard.classList.remove("zone-dry", "zone-humid");
  }

  // ---- 오늘의 기온 변화 그래프 (외부 차트 라이브러리 없이 인라인 SVG로 직접 그림) ----
  // hourly 자료는 습도와 같은 취급: 없거나 형식이 달라도 기온 조회 자체는 실패시키지 않는다.
  const CHART = { w: 720, h: 220, padL: 44, padR: 16, padT: 18, padB: 30 };

  function renderChart(hourly, unit) {
    const valid = hourly
      && Array.isArray(hourly.time) && Array.isArray(hourly.temp)
      && hourly.time.length === hourly.temp.length
      && hourly.temp.some(v => typeof v === "number" && Number.isFinite(v));

    // 주의: SVG 요소에는 `el.hidden = true` 가 속성으로 반영되지 않는다(HTMLElement 전용 IDL).
    // 그래서 CSS `[hidden]` 선택자가 안 걸려 빈 차트가 자리를 차지했었다 — setAttribute 로 직접 건다.
    if (!valid) {
      $tempChart.innerHTML = "";
      $tempChart.setAttribute("hidden", "");
      $chartEmpty.hidden = false;
      $chartRange.textContent = "자료 없음";
      return;
    }
    $tempChart.removeAttribute("hidden");
    $chartEmpty.hidden = true;

    // 결측치(null)는 건너뛰고 유효한 점만 사용
    const pts = hourly.time
      .map((t, i) => ({ t, v: hourly.temp[i], hour: Number(String(t).slice(11, 13)) }))
      .filter(p => typeof p.v === "number" && Number.isFinite(p.v));

    const vals = pts.map(p => p.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    // 위아래로 약간 여백을 줘서 선이 테두리에 붙지 않게. 평평한 그래프면 임의로 ±1도 폭 확보.
    const span = max - min < 1 ? 1 : max - min;
    const lo = min - span * 0.15, hi = max + span * 0.15;

    const { w, h, padL, padR, padT, padB } = CHART;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const x = i => padL + (plotW * i) / Math.max(1, pts.length - 1);
    const y = v => padT + plotH * (1 - (v - lo) / (hi - lo));

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${x(pts.length - 1).toFixed(1)},${padT + plotH}L${padL},${padT + plotH}Z`;

    // 가로 눈금선 + y축 라벨 (최저/중간/최고 3줄이면 충분)
    const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
    const grid = ticks.map(v => {
      const yy = y(v).toFixed(1);
      return `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" class="c-grid"/>` +
        `<text x="${padL - 8}" y="${yy}" class="c-ylabel">${v.toFixed(1)}°</text>`;
    }).join("");

    // x축 라벨은 3시간 간격으로만 (24개 다 찍으면 겹친다)
    const xlabels = pts.map((p, i) =>
      p.hour % 3 === 0
        ? `<text x="${x(i).toFixed(1)}" y="${h - padB + 18}" class="c-xlabel">${p.hour}시</text>`
        : ""
    ).join("");

    // 현재 시각과 가장 가까운 점을 강조
    const nowHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE, hour12: false, hour: "2-digit",
    }).format(new Date()));
    let ni = pts.findIndex(p => p.hour === nowHour);
    if (ni < 0) ni = pts.length - 1;
    const nowDot =
      `<line x1="${x(ni).toFixed(1)}" y1="${padT}" x2="${x(ni).toFixed(1)}" y2="${padT + plotH}" class="c-nowline"/>` +
      `<circle cx="${x(ni).toFixed(1)}" cy="${y(pts[ni].v).toFixed(1)}" r="5" class="c-nowdot"/>` +
      `<text x="${x(ni).toFixed(1)}" y="${(y(pts[ni].v) - 12).toFixed(1)}" class="c-nowlabel">${pts[ni].v}${unit || "°C"}</text>`;

    $tempChart.innerHTML =
      `<defs><linearGradient id="cfill" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#38bdf8" stop-opacity=".38"/>
         <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
       </linearGradient></defs>` +
      grid +
      `<path d="${area}" fill="url(#cfill)"/>` +
      `<path d="${line}" class="c-line"/>` +
      xlabels + nowDot;

    $chartRange.textContent = `최저 ${min.toFixed(1)}° · 최고 ${max.toFixed(1)}°`;
  }

  function renderRecords() {
    const records = getRecords();
    $recordsCount.textContent = `(${records.length}건)`;
    if (records.length === 0) {
      $recordsList.innerHTML = '<li class="empty">아직 기록이 없습니다.</li>';
      return;
    }
    $recordsList.innerHTML = [...records].reverse().map((r, i) =>
      `<li style="animation-delay:${i * 70}ms"><span>${r.date}</span><span>${r.value}${r.unit} · ${r.time}</span></li>`
    ).join("");
  }

  function renderCompare() {
    const records = getRecords();
    if (records.length < 2) {
      $deltaInline.hidden = true;
      $compareLine.textContent = `비교 자료 부족 — 서로 다른 날짜 기록이 2건 이상 필요합니다. (현재 ${records.length}건)`;
      return;
    }
    const [prev, curr] = records.slice(-2);
    if (prev.unit !== curr.unit) {
      $deltaInline.hidden = true;
      $compareLine.textContent = "단위가 달라 비교값을 표시하지 않습니다.";
      return;
    }
    const diff = Math.round((curr.value - prev.value) * 10) / 10;
    let cls = "", arrowChar = "→", word = "변화 없음";
    if (diff > 0) { cls = "up"; arrowChar = "▲"; word = "상승"; }
    else if (diff < 0) { cls = "down"; arrowChar = "▼"; word = "하락"; }
    $deltaInline.hidden = false;
    $deltaInline.className = "delta-inline" + (cls ? " " + cls : "");
    $deltaInline.textContent = `${arrowChar} ${Math.abs(diff)}${curr.unit}`;
    $compareLine.textContent = `어제(${prev.date}) ${prev.value}${prev.unit} → 오늘(${curr.date}) ${curr.value}${curr.unit} · ${word}`;
  }

  // ---- 장애 모의실험 ----
  function simulateFailure(kind) {
    switch (kind) {
      case "timeout":
        return new Promise((_, reject) =>
          setTimeout(() => reject({ type: "timeout" }), 1200));
      case "auth":
        return Promise.reject({ type: "auth", status: 401 });
      case "ratelimit":
        return Promise.reject({ type: "ratelimit", status: 429 });
      case "offline":
        return Promise.reject({ type: "offline" });
      case "format":
        return Promise.reject({ type: "format" });
      default:
        return null;
    }
  }

  const ERROR_LABEL = {
    timeout: "오류: 응답 시간 초과",
    auth: "오류: 인증 실패 (401)",
    ratelimit: "오류: 호출 제한 (429)",
    offline: "오류: 오프라인 / 네트워크 실패",
    format: "오류: 응답 형식 변경",
  };

  // ---- 실제 호출 ----
  async function fetchRealWeather() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, { signal: controller.signal });
      if (!res.ok) throw { type: "auth", status: res.status };
      const data = await res.json();
      if (!data.current || typeof data.current.temperature_2m !== "number") {
        throw { type: "format" };
      }
      return {
        value: data.current.temperature_2m,
        unit: data.current_units?.temperature_2m || "°C",
        time: data.current.time, // 이미 Asia/Seoul 기준 (요청 시 timezone 파라미터 지정)
        source: API_URL,
        weathercode: data.current.weathercode,
        isDay: data.current.is_day,
        // 습도는 없거나 형식이 달라도 기온 조회 자체는 실패시키지 않는다 (renderHumidity가 안전 처리)
        humidity: typeof data.current.relative_humidity_2m === "number"
          ? data.current.relative_humidity_2m : undefined,
        // 시간별 기온도 마찬가지로 선택 항목 — 없으면 그래프만 "자료 없음"이 된다
        hourly: data.hourly && Array.isArray(data.hourly.time) && Array.isArray(data.hourly.temperature_2m)
          ? { time: data.hourly.time, temp: data.hourly.temperature_2m }
          : undefined,
      };
    } catch (e) {
      if (e.name === "AbortError") throw { type: "timeout" };
      throw e.type ? e : { type: "offline" };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- 메인 로드 함수 ----
  async function loadWeather(simulate = null) {
    setStatus("loading", "조회 중…");
    $retryBtn.disabled = true;

    try {
      const result = simulate && simulate !== "none"
        ? await simulateFailure(simulate)
        : await fetchRealWeather();

      // 정상 성공
      const now = kstTime();
      const record = {
        date: kstDate(),
        value: result.value,
        unit: result.unit,
        time: now,
      };
      setStatus("ok", "정상");
      renderValue({ value: result.value, unit: result.unit, time: now, source: result.source, humidity: result.humidity }, false);
      if (result.weathercode !== undefined) applySky(result.weathercode, result.isDay);
      renderChart(result.hourly, result.unit);
      $lastGoodAt.textContent = now;
      setLastGood({ ...result, time: now });
      saveRecordIfNew(record);
      renderRecords();
      renderCompare();
      pageReact("ok");
    } catch (err) {
      const kind = err && err.type ? err.type : "offline";
      setStatus("error", ERROR_LABEL[kind] || "오류");
      const lastGood = getLastGood();
      if (lastGood) {
        renderValue(lastGood, true);
        renderChart(lastGood.hourly, lastGood.unit); // 그래프도 마지막 정상값 기준으로 유지
        $lastGoodAt.textContent = lastGood.time;
        setStatus("stale", (ERROR_LABEL[kind] || "오류") + " · 오래된 데이터 표시 중");
        pageReact("stale");
      } else {
        renderEmpty("정상값 없음 — 다시 시도해 주세요.");
        renderChart(null); // 정상값이 없으면 그래프도 지어내지 않는다
        $lastGoodAt.textContent = "—";
        pageReact("error");
      }
    } finally {
      $retryBtn.disabled = false;
    }
  }

  // ---- 이벤트 ----
  $retryBtn.addEventListener("click", () => loadWeather(null));
  $testButtons.forEach(btn => {
    btn.addEventListener("click", () => loadWeather(btn.dataset.sim));
  });

  // ---- 초기 로드 ----
  renderRecords();
  renderCompare();
  loadWeather(null);
})();
