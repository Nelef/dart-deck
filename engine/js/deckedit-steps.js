// ✎ 편집의 [단계] 탭 — 한 페이지 안에서 차례로 나타나는 것(PPT 의 '애니메이션 · 나타내기')을 고친다.
// 사용자 지정(2026-09-30): "한 장에 여러 단계가 있는 형태인데 이것도 우리 편집에 넣을 수 있나?" — v2 한눈에(자막 덱)처럼
//   data-steps(페이지의 단계 수) · data-at="k"(k 단계부터 보임) · data-only="1,2"(그 단계에만 보임)로 짠 페이지.
// 하는 일:
//   · 단계 미리보기 ◀ n / N ▶ — 덱 엔진이 그 단계로 그린다(자막 · 훅까지). 그 단계에 보이는 것만 누를 수 있다
//   · 고른 요소가 나타나는 때: [항상] · [이 단계부터] · [이 단계에만] — 지금 보는 단계를 기준으로
//   · 페이지 단계 수 + / − — 저장 때 <section data-steps> 로
//   · 번호 딱지 — 단계가 붙은 요소마다 「2~」 · 「1·2」 (PPT 애니메이션 번호처럼)
//   · 다른 단계 것은 흐리게 보인다 — 누르지는 못한다(겹친 자리에서 안 보이는 것이 잡혀 헷갈렸다 — 그 단계로 옮겨서 고친다)
// 한계: 자막(captions)은 스크립트 안 글이라 여기서 못 고친다 — AI 에게 「3단계 자막을 …로」라고 부탁한다.
(() => {
  if (window.DeckSteps) return;
  const $ = (s, r = document) => r.querySelector(s);
  const E = () => window.DeckEdit;
  const CSS = `
  /* 다른 단계 것 — 흐리게 · 못 누름(편집 중에만). 덱 엔진 기본은 안 보임(opacity 0) */
  body.dedit.de-dim #stage [data-at]:not(.shown), body.dedit.de-dim #stage [data-only]:not(.shown) { opacity: .22 !important; transform: none !important; pointer-events: none !important; }
  #de-sov { position: absolute; inset: 0; pointer-events: none; z-index: 56; }
  #de-sov i { position: absolute; transform: translate(-40%, -60%); font: 800 12px/1 'Noto Sans KR', sans-serif; font-style: normal; color: #fff; background: #7c3aed; border-radius: 99px; padding: 3px 7px;
    box-shadow: 0 1px 4px rgba(0,0,0,.25); white-space: nowrap; scale: var(--inv, 1); transform-origin: 0 0; }
  #de-sov i.off { background: #b3a6d9; }
  #de-rb .st-n { font: 800 13px 'Noto Sans KR', sans-serif; color: #16181d; min-width: 120px; text-align: center; white-space: nowrap; }
  #de-rb .st-cap { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12.5px 'Noto Sans KR', sans-serif; color: #545b66; padding: 0 6px; }
  #de-rb .st-now { font: 700 12.5px 'Noto Sans KR', sans-serif; color: #7c3aed; padding: 0 6px; white-space: nowrap; }
  #de-rb button.st-on { background: #EDE9FE; color: #6d28d9; }
  `;
  const S = {
    steps0: null,   // 이 편집을 시작할 때 파일의 단계 수 — 바뀌었을 때만 저장 때 data-steps 를 고친다
    deck: () => E().cfg.deck(),
    n: () => Number(E().cur().dataset.steps || 0),
    step: () => S.deck().step,
    // 요소가 나타나는 때(글) — 딱지 · 리본 표시
    label(el) {
      if (el.hasAttribute('data-only')) return el.dataset.only.split(',').map((x) => x.trim()).filter(Boolean).join('·');
      if (el.hasAttribute('data-at')) return `${el.dataset.at}~`;
      return '';
    },
    // ── 리본에 [단계] 탭 붙이기 — 리본은 한 번 만들어진다(DeckRibbon.build). 만든 뒤에 끼운다 ──
    inject() {
      const rb = $('#de-rb'); if (!rb || rb.querySelector('[data-tab="steps"]')) return;
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      const tab = document.createElement('button'); tab.dataset.tab = 'steps'; tab.title = '단계 도구 — 한 페이지 안에서 차례로 나타나기'; tab.textContent = '단계';
      rb.querySelector('.tabs').appendChild(tab);
      const pane = document.createElement('div'); pane.className = 'pane'; pane.dataset.pane = 'steps';
      pane.innerHTML = `<div class="grp"><span class="lab">미리보기</span><button data-st="prev" title="앞 단계">◀</button><span class="st-n" id="de-stn">0 / 0</span><button data-st="next" title="다음 단계">▶</button><span class="st-cap" id="de-stcap"></span></div>
        <div class="grp"><span class="lab">고른 것</span><button data-st="always" title="처음부터 늘 보이게">항상</button><button data-st="from" title="지금 보는 단계부터 보이게(뒤 단계에서도 남는다)">이 단계부터</button><button data-st="only" title="지금 보는 단계에만 보이게(다음 단계에서 사라진다)">이 단계에만</button><span class="st-now" id="de-stnow"></span></div>
        <div class="grp"><span class="lab">페이지 단계 수</span><button data-st="minus" title="마지막 단계 빼기">−</button><button data-st="plus" title="단계 하나 더하기">＋</button></div>
        <div class="grp" style="border-right:0"><button data-st="dim" class="st-on" title="다른 단계에 나오는 것을 흐리게 보기">다른 단계 흐리게</button><button data-st="badge" class="st-on" title="요소마다 나타나는 단계 번호">번호</button></div>`;
      rb.querySelector('[data-pane="arrange"]').after(pane);
      pane.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
      pane.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) S.act(b.dataset.st, b); });
      document.body.classList.add('de-dim'); S.badges = true;
    },
    act(a, btn) {
      const D = E(); const n = S.n(); const k = S.step();
      if (a === 'prev' || a === 'next') { const t = Math.max(0, Math.min(n, k + (a === 'next' ? 1 : -1))); if (t !== k) S.go(t); return; }
      if (a === 'dim') { const on = document.body.classList.toggle('de-dim'); btn.classList.toggle('st-on', on); return; }
      if (a === 'badge') { S.badges = !S.badges; btn.classList.toggle('st-on', S.badges); S.draw(); return; }
      if (a === 'plus' || a === 'minus') {
        const m = a === 'plus' ? n + 1 : Math.max(0, n - 1); if (m === n) return;
        // 줄이면 없어지는 단계에만 나오던 것이 안 보이게 된다 — 알려 준다
        const lost = a === 'minus' ? [...D.cur().querySelectorAll('[data-at], [data-only]')].filter((el) => (el.hasAttribute('data-at') ? Number(el.dataset.at) > m : el.dataset.only.split(',').every((x) => Number(x) > m))).length : 0;
        D.cur().dataset.steps = String(m); D.changed(); S.go(Math.min(k, m));
        D.toast(`이 페이지 ${m ? `단계 ${m}개 — 처음 화면 뒤로 ${m}번 더 나타납니다` : '단계 없음 — 모두 처음부터 보입니다'}${lost ? ` — 없어진 단계에만 나오던 것 ${lost}개는 이제 안 보입니다(항상 · 이 단계부터로 바꿔 주세요)` : ''}`, lost ? 5200 : 2400);
        return;
      }
      if (!D.sel.length) { D.toast('먼저 요소를 고르세요 — 그 요소가 나타나는 단계를 정합니다'); return; }
      if (!D.need(D.sel)) return;
      if (a !== 'always' && n === 0) { D.toast('이 페이지는 단계가 없습니다 — 먼저 [＋]로 단계를 더하세요'); return; }
      D.sel.forEach((el) => {
        el.removeAttribute('data-at'); el.removeAttribute('data-only');
        if (a === 'from') el.dataset.at = String(k); if (a === 'only') el.dataset.only = String(k);
        D.mirror(el);
      });
      S.render(); D.changed();
      D.toast({ always: '처음부터 늘 보입니다', from: k ? `${k}단계부터 보입니다` : '처음부터 보입니다', only: k ? `${k}단계에만 보입니다` : '처음 화면에만 보입니다' }[a]);
    },
    // 덱 엔진으로 그 단계를 그린다 — 고른 것은 풀린다(안 보이게 된 것을 잡고 있지 않게)
    go(k) { const D = E(); D.sel = D.sel.filter((el) => !el.matches('[data-at], [data-only]')); S.deck().show(S.deck().cur, k); D.draw(); setTimeout(() => { S.sync(); S.draw(); }, 220); },   // 자막은 140ms 뒤에 바뀐다
    // 단계 표시만 다시(자막 · 훅은 그대로) — 요소의 단계를 바꾼 직후
    render() { S.deck().render(); },
    sync() {
      const n = S.n(); const k = S.step(); const x = $('#de-stn'); if (!x) return;
      x.textContent = n ? `${k ? `${k}단계` : '처음'} · 전체 ${n}단계` : '단계 없음';   // 0 = 페이지를 연 첫 화면(넘기기 전)
      const cap = $('#cap'); $('#de-stcap').textContent = n && cap ? cap.textContent.trim() : '';
      const el = E().sel[0]; $('#de-stnow').textContent = el ? (S.label(el) ? `지금: ${el.hasAttribute('data-only') ? `${S.label(el)} 단계에만` : `${el.dataset.at}단계부터`}` : '지금: 항상') : '';
    },
    // 번호 딱지 — 단계가 붙은 요소마다(안 보이는 단계 것은 흐린 색)
    draw() {
      let ov = $('#de-sov'); const D = E();
      if (!D?.on) { if (ov) ov.innerHTML = ''; return; }
      if (!ov) { ov = document.createElement('div'); ov.id = 'de-sov'; D.stage().appendChild(ov); }
      ov.style.setProperty('--inv', String(1 / D.k())); ov.innerHTML = '';
      if (!S.badges) return;
      D.cur().querySelectorAll('[data-at], [data-only]').forEach((el) => {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;   // SVG 안 조각은 너무 많고 작다 — 바깥 상자만
        const r = D.rectOf(el); if (!r.w && !r.h) return;
        const i = document.createElement('i'); i.textContent = S.label(el); if (!el.classList.contains('shown')) i.className = 'off';
        Object.assign(i.style, { left: `${Math.max(0, r.x)}px`, top: `${Math.max(0, r.y)}px` }); ov.appendChild(i);
      });
    },
    // 저장 — 단계 수를 바꿨으면 <section> 여는 꼬리표의 data-steps 를 고친다(없던 페이지엔 새로)
    openTag(open) {
      const n = S.n(); if (S.steps0 === null || n === S.steps0) return open;
      return /\sdata-steps="\d*"/.test(open) ? open.replace(/\sdata-steps="\d*"/, ` data-steps="${n}"`) : open.replace(/>$/, ` data-steps="${n}">`);
    },
  };
  // 편집 핵심에 끼우기 — 시작 · 그리기 · 되돌리기(단계 수도 되돌린다)
  const hook = () => {
    const D = E(); if (!D || D._steps) return false; D._steps = true;
    const start0 = D.start.bind(D); D.start = async (o) => { const r = await start0(o); S.steps0 = Number(D.cur().dataset.steps || 0); S.inject(); S.sync(); S.draw(); return r; };
    const draw0 = D.draw.bind(D); D.draw = () => { draw0(); S.draw(); S.sync(); };
    const snap0 = D.snap.bind(D); D.snap = () => ({ ...snap0(), steps: D.cur().dataset.steps });
    const rest0 = D.restore.bind(D); D.restore = (h) => { if (h.steps == null) delete D.cur().dataset.steps; else D.cur().dataset.steps = h.steps; rest0(h); S.render(); };
    const quit0 = D.quit.bind(D); D.quit = (f) => { quit0(f); S.draw(); };
    return true;
  };
  if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 100); setTimeout(() => clearInterval(t), 10000); }
  window.DeckSteps = S;
})();
