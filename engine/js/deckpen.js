// 강조 도구 — 발표 중에 페이지 위에 직접 표시한다(사용자 지정 2026-10-12 "강조 할 수 있게 도구를 넣어줘 · 모두 지움 버튼도").
//   펜 · 형광펜 · 레이저 포인터 · 지우개(획 단위), 색 6가지 · 굵기 3단계, 되돌리기(Ctrl+Z), 모두 지움(모든 페이지의 표시를 한 번에, 되돌리기로 다시 살릴 수 있다).
//   조작줄의 [강조] 또는 P 키로 켠다(P 펜 · H 형광펜 · L 레이저, Esc 로 도구를 끈다 — 표시는 남는다). 전체화면에서도 쓴다(조작줄이 숨어 있어도 도구 판은 왼쪽에 계속 떠 있다).
//   표시는 무대 좌표(1600×900)의 SVG 로 그려 확대 · 창 크기와 상관없이 정확히 따라가고, 페이지마다 따로 기억한다(저장은 안 한다 — 새로고침하면 사라짐).
//   도구를 켜 둔 동안은 무대를 눌러도 다음 페이지로 안 넘어가고(svg 위 클릭은 덱이 무시), 터치 밀기 넘김 · 확대 끌기와도 안 겹치게 이벤트를 여기서 막는다. js/deck.js 가 모든 덱에 불러온다.
(() => {
  if (window.DeckPen) return;
  const stage = document.querySelector('#stage'); if (!stage) return;
  const W = 1600, H = 900, NS = 'http://www.w3.org/2000/svg';
  const COLORS = [['#ef4444', '빨강'], ['#facc15', '노랑'], ['#22c55e', '초록'], ['#3b82f6', '파랑'], ['#111827', '검정'], ['#ffffff', '흰색']];
  const SIZES = { pen: [4, 8, 14], hi: [22, 36, 54] };   // 굵기 3단계(무대 좌표)
  const CSS = `
  #dpen-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 35; pointer-events: none; overflow: hidden; }
  #dpen-svg.on { pointer-events: auto; touch-action: none; cursor: crosshair; } #dpen-svg.on.eraser { cursor: cell; }
  #dpen-svg .laser { filter: drop-shadow(0 0 8px rgba(255,40,40,.9)); pointer-events: none; }
  #dpen { position: fixed; left: 14px; top: 50%; transform: translateY(-50%); z-index: 62; width: 74px; max-height: calc(100dvh - 90px); overflow-y: auto; display: none; flex-direction: column; align-items: stretch; gap: 3px;
    padding: 8px 6px; border-radius: 18px; background: rgba(255,255,255,.97); box-shadow: 0 8px 30px rgba(0,0,0,.35); font: 700 11.5px 'Noto Sans KR', sans-serif; color: #2b3038; user-select: none; }
  #dpen.on { display: flex; }
  #dpen button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px 5px; border: 0; border-radius: 12px; background: transparent; color: inherit; font: inherit; cursor: pointer; transition: background .12s; }
  #dpen button:hover { background: #f2f3f6; } #dpen button.on { background: #16181d; color: #fff; } #dpen button svg { width: 22px; height: 22px; display: block; }
  #dpen .sep { height: 1px; background: #e6e8ec; margin: 4px 4px; }
  #dpen .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 2px 4px; justify-items: center; }
  #dpen .cols button { width: 26px; height: 26px; padding: 0; border-radius: 99px; border: 2px solid #d5d9e2; box-sizing: border-box; } #dpen .cols button.on { border-color: #1a56db; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1a56db; background-clip: padding-box; }
  #dpen .szs { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; } #dpen .szs button { width: 20px; height: 26px; padding: 0; flex-direction: row; justify-content: center; align-items: center; } #dpen .szs i { display: block; border-radius: 99px; background: #545b66; } #dpen .szs button.on i { background: #fff; }
  #dpen button.clr { color: #b91c1c; } #dpen button.clr:hover { background: #fde8e8; } #dpen button:disabled { opacity: .4; cursor: default; }
  #bar #pen-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: none; width: auto; min-width: 0; padding: 0 12px; font-size: 13px; font-weight: 800; white-space: nowrap; } #pen-btn span { white-space: nowrap; } #pen-btn svg { width: 17px; height: 17px; flex: none; } #pen-btn.on { background: #16181d; color: #fff; }
  body.dedit #dpen, body.dedit #pen-btn { display: none !important; }
  @media (max-width: 640px) { #pen-btn span { display: none; } #dpen { left: 6px; width: 64px; } }
  `;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  // 아이콘(단순한 선 그림 — 이모지는 쓰지 않는다)
  const IC = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/></svg>',
    hi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l6-6 3 3-6 6z"/><path d="M9 14l-3 3 1 3 3-1 2-2"/><path d="M4 21h5" stroke-width="3" opacity=".45"/></svg>',
    laser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-6 6H8z"/><path d="M8 20h12"/><path d="M9 11l5 5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-3"/></svg>',
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  // ── 상태 ──
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('deckpen.prefs') || '{}'); } catch (e) { return {}; } })();
  const S = { tool: null, last: prefs.last || 'pen', color: { pen: prefs.pen || '#ef4444', hi: prefs.hi || '#facc15' }, size: { pen: prefs.sp ?? 1, hi: prefs.sh ?? 1 }, strokes: new Map(), hist: [], drawing: null, erasing: null };
  const savePrefs = () => { try { localStorage.setItem('deckpen.prefs', JSON.stringify({ last: S.last, pen: S.color.pen, hi: S.color.hi, sp: S.size.pen, sh: S.size.hi })); } catch (e) { /* 저장소 없음 */ } };
  const cur = () => (typeof deck !== 'undefined' && deck && Number.isInteger(deck.cur) ? deck.cur : 0);   // 지금 페이지 번호(0부터)
  const list = (k = cur()) => { if (!S.strokes.has(k)) S.strokes.set(k, []); return S.strokes.get(k); };

  // ── 그리기 층 ──
  const svg = document.createElementNS(NS, 'svg'); svg.id = 'dpen-svg'; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); stage.appendChild(svg);
  const laser = document.createElementNS(NS, 'circle'); laser.setAttribute('class', 'laser'); laser.setAttribute('r', '15'); laser.setAttribute('fill', '#ff2a2a'); laser.setAttribute('visibility', 'hidden'); svg.appendChild(laser);
  const dstr = (pts) => {   // 점들 → 부드러운 경로(이웃 점의 가운데를 이은 2차 곡선)
    if (pts.length < 2) return `M${pts[0][0]} ${pts[0][1]}l.1 0`;
    let s = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) s += `Q${pts[i][0]} ${pts[i][1]} ${(pts[i][0] + pts[i + 1][0]) / 2} ${(pts[i][1] + pts[i + 1][1]) / 2}`;
    const l = pts[pts.length - 1]; return s + `L${l[0]} ${l[1]}`;
  };
  const mkPath = (s) => {
    const g = document.createElementNS(NS, 'path'); g.setAttribute('d', dstr(s.pts)); g.setAttribute('fill', 'none'); g.setAttribute('stroke', s.color); g.setAttribute('stroke-width', s.w);
    g.setAttribute('stroke-linecap', 'round'); g.setAttribute('stroke-linejoin', 'round'); if (s.tool === 'hi') g.setAttribute('stroke-opacity', '.4'); s.el = g; return g;
  };
  const redraw = () => { [...svg.querySelectorAll('path')].forEach((x) => x.remove()); list().forEach((s) => svg.insertBefore(mkPath(s), laser)); count(); };
  const total = () => [...S.strokes.values()].reduce((n, a) => n + a.length, 0);

  // ── 도구 판 ──
  const panel = document.createElement('div'); panel.id = 'dpen'; panel.setAttribute('role', 'toolbar'); panel.setAttribute('aria-label', '강조 도구'); document.body.appendChild(panel);
  const toolBtn = (t, name, key) => `<button data-t="${t}" title="${name} (${key})">${IC[t]}<span>${name}</span></button>`;
  const paint = () => {
    const t = S.tool, col = t === 'pen' || t === 'hi';
    panel.innerHTML = toolBtn('pen', '펜', 'P') + toolBtn('hi', '형광펜', 'H') + toolBtn('laser', '레이저', 'L') + `<button data-t="eraser" title="지우개 — 지울 표시 위를 문지르세요">${IC.eraser}<span>지우개</span></button><div class="sep"></div>`
      + (col ? `<div class="cols">${COLORS.map(([c, n]) => `<button data-c="${c}" title="${n}" class="${S.color[t] === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`
        + `<div class="szs">${[0, 1, 2].map((i) => `<button data-s="${i}" title="굵기 ${i + 1}" class="${S.size[t] === i ? 'on' : ''}"><i style="width:${8 + i * 4}px;height:${8 + i * 4}px"></i></button>`).join('')}</div><div class="sep"></div>` : '')
      + `<button data-a="undo" title="되돌리기 (Ctrl+Z)">${IC.undo}<span>되돌리기</span></button><button class="clr" data-a="clear" title="모든 페이지의 표시를 한 번에 지웁니다 (되돌리기로 다시 살릴 수 있어요)">${IC.clear}<span>모두 지움</span></button>`
      + `<div class="sep"></div><button data-a="close" title="도구 끄기 (Esc) — 그린 표시는 남습니다">${IC.close}<span>닫기</span></button>`;
    panel.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    count();
  };
  const count = () => { const u = panel.querySelector('[data-a="undo"]'), c = panel.querySelector('[data-a="clear"]'); if (u) u.disabled = !S.hist.length; if (c) c.disabled = !total(); };
  const setTool = (t) => {
    S.tool = t; if (t && t !== 'eraser' && t !== 'laser') { S.last = t; savePrefs(); } else if (t) { S.last = t === 'laser' ? 'laser' : S.last; }
    svg.classList.toggle('on', !!t); svg.classList.toggle('eraser', t === 'eraser'); panel.classList.toggle('on', !!t); document.body.classList.toggle('dpen-on', !!t);
    laser.setAttribute('visibility', 'hidden'); const bb = document.querySelector('#pen-btn'); if (bb) bb.classList.toggle('on', !!t); if (t) paint();
  };

  // ── 되돌리기 · 모두 지움 ──
  const undo = () => {
    const h = S.hist.pop(); if (!h) return;
    if (h.t === 'add') { const a = list(h.k), i = a.indexOf(h.s); if (i >= 0) a.splice(i, 1); }
    else if (h.t === 'del') h.items.slice().reverse().forEach(({ s, i }) => list(h.k).splice(Math.min(i, list(h.k).length), 0, s));
    else if (h.t === 'clear') { S.strokes = new Map([...h.snap].map(([k, a]) => [k, a.slice()])); }
    redraw();
  };
  const clearAll = () => {
    if (!total()) return; S.hist.push({ t: 'clear', snap: new Map([...S.strokes].map(([k, a]) => [k, a.slice()])) }); if (S.hist.length > 80) S.hist.shift();
    S.strokes = new Map(); redraw(); const b = panel.querySelector('[data-a="clear"] span'); if (b) { b.textContent = '지웠어요'; setTimeout(() => { if (b.isConnected) b.textContent = '모두 지움'; }, 1100); }
  };

  // ── 포인터 ──
  const pt = (e) => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * W / r.width * 10) / 10, Math.round((e.clientY - r.top) * H / r.height * 10) / 10]; };
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
  const hit = (s, p) => { const r = 26 + s.w / 2; if (s.pts.length === 1) return Math.hypot(p[0] - s.pts[0][0], p[1] - s.pts[0][1]) <= r; for (let i = 1; i < s.pts.length; i++) if (segDist(p, s.pts[i - 1], s.pts[i]) <= r) return true; return false; };
  const eraseAt = (p) => { const a = list(); for (let i = a.length - 1; i >= 0; i--) if (hit(a[i], p)) { S.erasing.items.push({ s: a[i], i }); a[i].el?.remove(); a.splice(i, 1); } };
  svg.addEventListener('pointerdown', (e) => {
    if (!S.tool || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation(); svg.setPointerCapture(e.pointerId); const p = pt(e);
    if (S.tool === 'pen' || S.tool === 'hi') {
      const s = { tool: S.tool, color: S.color[S.tool], w: SIZES[S.tool][S.size[S.tool]], pts: [p] }; list().push(s); svg.insertBefore(mkPath(s), laser); S.drawing = s;
    } else if (S.tool === 'eraser') { S.erasing = { t: 'del', k: cur(), items: [] }; eraseAt(p); }
    else if (S.tool === 'laser') { laser.setAttribute('cx', p[0]); laser.setAttribute('cy', p[1]); laser.setAttribute('visibility', 'visible'); }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!S.tool) return; const p = pt(e);
    if (S.drawing) {
      const a = S.drawing.pts, l = a[a.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 1.5) return; a.push(p); S.drawing.el.setAttribute('d', dstr(a));
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [])) { const q = pt(ev), m = a[a.length - 1]; if (Math.hypot(q[0] - m[0], q[1] - m[1]) >= 1.5) a.push(q); } S.drawing.el.setAttribute('d', dstr(a));
    } else if (S.erasing) eraseAt(p);
    else if (S.tool === 'laser') { laser.setAttribute('cx', p[0]); laser.setAttribute('cy', p[1]); laser.setAttribute('visibility', 'visible'); }
  });
  const end = () => {
    if (S.drawing) { S.hist.push({ t: 'add', k: cur(), s: S.drawing }); S.drawing = null; }
    if (S.erasing) { if (S.erasing.items.length) S.hist.push(S.erasing); S.erasing = null; }
    if (S.hist.length > 80) S.hist.shift(); count();
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { if (S.tool === 'laser') laser.setAttribute('visibility', 'hidden'); });
  ['touchstart', 'touchend'].forEach((n) => svg.addEventListener(n, (e) => { if (S.tool) e.stopPropagation(); }, { passive: true }));   // 덱의 터치 밀기 넘김이 그리는 획을 쪽 넘김으로 읽지 않게
  svg.addEventListener('contextmenu', (e) => { if (S.tool) e.preventDefault(); });
  addEventListener('deckshow', () => { S.drawing = null; S.erasing = null; redraw(); });

  // ── 판 · 단추 · 키 ──
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t) { setTool(b.dataset.t); return; }
    if (b.dataset.c) { S.color[S.tool] = b.dataset.c; savePrefs(); paint(); return; }
    if (b.dataset.s) { S.size[S.tool] = Number(b.dataset.s); savePrefs(); paint(); return; }
    if (b.dataset.a === 'undo') undo(); else if (b.dataset.a === 'clear') clearAll(); else if (b.dataset.a === 'close') setTool(null);
    count();
  });
  const bar = document.querySelector('#bar');
  if (bar) {
    const bt = document.createElement('button'); bt.className = 'nb'; bt.id = 'pen-btn'; bt.title = '강조 도구 — 펜 · 형광펜 · 레이저 · 지우개 (P)'; bt.innerHTML = `${IC.pen}<span>강조</span>`;
    bt.onclick = () => setTool(S.tool ? null : S.last === 'hi' || S.last === 'pen' ? S.last : 'pen'); bar.insertBefore(bt, bar.querySelector('#fs'));
  }
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('dedit') || (e.target && /TEXTAREA|INPUT|SELECT/.test(e.target.tagName)) || e.target?.isContentEditable) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && S.tool && !/TEXTAREA|INPUT/.test(e.target?.tagName || '')) { e.preventDefault(); undo(); }   // 도구를 켠 동안 Ctrl/⌘+Z
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'p') setTool(S.tool === 'pen' ? null : 'pen'); else if (k === 'h') setTool(S.tool === 'hi' ? null : 'hi'); else if (k === 'l') setTool(S.tool === 'laser' ? null : 'laser');
    else if (e.key === 'Escape' && S.tool) setTool(null);
  });
  // ✎ 편집을 켜면 도구를 끈다(편집은 무대를 직접 눌러 고치는 것이라 겹친다)
  new MutationObserver(() => { if (document.body.classList.contains('dedit') && S.tool) setTool(null); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.DeckPen = { set: setTool, clear: clearAll, undo, get tool() { return S.tool; }, get marks() { return total(); } };
  redraw();
})();
