// ✎ 편집의 왼쪽 페이지 목록(썸네일) — PPT 처럼: 누르면 그 장으로 옮겨 고치기, 우클릭 = 다음에 새 장 · 복제 · 복사 · 붙여넣기,
// 목록을 누른 뒤 Ctrl/⌘+D(복제) · Ctrl/⌘+C · Ctrl/⌘+V(다음에 붙여넣기). 사용자 지정(2026-09-30). js/deckedit.js 가 편집을 시작할 때 연다.
// 썸네일 = 무대의 장을 그대로 복제해 1/10 로 줄인 것(그림을 따로 찍지 않아 곧바로 보인다). 덱 스타일이 '.slide h2' 처럼 slide 클래스에 기대서
// 클래스는 남기고 data-name 만 뺀다 — 장을 찾는 코드는 '#stage .slide' 로 좁혀 두었다(deckkit).
// 장을 더하는 일은 파일의 '그 장 <section>'을 '그 장 + 새 장'으로 바꾸는 /api/edit 한 번(서버 규칙: 지금 장 마크업 통째 바꾸기) — 새 장 · 복제본은
// data-frozen(고정)으로 넣는다. 복제본은 지금 화면 그대로라 스크립트 없이도 같게 보인다. 저장 뒤 새로고침하고 새 장에서 편집을 이어 연다.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const E = () => window.DeckEdit;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rx = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 모양(사용자 지적 2026-09-30 '디자인이 아쉽다'): 썸네일이 잘리고 가로 스크롤 · 어두운 목록이 밝은 리본과 따로 놀았다 →
  // PPT 처럼 밝은 회색 판 · 썸네일은 목록 폭에 맞춤(번호 칸 빼고 176px = 무대 0.11배) · 얇은 스크롤 막대 · 아래 [편집 · 저장 · 끝내기]는 목록 바닥 줄
  // 폭(--de-sw)은 목록 오른쪽 끝을 끌어(마우스 · 터치) 150~420px — 썸네일도 따라 커진다(--th-w · --th-k, 사용자 지정 2026-09-30).
  // 위는 리본에 딱 붙인다(--fit-top 의 +4px 는 무대 숨 쉴 틈이라 목록엔 빼야 검은 줄이 안 생긴다)
  const CSS = `
  :root { --de-sw: 232px; --th-w: 186px; --th-k: .11625; }
  #de-slides { position: fixed; left: 0; top: calc(var(--fit-top, 104px) - 4px); bottom: 0; width: var(--de-sw); z-index: 70; background: #f4f5f7; border-right: 1px solid #e3e6ea;
    overflow-x: hidden; overflow-y: auto; padding: 16px 14px 84px 8px; display: none; scrollbar-width: thin; scrollbar-color: #c3c8cf transparent; }
  #de-slides::-webkit-scrollbar { width: 6px; } #de-slides::-webkit-scrollbar-thumb { background: #c3c8cf; border-radius: 99px; }
  body.dedit #de-slides { display: block; }
  #de-slides .it { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 16px; cursor: pointer; }
  #de-slides .no { width: 16px; text-align: right; font: 700 11px 'Noto Sans KR', sans-serif; color: #9aa1ab; padding-top: 4px; flex: none; }
  #de-slides .th { position: relative; width: var(--th-w); height: calc(var(--th-w) * .5625); border-radius: 8px; overflow: hidden; background: var(--stage, #fbfbfd); flex: none;
    box-shadow: 0 1px 4px rgba(20,24,40,.12); outline: 2px solid transparent; outline-offset: 3px; transition: outline-color .12s; }
  #de-slides .th > .slide { transform: scale(var(--th-k)); transform-origin: 0 0; width: 1600px; height: 900px; pointer-events: none; transition: none; }
  #de-slides .it:hover .th { outline-color: #c3c8cf; }
  #de-slides .it.sel .th { outline-color: #9DB2F7; } #de-slides .it.cur .th, #de-slides .it.cur:hover .th { outline-color: #416AF0; }
  #de-slides .it.cur .no { color: #1E3A8A; }
  #de-sgrip { position: fixed; top: calc(var(--fit-top, 104px) - 4px); bottom: 0; left: calc(var(--de-sw) - 5px); width: 10px; z-index: 72; cursor: col-resize; touch-action: none; display: none; }
  body.dedit #de-sgrip { display: block; }
  #de-sgrip::after { content: ''; position: absolute; left: 4px; top: 50%; width: 3px; height: 44px; margin-top: -22px; border-radius: 99px; background: #c3c8cf; opacity: 0; transition: opacity .15s; }
  #de-sgrip:hover::after, body.de-sgrab #de-sgrip::after { opacity: 1; } body.de-sgrab, body.de-sgrab * { cursor: col-resize !important; user-select: none; }
  @media (max-width: 640px), (max-height: 500px) { #de-slides, #de-sgrip { display: none !important; } }
  `;
  const S = {
    focus: false, sel: -1, clip: null,
    init() {
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      const p = document.createElement('div'); p.id = 'de-slides'; document.body.appendChild(p);
      p.addEventListener('pointerdown', () => { S.focus = true; }, true);
      p.addEventListener('click', (e) => { const it = e.target.closest('.it'); if (!it) return; S.pick(Number(it.dataset.k)); });
      p.addEventListener('contextmenu', (e) => { const it = e.target.closest('.it'); if (!it) return; e.preventDefault(); S.sel = Number(it.dataset.k); S.draw(); S.menu(e); });
      // 폭 조절 손잡이 — 끄는 동안 무대 맞춤은 한 프레임에 한 번
      const g = document.createElement('div'); g.id = 'de-sgrip'; g.title = '끌어서 목록 폭 조절'; document.body.appendChild(g);
      try { const w = Number(localStorage.getItem('deckedit.sw')); if (w >= 150 && w <= 420) S.setW(w); } catch (e) { /* 저장소 없음 */ }
      let raf = 0;
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault(); g.setPointerCapture(e.pointerId); document.body.classList.add('de-sgrab');
        const mv = (ev) => { S.setW(ev.clientX); if (!raf) raf = requestAnimationFrame(() => { raf = 0; S.fitLeft(); }); };
        const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); document.body.classList.remove('de-sgrab'); S.fitLeft();
          try { localStorage.setItem('deckedit.sw', String(S.w)); } catch (e2) { /* 저장소 없음 */ } };
        g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      });
      // 편집 중 바뀐 장의 썸네일을 곧 갱신(0.4초 모아서)
      let t = 0; S.touch = () => { clearTimeout(t); t = setTimeout(() => S.refresh(E().cfg.deck().cur), 400); };
    },
    deck() { return E().cfg.deck(); },
    w: 232,
    // 목록 폭 → 썸네일 폭 · 배율(번호 칸 16 + 틈 8 + 안쪽 여백 22 을 뺀 것)
    setW(w) { S.w = Math.round(Math.max(150, Math.min(420, w))); const tw = S.w - 46; const r = document.documentElement.style;
      r.setProperty('--de-sw', `${S.w}px`); r.setProperty('--th-w', `${tw}px`); r.setProperty('--th-k', String(tw / 1600)); },
    fitLeft() { const p = document.querySelector('#de-slides'); document.body.style.setProperty('--fit-left', p && p.offsetWidth ? `${p.offsetWidth}px` : '0px'); window.DeckFit?.(); E().draw?.(); },
    open() { S.sel = S.deck().cur; S.draw(); S.fitLeft(); $('#de-slides')?.querySelector('.it.cur')?.scrollIntoView({ block: 'nearest' }); },
    close() { document.body.style.removeProperty('--fit-left'); S.focus = false; },
    thumb(slide) {
      const c = slide.cloneNode(true); c.removeAttribute('data-name'); c.classList.add('on');
      c.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
      c.querySelectorAll('[data-at]').forEach((x) => x.classList.add('shown'));
      return c;
    },
    draw() {
      const p = $('#de-slides'); if (!p) return; const d = S.deck();
      p.innerHTML = '';
      d.slides.forEach((s, k) => {
        const it = document.createElement('div'); it.className = `it${k === d.cur ? ' cur' : ''}${k === S.sel ? ' sel' : ''}`; it.dataset.k = k; it.title = s.dataset.name;
        it.innerHTML = `<div class="no">${k + 1}</div><div class="th"></div>`; it.querySelector('.th').appendChild(S.thumb(s)); p.appendChild(it);
      });
    },
    // 선택 표시만 옮긴다(목록을 다시 그리지 않아 깜빡이지 않게)
    mark() { const d = S.deck(); document.querySelectorAll('#de-slides .it').forEach((it) => { const k = Number(it.dataset.k); it.classList.toggle('cur', k === d.cur); it.classList.toggle('sel', k === S.sel); }); document.querySelector('#de-slides .it.cur')?.scrollIntoView({ block: 'nearest' }); },
    refresh(k) { const it = $(`#de-slides .it[data-k="${k}"] .th`); if (!it) return; it.innerHTML = ''; it.appendChild(S.thumb(S.deck().slides[k])); },
    // 다른 장으로 — 저장 안 한 편집이 있으면 막는다(말없이 버리지 않게)
    pick(k) {
      S.sel = k; const d = S.deck();
      if (k === d.cur) { S.mark(); return; }
      if (E().dirty) { E().toast('저장하거나 되돌린 뒤 다른 페이지로 옮길 수 있어요'); S.mark(); return; }
      E().switchTo(k);
    },
    menu(e) {
      const cm = $('#de-cm'); const k = S.sel; const K = E().keyName;
      const it = (id, label, key, ok = true) => `<button data-s="${id}" ${ok ? '' : 'disabled'}><span>${label}</span><small>${key || ''}</small></button>`;
      cm.innerHTML = it('new', '다음에 새 페이지 추가', '') + it('dup', '이 페이지 복제', K('D')) + '<hr>' + it('copy', '페이지 복사', K('C')) + it('paste', '다음에 붙여넣기', K('V'), !!S.clip)
        + '<hr>' + it('del', '이 페이지 삭제', 'Delete', S.deck().slides.length > 1);
      cm.classList.add('on'); cm.style.left = `${Math.min(innerWidth - cm.offsetWidth - 8, e.clientX)}px`; cm.style.top = `${Math.max(8, Math.min(innerHeight - cm.offsetHeight - 8, e.clientY))}px`;
      cm.onclick = (ev) => { const b = ev.target.closest('button[data-s]'); if (!b || b.disabled) return; cm.classList.remove('on'); S.op(b.dataset.s, k); };
    },
    // 목록을 누른 뒤의 단축키 — deckedit 의 키 처리가 먼저 여기 묻는다(처리했으면 true)
    key(e) {
      if (S.focus && (e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest?.('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); e.stopImmediatePropagation(); S.op('del', S.sel >= 0 ? S.sel : S.deck().cur); return true; }
      if (!S.focus || !E().mod(e) || e.shiftKey || e.altKey) return false;
      const k = e.key.toLowerCase(); const op = { d: 'dup', c: 'copy', v: 'paste' }[k]; if (!op) return false;
      e.preventDefault(); e.stopImmediatePropagation(); S.op(op, S.sel >= 0 ? S.sel : S.deck().cur); return true;
    },
    names() { return S.deck().slides.map((s) => s.dataset.name); },
    uniq(base) { const have = new Set(S.names()); if (!have.has(base)) return base; for (let n = 2; ; n++) if (!have.has(`${base} ${n}`)) return `${base} ${n}`; },
    today: () => new Date().toLocaleDateString('sv'),
    // 지금 화면 그대로(스크립트가 그린 것 포함)를 새 이름 · 고정 표시로
    frozenCopy(slide, name) {
      const c = slide.cloneNode(true);
      c.querySelectorAll('.cast').forEach((x) => x.remove());   // 등장인물 띠는 덱 엔진이 data-cast 로 다시 붙인다
      c.classList.remove('on'); c.setAttribute('data-name', name); c.setAttribute('data-frozen', S.today()); c.removeAttribute('id');
      return E().clean(c.outerHTML);
    },
    async op(op, k) {
      const d = S.deck(); const s = d.slides[k]; if (!s) return;
      if (op === 'copy') { S.clip = { name: s.dataset.name, html: S.frozenCopy(s, '__clip__') }; E().toast(`「${s.dataset.name}」 페이지를 복사했습니다 — 붙일 페이지를 누르고 ${E().keyName('V')}`); return; }
      if (E().dirty) { E().toast('저장하거나 되돌린 뒤 페이지를 더하거나 지울 수 있어요'); return; }
      if (op === 'del') {
        if (d.slides.length <= 1) return;
        if (!confirm(`「${s.dataset.name}」 페이지를 지울까요?\n(파일은 저장 전에 백업되어 되돌릴 수 있습니다)`)) return;
        return S.remove(s.dataset.name, Math.max(0, k - 1));
      }
      let html;
      if (op === 'new') { const nm = S.uniq('새 페이지'); html = `<section class="slide" data-name="${esc(nm)}" data-steps="0" data-frozen="${S.today()}">\n  <h2>제목</h2>\n  <p class="cap">내용을 적으세요</p>\n</section>`; }
      else if (op === 'dup') html = S.frozenCopy(s, S.uniq(`${s.dataset.name} 복사`));
      else if (op === 'paste') { if (!S.clip) return; html = S.clip.html.replace('data-name="__clip__"', `data-name="${esc(S.uniq(`${S.clip.name} 복사`))}"`); }
      await S.insertAfter(s.dataset.name, html, k + 1);
    },
    async insertAfter(name, html, goto) {
      E().toast('페이지를 더하는 중…', 20000);
      try {
        const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
        const find = (src.match(new RegExp(`<section[^>]*data-name="${rx(name)}"[\\s\\S]*?</section>`)) || [''])[0];
        if (!find) throw new Error('이 페이지의 원본을 찾지 못했습니다');
        const sha = window.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))].map((x) => x.toString(16).padStart(2, '0')).join('') : window.DeckCheck.sha256js(src);
        const r = await fetch('/api/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, sha, slide: name, edits: [{ kind: 'slide', find, replace: `${find}\n\n${html}` }] }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        try { sessionStorage.setItem('deckedit.resume', '1'); } catch (e) { /* 저장소 없음 */ }
        E().on = false; location.hash = `#${goto + 1}`; location.reload();
      } catch (e) { E().toast(`페이지를 더하지 못했습니다: ${e.message}`, 6000); }
    },
    // 페이지 지우기 — 서버 kind 'delete-slide'(그 페이지 <section> 만 지움, 스크립트는 남김 · 덱 엔진이 없는 페이지의 스크립트는 건너뜀)
    async remove(name, goto) {
      E().toast('페이지를 지우는 중…', 20000);
      try {
        const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
        const find = (src.match(new RegExp(`<section[^>]*data-name="${rx(name)}"[\\s\\S]*?</section>`)) || [''])[0];
        if (!find) throw new Error('이 페이지의 원본을 찾지 못했습니다');
        const sha = window.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))].map((x) => x.toString(16).padStart(2, '0')).join('') : window.DeckCheck.sha256js(src);
        const r = await fetch('/api/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, sha, slide: name, edits: [{ kind: 'delete-slide', find, replace: '' }] }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        try { sessionStorage.setItem('deckedit.resume', '1'); } catch (e) { /* 저장소 없음 */ }
        E().on = false; location.hash = `#${goto + 1}`; location.reload();
      } catch (e) { E().toast(`페이지를 지우지 못했습니다: ${e.message}`, 6000); }
    },
  };
  window.DeckSlides = S;
  S.init();
})();
