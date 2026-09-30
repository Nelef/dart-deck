// 덱 그림 부품 — 실제 실행 기록을 그릴 때 덱마다 되풀이하던 조각(2026-09-28, js/deck.js 와 함께 쓴다).
// 문서 그림(원본 픽셀 좌표 SVG) · 문서 위 카메라 이동 · 상자 · 숫자 올리기 · LLM 답의 코드 울타리 벗기기.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 상자 하나 — b=[x0,y0,x1,y1](원본 픽셀)
  const rect = (b, attrs) => `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" ${attrs}/>`;
  // 문서 밖 빈 곳을 비추지 않게 보기 창을 문서 안으로 민다
  const clampView = (v, pw, ph) => [Math.max(0, Math.min(pw - v[2], v[0])), Math.max(0, Math.min(ph - v[3], v[1])), v[2], v[3]];

  /**
   * 문서 그림 한 조각을 SVG 로 그린다 — view=[x,y,w,h](원본 픽셀), layers 는 같은 좌표계의 SVG 조각(상자·글자).
   * @param {SVGElement} svg
   * @param {{src:string, w:number, h:number, fit?:'meet'|'slice', clamp?:boolean}} page 그림 주소와 원본 크기
   * @param {number[]} view
   * @param {string} [layers]
   */
  const doc = (svg, page, view, layers = '') => {
    const v = page.clamp ? clampView(view, page.w, page.h) : view;
    svg.setAttribute('viewBox', v.join(' '));
    svg.setAttribute('preserveAspectRatio', `xMidYMid ${page.fit || 'meet'}`);
    svg.innerHTML = `<image href="${page.src}" x="0" y="0" width="${page.w}" height="${page.h}"/>${layers}`;
    svg.dataset.v = JSON.stringify(v); svg.dataset.pw = page.w; svg.dataset.ph = page.h; svg.dataset.clamp = page.clamp ? '1' : '';
  };

  // 문서 위를 카메라처럼 옮긴다(보기 창을 부드럽게 바꾼다) — 확대해 들어가는 연출
  const cam = (svg, to0, ms = 1100) => {
    const pw = Number(svg.dataset.pw); const ph = Number(svg.dataset.ph);
    const to = svg.dataset.clamp ? clampView(to0, pw, ph) : to0;
    const from = JSON.parse(svg.dataset.v || JSON.stringify(to)); const t0 = performance.now();
    const f = (t) => {
      const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      svg.setAttribute('viewBox', from.map((a, i) => a + (to[i] - a) * e).join(' '));
      if (k < 1) requestAnimationFrame(f); else svg.dataset.v = JSON.stringify(to);
    };
    requestAnimationFrame(f);
  };

  // 숫자 올리기 — 한 요소를 0 에서 to 까지(천 단위 쉼표)
  const countTo = (el, to, ms = 900) => {
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - (1 - k) ** 3)).toLocaleString(); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  // 숫자 올리기 — root 안의 [data-count](data-dec 소수 자릿수) 전부
  const countUp = (root) => [...root.querySelectorAll('[data-count]')].forEach((el) => {
    const to = Number(el.dataset.count); const dec = Number(el.dataset.dec || 0); const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = (to * (1 - (1 - k) ** 3)).toFixed(dec); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  // LLM 답에서 ```json 울타리를 벗긴다
  const stripFence = (s) => String(s || '').replace(/```json\s*|```/g, '').trim();

  // ═══ 입체 그래프(사용자 지정 2026-09-29 "이런 인포그래픽은 다 3d로") ═══
  // 원근을 쓰지 않는다 — 앞면 크기가 값 그대로이고 윗면·옆면만 덧붙인다(원근·기울임은 길이·각도를 부풀려 값을 속인다).
  // 면의 밝기는 같은 색을 흰색·검정과 섞어 만든다(color-mix) — 새 색을 만들지 않는다(DECK.md 6).
  const shade = (c, k) => (k >= 0 ? `color-mix(in srgb, ${c} ${100 - k}%, white)` : `color-mix(in srgb, ${c} ${100 + k}%, black)`);
  const face = (pts, c) => `<polygon points="${pts.map((q) => q.map((v) => +v.toFixed(2)).join(',')).join(' ')}" style="fill:${c}"/>`;
  // 입체 막대 — 앞면(x, y, w, h), 깊이 d(오른쪽 위로)
  const bar3d = (x, y, w, h, fill, d = 8) => (w <= 0 ? '' : `<g>${face([[x, y], [x + d, y - d], [x + w + d, y - d], [x + w, y]], shade(fill, 38))}`
    + `${face([[x + w, y], [x + w + d, y - d], [x + w + d, y + h - d], [x + w, y + h]], shade(fill, -28))}<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:${fill}"/></g>`);
  // 입체 누적 막대 — parts=[{v, fill, label?, fg?}], 전체 폭 W 를 합으로 나눈다. 옆면은 마지막 조각에만
  const stack3d = (x, y, W, h, parts, d = 10, fs = 24) => {
    const tot = parts.reduce((a, p) => a + p.v, 0) || 1; let cx = x; let g = '';
    parts.forEach((p, i) => { const w = W * p.v / tot;
      g += face([[cx, y], [cx + d, y - d], [cx + w + d, y - d], [cx + w, y]], shade(p.fill, 38));
      if (i === parts.length - 1) g += face([[cx + w, y], [cx + w + d, y - d], [cx + w + d, y + h - d], [cx + w, y + h]], shade(p.fill, -28));
      g += `<rect x="${cx}" y="${y}" width="${w}" height="${h}" style="fill:${p.fill}"/>`;
      if (p.label != null && w > fs * 1.6) g += `<text x="${cx + w / 2}" y="${y + h / 2 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="900" style="fill:${p.fg || '#fff'}">${esc(p.label)}</text>`;
      cx += w; });
    return `<g>${g}</g>`;
  };
  // 입체 도넛 — 위에서 비스듬히 본 고리(세로 눌림 t), 두께 dz. parts=[{v, fill}] 는 12시에서 시계 방향.
  // 조각 각도는 값 그대로(윗면 기준)다 — 눌림 때문에 좌우 조각이 조금 넓어 보이므로 가운데에 숫자를 꼭 적는다.
  const ring3d = (cx, cy, R, r, parts, { t = 0.52, dz = 26 } = {}) => {
    const tot = parts.reduce((a, p) => a + p.v, 0) || 1; const P = (a, rad, dy = 0) => [cx + rad * Math.sin(a), cy - rad * t * Math.cos(a) + dy];
    const arc = (rad, a0, a1, dy, sweep) => { const [x1, y1] = P(a1, rad, dy); return `A ${rad} ${rad * t} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    const seg = []; let a = 0; parts.forEach((p) => { const a1 = a + 2 * Math.PI * p.v / tot; seg.push({ a0: a, a1, fill: p.fill }); a = a1; });
    const clip = (a0, a1, lo, hi) => [Math.max(a0, lo), Math.min(a1, hi)];
    let back = ''; let wall = ''; let top = '';
    seg.forEach(({ a0, a1, fill }) => {
      // 구멍 안쪽 벽 — 뒤쪽 반(-90°~90°, 12시 쪽)이 보인다
      for (const [lo, hi] of [[-Math.PI / 2, Math.PI / 2], [1.5 * Math.PI, 2.5 * Math.PI]]) { const [s, e] = clip(a0, a1, lo, hi); if (e - s < 1e-4) continue;
        const [sx, sy] = P(s, r); const [ex, ey] = P(e, r, dz);
        back += `<path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} ${arc(r, s, e, 0, 1)} L ${ex.toFixed(2)} ${ey.toFixed(2)} ${arc(r, e, s, dz, 0)} Z" style="fill:${shade(fill, -40)}"/>`; }
      // 바깥 벽 — 앞쪽 반(90°~270°, 6시 쪽)이 보인다
      const [s, e] = clip(a0, a1, Math.PI / 2, 1.5 * Math.PI);
      if (e - s > 1e-4) { const [sx, sy] = P(s, R); const [ex, ey] = P(e, R, dz);
        wall += `<path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} ${arc(R, s, e, 0, 1)} L ${ex.toFixed(2)} ${ey.toFixed(2)} ${arc(R, e, s, dz, 0)} Z" style="fill:${shade(fill, -25)}"/>`; }
      const [ox, oy] = P(a0, R); const [ix, iy] = P(a1, r);
      top += `<path d="M ${ox.toFixed(2)} ${oy.toFixed(2)} ${arc(R, a0, a1, 0, 1)} L ${ix.toFixed(2)} ${iy.toFixed(2)} ${arc(r, a1, a0, 0, 0)} Z" style="fill:${fill}"/>`;
    });
    return `<g>${back}${wall}${top}</g>`;
  };

  // ═══ 순서도(사용자 지정 2026-09-29 "이런 건 순서도 형태로") ═══
  // 표준 기호: 시작·끝 = 둥근 끝 상자(term) · 처리 = 사각형(proc) · 판단 = 마름모(dec) · 입출력 = 평행사변형(io). 화살표로 잇는다.
  // (cx, cy) 가 도형 가운데. lines 는 [굵은 첫 줄, 보조 줄…] — 글자 크기는 DECK.md 3(첫 줄 28 · 보조 24 이상)
  const fcNode = (kind, cx, cy, w, h, lines, { fill = '#fff', stroke = 'var(--c-brand)', ink = 'var(--ink)', subInk = 'var(--sub)', fs = 28, sfs = 24 } = {}) => {
    const x = cx - w / 2; const y = cy - h / 2; let shape;
    if (kind === 'term') shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 40)}" style="fill:${fill};stroke:${stroke}" stroke-width="3"/>`;
    else if (kind === 'dec') shape = `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" style="fill:${fill};stroke:${stroke}" stroke-width="3"/>`;
    else if (kind === 'io') { const k = h * 0.3; shape = `<polygon points="${x + k},${y} ${x + w},${y} ${x + w - k},${y + h} ${x},${y + h}" style="fill:${fill};stroke:${stroke}" stroke-width="3"/>`; }
    else shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" style="fill:${fill};stroke:${stroke}" stroke-width="3"/>`;
    const L = [].concat(lines); const lh = [fs * 1.25, ...L.slice(1).map(() => sfs * 1.3)]; const th = lh.reduce((a, b) => a + b, 0); let ty = cy - th / 2;
    const txt = L.map((t, i) => { ty += lh[i]; return `<text x="${cx}" y="${ty - lh[i] * 0.28}" text-anchor="middle" font-size="${i ? sfs : fs}" font-weight="${i ? 500 : 900}" style="fill:${i ? subInk : ink}">${esc(t)}</text>`; }).join('');
    return `<g>${shape}${txt}</g>`;
  };
  // 화살표 — pts=[[x,y],…] 꺾은선, 끝에 화살촉. label 은 첫 구간 가운데 옆에
  const fcArrow = (pts, { label = '', color = 'var(--c-text-mute)', fs = 24, lx = 12, ly = 0, anchor = 'start' } = {}) => {
    const [a, b] = pts.slice(-2); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const s = 14;
    const head = [[b[0], b[1]], [b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45)], [b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)]];
    const [p0, p1] = pts; const mx = (p0[0] + p1[0]) / 2; const my = (p0[1] + p1[1]) / 2;
    return `<g><polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" style="stroke:${color}" stroke-width="3"/>${face(head, color)}`
      + (label ? `<text x="${mx + lx}" y="${my + fs * 0.35 + ly}" text-anchor="${anchor}" font-size="${fs}" font-weight="800" style="fill:${color}">${esc(label)}</text>` : '') + '</g>';
  };

  window.Viz = { esc, rect, clampView, doc, cam, countTo, countUp, stripFence, shade, bar3d, stack3d, ring3d, fcNode, fcArrow };
})();
