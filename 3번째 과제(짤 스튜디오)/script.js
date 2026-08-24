'use strict';

/* ---------- 상수 & 상태 ---------- */

const RATIOS = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
};
const STORAGE_KEY = 'memeStudio.templates.v1';

const state = {
  ratio: '1:1',
  image: null, // { src, el, fit, scale, offsetX, offsetY }
  texts: [],   // { id, content, xPct, yPct, fontSize, color, align, outline, _bbox }
  selectedTextId: null,
  loadedTemplateId: null,
  templates: [],
  drag: null,
};

const el = {
  canvas: document.getElementById('mainCanvas'),
  frame: document.getElementById('canvasFrame'),
  ratioGroup: document.getElementById('ratioGroup'),
  downloadBtn: document.getElementById('downloadBtn'),
  fileDrop: document.getElementById('fileDrop'),
  imageInput: document.getElementById('imageInput'),
  imageFileName: document.getElementById('imageFileName'),
  imageFit: document.getElementById('imageFit'),
  imageScale: document.getElementById('imageScale'),
  addTextBtn: document.getElementById('addTextBtn'),
  textList: document.getElementById('textList'),
  templateName: document.getElementById('templateName'),
  saveTemplateBtn: document.getElementById('saveTemplateBtn'),
  templateList: document.getElementById('templateList'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  ioStatus: document.getElementById('ioStatus'),
  canvasSpinner: document.getElementById('canvasSpinner'),
  spinnerLabel: document.getElementById('spinnerLabel'),
  imageStatus: document.getElementById('imageStatus'),
};
const ctx = el.canvas.getContext('2d');

const genId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ---------- range 슬라이더 진행률(--val) 동기화 ---------- */
function syncRangeFill(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100), val = Number(input.value);
  input.style.setProperty('--val', String(((val - min) / (max - min)) * 100));
}
document.addEventListener('input', (e) => { if (e.target.matches('input[type=range]')) syncRangeFill(e.target); });

/* ---------- 이미지 생성 중 로딩 표시 ---------- */

function showBusy(label) {
  el.spinnerLabel.textContent = label;
  el.canvasSpinner.classList.add('active');
  return performance.now();
}
// 작업이 아주 짧게 끝나도 스피너가 깜빡이지 않도록 최소 노출 시간을 보장한다.
function hideBusy(startedAt, minMs = 260) {
  const wait = Math.max(0, minMs - (performance.now() - startedAt));
  setTimeout(() => el.canvasSpinner.classList.remove('active'), wait);
}

/* ---------- 렌더링 ---------- */

// showSelection: 선택 표시는 화면 전용이며 저장 파일에는 절대 들어가지 않는다.
function render(showSelection = true) {
  const { w, h } = RATIOS[state.ratio];
  if (el.canvas.width !== w || el.canvas.height !== h) {
    el.canvas.width = w;
    el.canvas.height = h;
  }
  el.frame.style.aspectRatio = state.ratio.replace(':', ' / ');
  ctx.clearRect(0, 0, w, h);
  drawImageLayer(w, h);
  drawTexts(w, h);
  if (showSelection) drawSelection(w);
}

