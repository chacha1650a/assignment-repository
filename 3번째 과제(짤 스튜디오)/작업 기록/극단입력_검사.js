/* 극단 입력 12건 자동 검사 스크립트
 *
 * 사용법: 앱을 연 뒤 개발자 도구 콘솔에서 이 파일을 붙여넣고 runExtremeTests() 실행.
 * 각 검사에서 아래 4가지를 자동 판정한다.
 *   1) 잘림   — 문구 영역이 캔버스 밖으로 나갔는가
 *   2) 겹침   — 문구끼리 서로 겹쳤는가
 *   3) 찌그러짐 — 한 줄이 최대 폭을 넘어 가로로 압축되었는가
 *   4) 화면=파일 — 미리보기와 저장 파일의 픽셀이 일치하는가
 */

const CASES = [
  { id: 1,  name: '긴 한글 한 줄', img: '일하는 고양이.jpg', ratio: '1:1',
    texts: [{ content: '오늘도 야근하는 고양이의 하루는 길고 험난하며 끝이 보이지 않는다는 사실을 우리는 모두 알고 있습니다', fontSize: 64, yPct: 85 }] },

  { id: 2,  name: '한글+영문 혼합 장문', img: '고냥이.jpg', ratio: '1:1',
    texts: [{ content: '고양이는 cute하고 adorable하며 sometimes 아주 mysterious한 creature입니다 정말로', fontSize: 64, yPct: 50 }] },

  { id: 3,  name: '강제 줄바꿈 5줄', img: '놀란 고양이.jpg', ratio: '1:1',
    texts: [{ content: '첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄', fontSize: 70, yPct: 50 }] },

  { id: 4,  name: '이모지 단독', img: '고냥이.jpg', ratio: '1:1',
    texts: [{ content: '😀🔥🐱✨🎉💖🌟🍀', fontSize: 90, yPct: 50 }] },

  { id: 5,  name: '이모지+한글 혼합', img: '화난 고양이.jpg', ratio: '1:1',
    texts: [{ content: '화났다 😾🔥 진짜로 화났다 💢 건드리지 마라 🙀', fontSize: 64, yPct: 85 }] },

  { id: 6,  name: '빈 문구', img: '고냥이.jpg', ratio: '1:1',
    texts: [{ content: '', fontSize: 64, yPct: 50 }] },

  { id: 7,  name: '공백만 있는 문구', img: '고냥이.jpg', ratio: '1:1',
    texts: [{ content: '      ', fontSize: 64, yPct: 50 }] },

  { id: 8,  name: '띄어쓰기 없는 초장문', img: '일하는 고양이.jpg', ratio: '1:1',
    texts: [{ content: '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하', fontSize: 64, yPct: 50 }] },

  { id: 9,  name: '세로 이미지 + 9:16 + 긴 문구', img: '고양이_세로형.jpg', ratio: '9:16',
    texts: [{ content: '세로로 긴 화면에서도 문구가 잘리지 않고 잘 들어가야 합니다 정말로 그래야만 합니다', fontSize: 64, yPct: 85 }] },

  { id: 10, name: '문구 2개 기본 추가 (겹침 확인)', img: '고양이_가로형.jpg', ratio: '1:1',
    useDefaultAdd: 2 },

  { id: 11, name: '투명 PNG + contain', img: '투명배경_검사용.png', ratio: '1:1', fit: 'contain',
    texts: [{ content: '투명 배경 검사', fontSize: 80, yPct: 50 }] },

  { id: 12, name: '소형 이미지 + 초대형 폰트', img: '화난 고양이.jpg', ratio: '1:1',
    texts: [{ content: '아주 큰 글씨 테스트', fontSize: 200, yPct: 50 }] },
];

async function loadImageIntoApp(fileName) {
  if (!fileName) return;
  const res = await fetch('../assets/' + encodeURIComponent(fileName));
  const blob = await res.blob();
  const type = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const file = new File([blob], fileName, { type });
  await new Promise((r) => { handleImageFile(file); setTimeout(r, 800); });
}

// 문구 영역이 캔버스를 벗어났는지
function findClipping() {
  const { w, h } = RATIOS[state.ratio];
  const out = [];
  for (const t of state.texts) {
    const b = t._bbox;
    if (!b) continue;
    if (!t.content.trim()) continue; // 빈 문구는 영역이 없는 게 정상
    const over = [];
    if (b.x < 0) over.push(`왼쪽 ${Math.round(-b.x)}px`);
    if (b.y < 0) over.push(`위쪽 ${Math.round(-b.y)}px`);
    if (b.x + b.w > w) over.push(`오른쪽 ${Math.round(b.x + b.w - w)}px`);
    if (b.y + b.h > h) over.push(`아래쪽 ${Math.round(b.y + b.h - h)}px`);
    if (over.length) out.push(over.join(', '));
  }
  return out;
}

