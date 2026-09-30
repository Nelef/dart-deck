// 덱 확대·축소 — 마우스 휠 · 트랙패드 핀치(ctrl+휠) · 터치 두 손가락 핀치 · 확대 중 끌어서 이동 · 키 + − 0.
// 무대(#stage)의 창 맞춤(fit, scale K)은 건드리지 않고 그 바깥 #view 에 translate+scale 을 한 겹 더 건다.
// 그래서 덱마다 있는 fit() 과 충돌하지 않는다. 좌표를 쓰는 곳(말풍선·세부 카드)은 K 대신
// 무대의 실제 화면 폭(getBoundingClientRect().width / 1600)으로 나눠야 확대 중에도 맞는다.
(() => {
  const view = document.querySelector('#view');
  if (!view) return;
  const MIN = 1; const MAX = 5;
  let Z = 1; let tx = 0; let ty = 0;
  const st = document.createElement('style');
  st.textContent = `
    #view { transform-origin: 0 0; touch-action: none; }
    #view.zdrag, #view.zdrag * { cursor: grabbing !important; user-select: none; }
    #view.zoomed { cursor: grab; }
    #drawer, #kpop, .code, pre, #kpanel { touch-action: pan-y; }
    #zbadge { min-width: 58px; }
  `;
  document.head.appendChild(st);

  // 확대 배율 표시 겸 되돌리기 버튼 — 조작줄의 전체화면 버튼 앞에
  const bar = document.querySelector('#bar');
  const badge = document.createElement('button');
  badge.id = 'zbadge'; badge.className = 'nb'; badge.title = '확대 되돌리기 (0) · 휠/핀치로 확대 · 확대 중 끌어서 이동';
  Object.assign(badge.style, { width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: '800' });
  badge.onclick = () => reset();
  if (bar) bar.insertBefore(badge, bar.querySelector('#fs'));

  // 이동 범위 — 확대한 화면이 창 밖으로 빠져 빈 곳이 보이지 않게
  const clamp = () => {
    const W = view.offsetWidth; const H = view.offsetHeight;
    tx = Math.min(0, Math.max(W * (1 - Z), tx));
    ty = Math.min(0, Math.max(H * (1 - Z), ty));
  };
  const apply = () => {
    clamp();
    view.style.transform = Z === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${Z})`;
    view.classList.toggle('zoomed', Z > 1);
    badge.textContent = `${Math.round(Z * 100)}%`;
  };
  // (cx, cy) 화면 점을 기준으로 배율을 바꾼다 — 그 점이 손가락·커서 아래 그대로 남는다
  const zoomAt = (cx, cy, nz) => {
    const ox = cx - view.offsetLeft; const oy = cy - view.offsetTop;
    nz = Math.max(MIN, Math.min(MAX, nz));
    tx = ox - (ox - tx) * (nz / Z); ty = oy - (oy - ty) * (nz / Z);
    Z = nz; if (Z === 1) { tx = 0; ty = 0; }
    apply();
  };
  const reset = () => { Z = 1; tx = 0; ty = 0; apply(); };
  window.DeckZoom = { reset, get z() { return Z; } };

  // 안에서 스크롤해야 하는 곳(서랍·코드 상자 등) 위에서는 휠을 그 상자에 넘긴다 — 트랙패드 핀치(ctrl)는 예외
  const scrollableUnder = (el) => {
    for (let n = el; n && n !== view; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return true;
    }
    return false;
  };
  view.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && scrollableUnder(e.target)) return;
    e.preventDefault();
    // 트랙패드 핀치는 deltaY 가 작고 촘촘하게, 마우스 휠은 한 칸이 크게 온다 — 계수를 달리 둔다
    const k = e.ctrlKey ? 0.012 : 0.0018;
    zoomAt(e.clientX, e.clientY, Z * Math.exp(-e.deltaY * k));
  }, { passive: false });

  // 포인터 — 터치 두 손가락은 핀치, 확대 중 한 손가락·마우스는 끌어서 이동
  const pts = new Map();
  let pinch = null; let drag = null; let moved = false;
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('#drawer, #kpop, .code, pre, textarea, input, select')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: Z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
    } else if (pts.size === 1 && Z > 1) {
      drag = { x: e.clientX, y: e.clientY, tx, ty };
    }
  });
  addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y); const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      zoomAt(mx, my, pinch.z * (d / pinch.d));
      tx += mx - pinch.mx; ty += my - pinch.my; pinch.mx = mx; pinch.my = my; apply();
      moved = true;
    } else if (drag) {
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; view.classList.add('zdrag');
      tx = drag.tx + dx; ty = drag.ty + dy; apply();
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { drag = null; view.classList.remove('zdrag'); }
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  // 끌거나 핀치한 뒤 손을 떼면 click 이 한 번 나온다 — 그게 "다음 장"으로 가지 않게 막는다
  addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);

  // 키 — + 확대 · − 축소 · 0 되돌리기(글 입력 중엔 무시)
  addEventListener('keydown', (e) => {
    if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName)) return;
    const cx = view.offsetLeft + view.offsetWidth / 2; const cy = view.offsetTop + view.offsetHeight / 2;
    if (e.key === '+' || e.key === '=') zoomAt(cx, cy, Z * 1.25);
    else if (e.key === '-' || e.key === '_') zoomAt(cx, cy, Z / 1.25);
    else if (e.key === '0') reset();
  });
  // 장이 바뀌면 배율을 되돌린다 — 확대한 채 다음 장이 엉뚱한 곳부터 보이지 않게
  const mo = new MutationObserver((ms) => { if (ms.some((m) => m.target.classList.contains('slide') && m.target.classList.contains('on') && !(m.oldValue || '').includes('on'))) reset(); });
  document.querySelectorAll('.slide').forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));
  addEventListener('resize', () => apply());
  apply();
})();