function drawSelection(w) {
  if (!state.selectedTextId) return;
  const t = state.texts.find((x) => x.id === state.selectedTextId);
  if (!t || !t._bbox) return;
  const b = t._bbox;
  const pad = w * 0.008;
  ctx.save();
  ctx.strokeStyle = '#7c5cff';
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.setLineDash([w * 0.018, w * 0.012]);
  ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  // 모서리 점으로 선택 대상을 더 분명히 보여준다.
  ctx.setLineDash([]);
  ctx.fillStyle = '#7c5cff';
  const r = Math.max(3, w * 0.006);
  const corners = [
    [b.x - pad, b.y - pad], [b.x + b.w + pad, b.y - pad],
    [b.x - pad, b.y + b.h + pad], [b.x + b.w + pad, b.y + b.h + pad],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawImageLayer(w, h) {
  const img = state.image;
  if (!img || !img.el) return;
  const nw = img.el.naturalWidth, nh = img.el.naturalHeight;
  if (!nw || !nh) return;
  const canvasRatio = w / h, imgRatio = nw / nh;
  let baseW, baseH;
  if (img.fit === 'contain') {
    if (imgRatio > canvasRatio) { baseW = w; baseH = w / imgRatio; }
    else { baseH = h; baseW = h * imgRatio; }
  } else { // cover
    if (imgRatio > canvasRatio) { baseH = h; baseW = h * imgRatio; }
    else { baseW = w; baseH = w / imgRatio; }
  }
  const drawW = baseW * img.scale, drawH = baseH * img.scale;
  const cx = w / 2 + img.offsetX, cy = h / 2 + img.offsetY;
  ctx.drawImage(img.el, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

function wrapText(measureCtx, text, maxWidth) {
  const paragraphs = String(text ?? '').split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (measureCtx.measureText(test).width <= maxWidth) {
        current = test;
        continue;
      }
      if (current) lines.push(current);
      if (measureCtx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const chr of Array.from(word)) {
          const t2 = chunk + chr;
          if (chunk && measureCtx.measureText(t2).width > maxWidth) {
            lines.push(chunk);
            chunk = chr;
          } else {
            chunk = t2;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function contrastOutline(hex) {
  const c = (hex || '').replace('#', '');
  if (c.length !== 6) return '#000000';
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#000000' : '#ffffff';
}

function drawTexts(w, h) {
  const maxWidth = w * 0.86;
  for (const t of state.texts) {
    let fs = t.fontSize;
    let lines, totalH;
    for (;;) {
      ctx.font = `800 ${fs}px "Pretendard","Noto Sans KR",sans-serif`;
      lines = wrapText(ctx, t.content, maxWidth);
      totalH = lines.length * fs * 1.25;
      if (totalH <= h * 0.92 || fs <= 14) break;
      fs -= 2;
    }
    const xPos = (t.xPct / 100) * w;
    let startY = (t.yPct / 100) * h - totalH / 2 + (fs * 1.25) / 2;

    // 문구 덩어리가 캔버스 위아래로 삐져나가면 안쪽으로 밀어 넣는다.
    // (밀어도 안 들어갈 만큼 긴 문구는 위쪽 기준으로 맞춘다.)
    const margin = h * 0.02;
    const blockTop = startY - fs * 0.75;
    const blockH = totalH + fs * 0.3;
    if (blockTop + blockH > h - margin) startY -= (blockTop + blockH) - (h - margin);
    if (startY - fs * 0.75 < margin) startY += margin - (startY - fs * 0.75);

    ctx.textAlign = t.align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = t.color;
    ctx.strokeStyle = contrastOutline(t.color);
    ctx.lineWidth = fs * 0.12;

    let maxLineWidth = 0;
    lines.forEach((line, i) => {
      const ly = startY + i * fs * 1.25;
      if (t.outline) ctx.strokeText(line, xPos, ly, maxWidth);
      ctx.fillText(line, xPos, ly, maxWidth);
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
    });

    let left;
    if (t.align === 'left') left = xPos;
    else if (t.align === 'right') left = xPos - maxLineWidth;
    else left = xPos - maxLineWidth / 2;
    t._bbox = { x: left - fs * 0.15, y: startY - fs * 0.75, w: maxLineWidth + fs * 0.3, h: totalH + fs * 0.3 };
  }
}

/* ---------- 이미지 업로드 (메타데이터 제거) ---------- */

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

// 거부 사유를 눈에 보이게 알린다. 이미 작업 중이던 이미지·문구는 절대 건드리지 않는다.
function showImageError(message) {
  el.imageStatus.textContent = message;
  el.imageStatus.hidden = false;
  el.fileDrop.classList.remove('shake');
  void el.fileDrop.offsetWidth; // 애니메이션을 다시 시작시키기 위한 리플로우
  el.fileDrop.classList.add('shake');
}
function clearImageError() {
  el.imageStatus.hidden = true;
  el.imageStatus.textContent = '';
  el.fileDrop.classList.remove('shake');
}

function handleImageFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    const ext = file.name && file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : '알 수 없는';
    showImageError(`${ext} 형식은 사용할 수 없어요. PNG 또는 JPEG 파일을 올려 주세요. (기존 작업은 그대로 있어요)`);
    return;
  }
  if (file.size === 0) {
    showImageError('빈 파일이라 불러올 수 없어요. 다른 파일을 올려 주세요. (기존 작업은 그대로 있어요)');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showImageError(`파일이 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 20MB 이하로 줄여 주세요. (기존 작업은 그대로 있어요)`);
    return;
  }

  clearImageError();
  const busyStart = showBusy('이미지를 불러오는 중…');
  const fail = (message) => { hideBusy(busyStart); showImageError(message); };

  const reader = new FileReader();
  reader.onload = () => {
    const rawImg = new Image();
    rawImg.onload = () => {
      if (!rawImg.naturalWidth || !rawImg.naturalHeight) {
        fail('이미지 크기를 읽지 못했어요. 다른 파일을 올려 주세요. (기존 작업은 그대로 있어요)');
        return;
      }
      try {
        // 오프스크린 캔버스에 다시 그려 EXIF 등 메타데이터를 제거한 사본을 만든다.
        const off = document.createElement('canvas');
        off.width = rawImg.naturalWidth;
        off.height = rawImg.naturalHeight;
        off.getContext('2d').drawImage(rawImg, 0, 0);
        const cleanSrc = off.toDataURL('image/png');
        setImageFromSrc(cleanSrc, { fit: el.imageFit.value, scale: 1, offsetX: 0, offsetY: 0 }, () => hideBusy(busyStart));
        el.imageFileName.textContent = file.name;
        el.imageScale.value = 100;
        syncRangeFill(el.imageScale);
        el.fileDrop.style.backgroundImage = `url(${cleanSrc})`;
      } catch (err) {
        fail('이미지를 처리하지 못했어요. 다른 파일을 올려 주세요. (기존 작업은 그대로 있어요)');
      }
    };
    // 확장자만 이미지이고 내용이 깨진 파일은 여기로 온다.
    rawImg.onerror = () => fail('이미지가 손상되었거나 형식이 올바르지 않아요. (기존 작업은 그대로 있어요)');
    rawImg.src = reader.result;
  };
  reader.onerror = () => fail('파일을 읽지 못했어요. 다시 시도해 주세요. (기존 작업은 그대로 있어요)');
  reader.readAsDataURL(file);
}

el.imageInput.addEventListener('change', (e) => {
  handleImageFile(e.target.files[0]);
  e.target.value = ''; // 같은 파일을 다시 골라도 인식되도록 초기화
});

['dragenter', 'dragover'].forEach((ev) =>
  el.fileDrop.addEventListener(ev, (e) => { e.preventDefault(); el.fileDrop.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach((ev) =>
  el.fileDrop.addEventListener(ev, (e) => { e.preventDefault(); el.fileDrop.classList.remove('drag-over'); })
);
el.fileDrop.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

function setImageFromSrc(src, opts, onReady) {
  const img = new Image();
  img.onload = () => { state.image.el = img; render(); if (onReady) onReady(); };
  img.onerror = () => { if (onReady) onReady(); };
  state.image = { src, el: null, fit: opts.fit || 'cover', scale: opts.scale ?? 1, offsetX: opts.offsetX ?? 0, offsetY: opts.offsetY ?? 0 };
  img.src = src;
  el.fileDrop.style.backgroundImage = `url(${src})`;
}

el.imageFit.addEventListener('change', () => { if (state.image) { state.image.fit = el.imageFit.value; render(); } });
el.imageScale.addEventListener('input', () => { if (state.image) { state.image.scale = Number(el.imageScale.value) / 100; render(); } });

/* ---------- 비율 선택 ---------- */

el.ratioGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.ratio-btn');
  if (!btn) return;
  state.ratio = btn.dataset.ratio;
  document.querySelectorAll('.ratio-btn').forEach((b) => b.classList.toggle('active', b === btn));
  if (state.image) { state.image.offsetX = 0; state.image.offsetY = 0; }
  render();
});

/* ---------- 문구 목록 ---------- */

// 새 문구가 기존 문구와 같은 자리에 겹쳐 생기지 않도록 빈 자리를 찾는다.
// 밈의 기본 배치대로 아래 → 위 → 가운데 순으로 놓고, 그 뒤로는 조금씩 어긋나게 쌓는다.
function nextTextYPct() {
  const preferred = [85, 15, 50, 70, 30, 60, 40];
  const used = state.texts.map((t) => t.yPct);
  const isFree = (y) => used.every((u) => Math.abs(u - y) >= 10);
  const spot = preferred.find(isFree);
  if (spot !== undefined) return spot;
  // 선호 위치가 모두 찼으면 겹치지 않는 아무 자리나 찾는다.
  for (let y = 10; y <= 90; y += 5) if (isFree(y)) return y;
  return clamp(85 - state.texts.length * 4, 5, 95);
}

el.addTextBtn.addEventListener('click', () => {
  const t = { id: genId(), content: '문구를 입력하세요', xPct: 50, yPct: nextTextYPct(), fontSize: 64, color: '#ffffff', align: 'center', outline: true };
  state.texts.push(t);
  state.selectedTextId = t.id;
  renderTextList();
  render();
});

function renderTextList() {
  el.textList.innerHTML = '';
  if (!state.texts.length) {
    el.textList.innerHTML = '<p class="hint">위 버튼으로 문구를 추가하세요.</p>';
    return;
  }
  for (const t of state.texts) {
    const item = document.createElement('div');
    item.className = 'text-item' + (t.id === state.selectedTextId ? ' selected' : '');
    item.innerHTML = `
      <textarea>${escapeHtml(t.content)}</textarea>
      <div class="row"><span>X</span><input type="range" min="0" max="100" value="${t.xPct}" data-k="xPct"><span>Y</span><input type="range" min="0" max="100" value="${t.yPct}" data-k="yPct"></div>
      <div class="row"><span>크기</span><input type="range" min="20" max="160" value="${t.fontSize}" data-k="fontSize"><input type="color" value="${t.color}" data-k="color"></div>
      <div class="row">
        <select data-k="align">
          <option value="left" ${t.align === 'left' ? 'selected' : ''}>왼쪽</option>
          <option value="center" ${t.align === 'center' ? 'selected' : ''}>가운데</option>
          <option value="right" ${t.align === 'right' ? 'selected' : ''}>오른쪽</option>
        </select>
        <label><input type="checkbox" data-k="outline" ${t.outline ? 'checked' : ''}> 외곽선</label>
      </div>
      <div class="actions"><span></span><button type="button" class="del-btn">삭제</button></div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      state.selectedTextId = t.id;
      document.querySelectorAll('.text-item').forEach((n) => n.classList.remove('selected'));
      item.classList.add('selected');
      render();
    });
    item.querySelector('textarea').addEventListener('input', (e) => { t.content = e.target.value; render(); });
    item.querySelectorAll('input[type=range], select, input[type=color], input[type=checkbox]').forEach((inp) => {
      const k = inp.dataset.k;
      const evName = inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evName, () => {
        if (inp.type === 'checkbox') t[k] = inp.checked;
        else if (k === 'xPct' || k === 'yPct' || k === 'fontSize') t[k] = Number(inp.value);
        else t[k] = inp.value;
        render();
      });
    });
    item.querySelector('.del-btn').addEventListener('click', () => {
      state.texts = state.texts.filter((x) => x.id !== t.id);
      if (state.selectedTextId === t.id) state.selectedTextId = null;
      renderTextList();
      render();
    });
    item.querySelectorAll('input[type=range]').forEach(syncRangeFill);
    el.textList.appendChild(item);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 캔버스 드래그(이미지 이동 / 문구 이동), 휠(크기 조절) ---------- */

function canvasPointFromEvent(e) {
  const rect = el.canvas.getBoundingClientRect();
  const scaleX = el.canvas.width / rect.width;
  const scaleY = el.canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

el.canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPointFromEvent(e);
  let hit = null;
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const t = state.texts[i];
    const b = t._bbox;
    if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { hit = t; break; }
  }
  if (hit) {
    state.selectedTextId = hit.id;
    renderTextList();
    state.drag = { type: 'text', id: hit.id, startX: p.x, startY: p.y, origXPct: hit.xPct, origYPct: hit.yPct };
  } else {
    // 빈 곳을 누르면 선택을 해제한다 (선택된 문구가 계속 휠 확대의 대상이 되는 것을 막는다).
    if (state.selectedTextId) {
      state.selectedTextId = null;
      renderTextList();
    }
    if (state.image) {
      state.drag = { type: 'image', startX: p.x, startY: p.y, origOffsetX: state.image.offsetX, origOffsetY: state.image.offsetY };
    }
  }
  render();
  if (state.drag) {
    el.canvas.classList.add('dragging');
    // 포인터 캡처는 환경에 따라 실패할 수 있다. 실패해도 드래그 자체는 계속 동작해야 한다.
    try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 없이 진행 */ }
  }
});

el.canvas.addEventListener('pointermove', (e) => {
  if (!state.drag) return;
  const p = canvasPointFromEvent(e);
  const dx = p.x - state.drag.startX, dy = p.y - state.drag.startY;
  const { w, h } = RATIOS[state.ratio];
  if (state.drag.type === 'text') {
    const t = state.texts.find((x) => x.id === state.drag.id);
    if (t) {
      t.xPct = clamp(state.drag.origXPct + (dx / w) * 100, 0, 100);
      t.yPct = clamp(state.drag.origYPct + (dy / h) * 100, 0, 100);
    }
  } else if (state.drag.type === 'image' && state.image) {
    state.image.offsetX = state.drag.origOffsetX + dx;
    state.image.offsetY = state.drag.origOffsetY + dy;
  }
  render();
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  el.canvas.addEventListener(ev, () => { state.drag = null; el.canvas.classList.remove('dragging'); })
);

el.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const dir = e.deltaY > 0 ? -1 : 1;
  if (state.selectedTextId) {
    const t = state.texts.find((x) => x.id === state.selectedTextId);
    if (t) { t.fontSize = clamp(t.fontSize + dir * 4, 14, 200); renderTextList(); render(); }
  } else if (state.image) {
    state.image.scale = clamp(state.image.scale + dir * 0.05, 0.3, 4);
    el.imageScale.value = Math.round(state.image.scale * 100);
    syncRangeFill(el.imageScale);
    render();
  }
}, { passive: false });

/* ---------- 내려받기 ---------- */

el.downloadBtn.addEventListener('click', () => {
  const originalLabel = el.downloadBtn.textContent;
  el.downloadBtn.disabled = true;
  el.downloadBtn.setAttribute('aria-busy', 'true');
  el.downloadBtn.innerHTML = '<span class="btn-spinner"></span>내려받는 중…';
  const busyStart = showBusy('이미지를 만드는 중…');
  // 다음 프레임으로 미뤄 버튼/스피너가 먼저 화면에 반영되게 한 뒤 무거운 작업을 시작한다.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // 선택 표시를 지운 상태로 다시 그린 뒤 저장해야 파일에 점선 테두리가 섞이지 않는다.
    render(false);
    el.canvas.toBlob((blob) => {
      render(true); // 저장이 끝나면 화면에는 다시 선택 표시를 보여준다.
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meme-${state.ratio.replace(':', 'x')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      hideBusy(busyStart);
      el.downloadBtn.disabled = false;
      el.downloadBtn.removeAttribute('aria-busy');
      el.downloadBtn.textContent = originalLabel;
    }, 'image/png');
  }));
});

/* ---------- 템플릿: 저장/불러오기/수정/삭제 ---------- */

// 템플릿 목록에 보여줄 작은 미리보기를 만든다. 선택 표시는 빼고 그린다.
function makeThumbnail(maxPx = 120) {
  render(false);
  const src = el.canvas;
  const ratio = src.width / src.height;
  const tw = ratio >= 1 ? maxPx : Math.round(maxPx * ratio);
  const th = ratio >= 1 ? Math.round(maxPx / ratio) : maxPx;
  const off = document.createElement('canvas');
  off.width = tw;
  off.height = th;
  const octx = off.getContext('2d');
  octx.fillStyle = '#ffffff'; // 투명 이미지도 목록에서 알아볼 수 있게 흰 배경을 깐다.
  octx.fillRect(0, 0, tw, th);
  octx.drawImage(src, 0, 0, tw, th);
  render(true);
  try {
    return off.toDataURL('image/jpeg', 0.7);
  } catch (e) {
    return null;
  }
}

function currentSnapshot() {
  return {
    thumb: makeThumbnail(),
    ratio: state.ratio,
    image: state.image ? { src: state.image.src, fit: state.image.fit, scale: state.image.scale, offsetX: state.image.offsetX, offsetY: state.image.offsetY } : null,
    texts: state.texts.map((t) => ({ content: t.content, xPct: t.xPct, yPct: t.yPct, fontSize: t.fontSize, color: t.color, align: t.align, outline: t.outline })),
  };
}

// 후보 배열을 실제로 저장해보고 성공 여부만 알려준다. 실패해도 state.templates는 건드리지 않는다.
function trySaveTemplates(candidateList) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidateList));
    return true;
  } catch (e) {
    return false;
  }
}

// 기존 코드 호환용: 현재 state.templates를 그대로 저장한다 (삭제처럼 항상 줄어드는 작업에 사용).
function persistTemplates() {
  if (!trySaveTemplates(state.templates)) {
    alert('저장 공간이 가득 차서 변경 내용이 저장되지 않았어요. 안 쓰는 템플릿을 삭제해 주세요.');
  }
}

function loadTemplatesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.templates = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    state.templates = [];
  }
}

el.saveTemplateBtn.addEventListener('click', () => {
  const name = el.templateName.value.trim();
  if (!name) { alert('템플릿 이름을 입력하세요.'); return; }
  const snap = currentSnapshot();
  const candidate = state.templates.map((t) => ({ ...t }));
  const existingIdx = candidate.findIndex((t) => t.name === name);
  let targetId;
  if (existingIdx > -1) {
    candidate[existingIdx] = { ...candidate[existingIdx], ...snap, updatedAt: Date.now() };
    targetId = candidate[existingIdx].id;
  } else {
    const tpl = { id: genId(), name, ...snap, createdAt: Date.now(), updatedAt: Date.now() };
    candidate.push(tpl);
    targetId = tpl.id;
  }
  if (!trySaveTemplates(candidate)) {
    alert('저장 공간이 가득 찼어요. 안 쓰는 템플릿을 삭제하거나 이미지 용량을 줄인 뒤 다시 시도해 주세요.\n(이번 저장은 적용되지 않았고 기존 템플릿은 그대로예요.)');
    return;
  }
  state.templates = candidate;
  state.loadedTemplateId = targetId;
  renderTemplateList();
});

function renderTemplateList() {
  el.templateList.innerHTML = '';
  if (!state.templates.length) {
    el.templateList.innerHTML = '<li class="empty">저장된 템플릿이 없습니다.</li>';
    return;
  }
  for (const tpl of state.templates) {
    const li = document.createElement('li');
    if (tpl.id === state.loadedTemplateId) li.classList.add('active');
    li.innerHTML = `
      <span class="t-avatar"><span></span></span>
      <span class="t-name">${escapeHtml(tpl.name)}</span>
      <span class="t-ratio">${tpl.ratio}</span>
      <button type="button" class="load-btn">불러오기</button>
      <button type="button" class="del-btn">삭제</button>
    `;
    // dataURL은 innerHTML로 넣지 않고 속성으로 직접 지정한다.
    if (tpl.thumb) {
      const inner = li.querySelector('.t-avatar > span');
      inner.style.backgroundImage = `url(${tpl.thumb})`;
      inner.classList.add('has-thumb');
    }
    li.querySelector('.load-btn').addEventListener('click', () => loadTemplate(tpl.id));
    li.querySelector('.del-btn').addEventListener('click', () => deleteTemplate(tpl.id));
    el.templateList.appendChild(li);
  }
}

function loadTemplate(id) {
  const tpl = state.templates.find((t) => t.id === id);
  if (!tpl) return;
  state.ratio = tpl.ratio;
  document.querySelectorAll('.ratio-btn').forEach((b) => b.classList.toggle('active', b.dataset.ratio === state.ratio));
  if (tpl.image) {
    const busyStart = showBusy('템플릿을 불러오는 중…');
    setImageFromSrc(tpl.image.src, tpl.image, () => hideBusy(busyStart));
    el.imageFit.value = tpl.image.fit;
    el.imageScale.value = Math.round((tpl.image.scale ?? 1) * 100);
    syncRangeFill(el.imageScale);
    el.imageFileName.textContent = tpl.name + ' 이미지';
  } else {
    state.image = null;
    el.imageFileName.textContent = 'PNG · JPEG 이미지 선택';
    el.fileDrop.style.backgroundImage = '';
  }
  state.texts = tpl.texts.map((t) => ({ ...t, id: genId() }));
  state.selectedTextId = null;
  state.loadedTemplateId = tpl.id;
  el.templateName.value = tpl.name;
  renderTextList();
  renderTemplateList();
  render();
}

function deleteTemplate(id) {
  if (!confirm('이 템플릿을 삭제할까요?')) return;
  state.templates = state.templates.filter((t) => t.id !== id);
  if (state.loadedTemplateId === id) state.loadedTemplateId = null;
  persistTemplates();
  renderTemplateList();
}

/* ---------- JSON 내보내기 / 가져오기 ---------- */

el.exportBtn.addEventListener('click', () => {
  if (!state.templates.length) { el.ioStatus.textContent = '내보낼 템플릿이 없습니다.'; return; }
  const data = JSON.stringify({ app: 'meme-card-studio', version: 1, exportedAt: new Date().toISOString(), templates: state.templates }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meme-studio-templates.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  el.ioStatus.textContent = `템플릿 ${state.templates.length}개를 내보냈습니다.`;
});

function validateTemplateShape(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.name !== 'string' || !item.name.trim()) return false;
  if (!RATIOS[item.ratio]) return false;
  if (!Array.isArray(item.texts)) return false;
  for (const t of item.texts) {
    if (!t || typeof t.content !== 'string') return false;
    if (typeof t.xPct !== 'number' || typeof t.yPct !== 'number') return false;
    if (typeof t.fontSize !== 'number') return false;
    if (typeof t.color !== 'string') return false;
  }
  if (item.image !== null && item.image !== undefined) {
    if (typeof item.image !== 'object') return false;
    if (!safeImageSrc(item.image.src)) return false;
  }
  return true;
}

// 가져온 파일의 이미지 주소는 그대로 믿지 않는다. 안전한 data:image 형식만 통과시킨다.
const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
function safeImageSrc(value) {
  return typeof value === 'string' && SAFE_DATA_IMAGE.test(value) ? value : null;
}

function normalizeImportedTemplate(item) {
  return {
    name: item.name.trim(),
    thumb: safeImageSrc(item.thumb),
    ratio: item.ratio,
    image: item.image ? {
      src: safeImageSrc(item.image.src),
      fit: item.image.fit === 'contain' ? 'contain' : 'cover',
      scale: Number(item.image.scale) || 1,
      offsetX: Number(item.image.offsetX) || 0,
      offsetY: Number(item.image.offsetY) || 0,
    } : null,
    texts: item.texts.map((t) => ({
      content: t.content,
      xPct: clamp(Number(t.xPct) || 50, 0, 100),
      yPct: clamp(Number(t.yPct) || 50, 0, 100),
      fontSize: clamp(Number(t.fontSize) || 60, 14, 200),
      color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : '#ffffff',
      align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'center',
      outline: t.outline !== false,
    })),
  };
}

el.importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      el.ioStatus.textContent = '⚠️ JSON 형식이 잘못되어 가져오지 못했습니다. 기존 템플릿은 그대로입니다.';
      el.importInput.value = '';
      return;
    }
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.templates) ? parsed.templates : null);
    if (!list) {
      el.ioStatus.textContent = '⚠️ 템플릿 목록을 찾을 수 없습니다. 기존 템플릿은 그대로입니다.';
      el.importInput.value = '';
      return;
    }
    for (const item of list) {
      if (!validateTemplateShape(item)) {
        el.ioStatus.textContent = '⚠️ 필수 항목이 빠지거나 형식이 잘못된 템플릿이 있어 가져오지 못했습니다. 기존 템플릿은 그대로입니다.';
        el.importInput.value = '';
        return;
      }
    }
    const candidate = state.templates.map((t) => ({ ...t }));
    let added = 0, updated = 0;
    for (const item of list) {
      const tpl = normalizeImportedTemplate(item);
      const existingIdx = candidate.findIndex((t) => t.name === tpl.name);
      if (existingIdx > -1) { candidate[existingIdx] = { ...candidate[existingIdx], ...tpl, updatedAt: Date.now() }; updated++; }
      else { candidate.push({ ...tpl, id: genId(), createdAt: Date.now(), updatedAt: Date.now() }); added++; }
    }
    if (!trySaveTemplates(candidate)) {
      el.ioStatus.textContent = '⚠️ 저장 공간이 가득 차서 가져오기를 적용하지 못했습니다. 기존 템플릿은 그대로입니다.';
      el.importInput.value = '';
      return;
    }
    state.templates = candidate;
    renderTemplateList();
    el.ioStatus.textContent = `가져오기 완료 — 새 템플릿 ${added}개, 갱신 ${updated}개.`;
    el.importInput.value = '';
  };
  reader.onerror = () => { el.ioStatus.textContent = '⚠️ 파일을 읽지 못했습니다.'; el.importInput.value = ''; };
  reader.readAsText(file);
});

/* ---------- 초기화 ---------- */

loadTemplatesFromStorage();
renderTemplateList();
renderTextList();
document.querySelectorAll('input[type=range]').forEach(syncRangeFill);
render();