// 문구끼리 겹쳤는지
function findOverlap() {
  const out = [];
  const list = state.texts.filter((t) => t.content.trim() && t._bbox);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]._bbox, b = list[j]._bbox;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) {
        const areaA = a.w * a.h;
        out.push(`${i + 1}·${j + 1}번 문구가 ${Math.round((ox * oy / areaA) * 100)}% 겹침`);
      }
    }
  }
  return out;
}

// 한 줄이 최대 폭을 넘어 가로로 압축되는지 (fillText의 maxWidth가 글자를 찌그러뜨리는 경우)
function findSquish() {
  const { w, h } = RATIOS[state.ratio];
  const maxWidth = w * 0.86;
  const out = [];
  for (const t of state.texts) {
    if (!t.content.trim()) continue;
    let fs = t.fontSize, lines, totalH;
    for (;;) {
      ctx.font = `800 ${fs}px "Pretendard","Noto Sans KR",sans-serif`;
      lines = wrapText(ctx, t.content, maxWidth);
      totalH = lines.length * fs * 1.25;
      if (totalH <= h * 0.92 || fs <= 14) break;
      fs -= 2;
    }
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      if (lw > maxWidth + 1) out.push(`"${line.slice(0, 12)}…" ${Math.round(lw - maxWidth)}px 초과로 압축됨`);
    }
  }
  return out;
}

// 미리보기와 저장 파일이 픽셀 단위로 같은지
function comparePreviewToFile() {
  return new Promise((resolve) => {
    render(false);
    const previewData = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height).data;
    el.canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        off.getContext('2d').drawImage(img, 0, 0);
        const fileData = off.getContext('2d').getImageData(0, 0, off.width, off.height).data;
        URL.revokeObjectURL(url);
        render(true);
        if (off.width !== el.canvas.width || off.height !== el.canvas.height) {
          resolve({ match: false, reason: `크기 불일치 ${off.width}x${off.height}` });
          return;
        }
        // 브라우저는 캔버스를 미리 곱한 알파(premultiplied alpha)로 보관한다.
        // PNG로 저장했다 다시 읽으면 반투명 픽셀에서만 1/255 반올림 오차가 생기는데,
        // 이는 브라우저 동작이라 앱에서 없앨 수 없고 육안으로도 보이지 않는다.
        // 따라서 불투명·투명 픽셀은 완전 일치를 요구하고, 반투명만 1까지 허용한다.
        let hardDiff = 0, roundingDiff = 0, maxDelta = 0;
        for (let i = 0; i < previewData.length; i += 4) {
          const a = previewData[i + 3];
          if (a !== fileData[i + 3]) { hardDiff++; continue; }
          let d = 0;
          for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(previewData[i + k] - fileData[i + k]));
          if (d === 0) continue;
          maxDelta = Math.max(maxDelta, d);
          if (a > 0 && a < 255 && d <= 1) roundingDiff++;
          else hardDiff++;
        }
        resolve({
          match: hardDiff === 0,
          reason: hardDiff ? `${hardDiff}px 불일치 (최대 ${maxDelta})` : '',
          roundingDiff,
          size: `${off.width}x${off.height}`,
        });
      };
      img.src = url;
    }, 'image/png');
  });
}

async function runExtremeTests() {
  const results = [];
  for (const c of CASES) {
    // 초기화
    state.texts = [];
    state.selectedTextId = null;
    state.image = null;
    renderTextList();

    await loadImageIntoApp(c.img);
    if (c.fit) {
      el.imageFit.value = c.fit;
      el.imageFit.dispatchEvent(new Event('change'));
    }
    document.querySelector(`.ratio-btn[data-ratio="${c.ratio}"]`).click();

    if (c.useDefaultAdd) {
      // 사용자가 "문구 추가"를 그냥 여러 번 누른 상황을 그대로 재현
      for (let i = 0; i < c.useDefaultAdd; i++) el.addTextBtn.click();
    } else {
      state.texts = c.texts.map((t) => ({
        id: genId(), content: t.content, xPct: t.xPct ?? 50, yPct: t.yPct ?? 50,
        fontSize: t.fontSize ?? 64, color: t.color ?? '#ffffff',
        align: t.align ?? 'center', outline: t.outline !== false,
      }));
      renderTextList();
    }
    render();

    const clip = findClipping();
    const overlap = findOverlap();
    const squish = findSquish();
    const fileCmp = await comparePreviewToFile();

    const defects = [];
    if (clip.length) defects.push('잘림: ' + clip.join(' / '));
    if (overlap.length) defects.push('겹침: ' + overlap.join(' / '));
    if (squish.length) defects.push('찌그러짐: ' + squish.join(' / '));
    if (!fileCmp.match) defects.push('화면≠파일: ' + fileCmp.reason);

    results.push({
      번호: c.id,
      검사자료: c.name,
      화면비: c.ratio,
      캔버스: fileCmp.size,
      반올림오차: fileCmp.roundingDiff ? `${fileCmp.roundingDiff}px (브라우저 한계)` : '0',
      결함: defects.length ? defects.join(' | ') : '없음',
      통과: defects.length === 0,
    });
  }
  console.table(results);
  return results;
}
