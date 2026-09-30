// 덱 엔진 — deck 의 발표 덱이 함께 쓰는 뼈대(2026-09-28 사용자 지정: "각 덱마다 따로 만들지 말고 엔진을 재사용").
// 맡는 것: 16:9 무대 맞춤 · 장/단계(data-steps · data-at · data-only) · 강조 줄(.focusrow) · 목차·조작줄 · 말풍선(data-tip)
//          · 상세보기 서랍(data-more) · 등장인물 띠(data-cast) · 자동 재생(장 안에서 / 덱 전체+아래 자막) · 주소(#n) 동기화.
// 덱이 맡는 것: 장 마크업, 장마다 그림 함수(inits/hooks), 자막 문구, 재료 불러오기(load). 옆 패널·AI(deckkit)·확대(deckzoom)는 따로 꽂는다.
//
// 쓰는 법(덱의 <script> 에서, 장 마크업 뒤):
//   const deck = Deck.create({
//     load: async () => { D = await (await fetch('data/v2flow.json')).json(); },  // 재료 — 끝나야 그림 함수가 돈다
//     inits: INIT, hooks: HOOK,       // { '장 이름': fn } — init(장) 은 재료가 온 뒤 한 번, hook(단계, 장) 은 단계가 바뀔 때마다
//     onReady: () => initKit(...),    // 재료·init 뒤, 첫 장을 보이기 직전(옆 패널 연결 등)
//     captions: CAP,                  // 선택: { '장 이름': [단계별 자막] } — 주면 아래 자막 + 덱 전체 자동 재생(#pl, Space)
//   });
//   deck.cur · deck.step · deck.slides · deck.show(i, 단계) · deck.stepsOf(장) · deck.next() · deck.prev()
//
// 왜 옵션을 이렇게 좁게 두나: 네 덱을 옮기며 다른 점을 셌더니 무대 여백·자동 재생 방식·Space 키 셋뿐이었다.
// 나머지는 하나로 맞췄다 — 한 곳을 고치면 모든 덱이 같이 고쳐지게(잔상 제거·패널 폭을 덱마다 따로 고치던 일이 이유).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  Object.assign(window, { $, $$, esc });

  // 등장인물 띠에 쓰는 이름 — 덱 전체에서 같은 색·같은 뜻
  const CAST = [['vl', 'VL'], ['pps', 'PPS'], ['aio', ''], ['llm', 'LLM'], ['code', '코드']];

  const create = (o = {}) => {
    const opt = {
      sel: '.slide', inits: {}, hooks: {}, load: null, onReady: null, captions: null,
      // 무대 맞춤 여백 — 옆 패널이 열리면 여백을 줄여 무대를 조금이라도 크게(패널 폭 지적 2026-09-28)
      fit: { w: 1640, h: 920, sideW: 1612 },
      // 무대 빈 곳을 누르면 다음 — 이 요소들 위에서는 넘기지 않는다(누르는 부품들)
      clickIgnore: 'button, a, details, #drawer, #kpop, [data-tip], .card, .docbox, .code, svg, [data-ksel]',
      stepMs: 1800,                                  // 장 안 자동 재생 간격
      durOf: (txt) => Math.max(3200, Math.min(7500, 1400 + String(txt).replace(/<[^>]+>/g, '').length * 80)), // 자막 한 줄을 읽는 시간
      ...o,
    };
    const slides = $$(opt.sel);
    const deckPlay = !!opt.captions;                 // 자막이 있으면 덱 전체를 자막 길이에 맞춰 넘긴다
    let cur = 0; let step = 0; let timer = null; let ready = false; let playing = false;
    const stepsOf = (s) => Number(s.dataset.steps || 0);
    const hook = (s) => opt.hooks[s.dataset.name];

    // ── 무대 맞춤 ──
    // 옆 패널이 열리면 무대가 패널 폭만큼 **왼쪽으로 가며 작아진다** — 창(#view)은 그대로 두고 무대 한 장만 움직인다.
    // 예전엔 #view 의 오른쪽을 패널 폭만큼 깎고 0.32초 뒤 resize 로 다시 맞춰, 패널이 다 들어온 뒤 무대가 툭 줄고
    // 가운데 자리가 한 번에 튀었다("어색하게 축소", 2026-09-28 지적). 이동·축소를 한 transform 으로 두고 패널과 같은
    // 0.3초·같은 곡선으로 움직이면 둘이 한 몸처럼 밀려난다. 패널 폭을 손으로 끄는 동안(kgrab)에는 곡선 없이 바로 따른다.
    // 폰 세로 화면에서는 패널이 오른쪽이 아니라 **아래에서** 올라온다(deckkit 의 좁은 화면 CSS) — 폭이 창 전체면 아래 패널로 본다
    const panelBox = () => { if (!document.body.classList.contains('kside')) return { w: 0, h: 0 }; const r = $('#kpanel')?.getBoundingClientRect(); if (!r) return { w: 0, h: 0 }; return r.width >= innerWidth - 2 ? { w: 0, h: r.height } : { w: r.width, h: 0 }; };
    const panelW = () => panelBox().w;
    // AI PPT — 왼쪽 위 로고 = 발표 자료 목록 · 탭 아이콘(사용자 지정 2026-09-30). 덱 HTML 을 고치지 않게 엔진이 붙인다(모양은 css/deck.css 끝)
    if (!document.querySelector('#ppt-home')) { const a = document.createElement('a'); a.id = 'ppt-home'; a.href = '/'; a.title = '발표 자료 목록'; a.innerHTML = '<img src="/web/ai-ppt.svg" alt="AI PPT">'; document.body.appendChild(a); }
    // 확대 · 축소(휠 · 핀치 · + − 0 · 끌어 이동)는 엔진 기본 — 덱 HTML 에 없어도 붙인다(사용자 지정 2026-09-30). 덱이 뒤에서 직접 불러오면 js/deckzoom.js 가 알아서 한 번만 붙는다
    if (!window.DeckZoom) setTimeout(() => { if (!window.DeckZoom && !document.querySelector('script[src$="deckzoom.js"]')) { const z = document.createElement('script'); z.src = 'js/deckzoom.js'; document.body.appendChild(z); } }, 0);
    // PDF 로 받기(사용자 지정 2026-10-01) — 서버가 페이지마다 화면 그대로 찍어 묶는다(engine/tools/deck_pdf.cjs · /pdf/<계정>/<덱>.pdf). 바뀌지 않았으면 바로 받는다
    { const m = location.pathname.match(/^\/d\/([^/]+)\/([^/]+)\//); const bar = $('#bar');
      if (m && bar && !$('#pdfb')) { const bt = document.createElement('button'); bt.className = 'nb'; bt.id = 'pdfb'; bt.textContent = 'PDF'; bt.title = 'PDF 로 받기 — 보이는 화면 그대로, 페이지마다 한 쪽';
        bt.style.width = 'auto'; bt.style.padding = '0 12px'; bt.style.fontWeight = '800';
        bt.onclick = async () => { if (bt.disabled) return; bt.disabled = true; const t0 = Date.now(); const tick = setInterval(() => { bt.textContent = `PDF 만드는 중 ${Math.round((Date.now() - t0) / 1000)}초`; }, 500);
          try { const r = await fetch(`/pdf/${m[1]}/${m[2]}.pdf`, { cache: 'no-store' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${document.title || 'deck'}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
            bt.textContent = 'PDF ✓'; setTimeout(() => { bt.textContent = 'PDF'; }, 2500); }
          catch (e) { bt.textContent = 'PDF'; alert(`PDF 를 만들지 못했습니다 — ${e.message}`); }
          finally { clearInterval(tick); bt.disabled = false; } };
        bar.insertBefore(bt, bar.querySelector('#fs')); } }
    if (!document.querySelector('link[rel~="icon"]')) { const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = '/web/favicon.svg'; document.head.appendChild(l); }
    // --fit-top: 위쪽에 비워 둘 높이 — ✎ 편집의 리본(도구 막대)이 무대를 가리지 않게(deckedit 가 편집 중에만 준다, 기본 0 이라 다른 덱은 그대로)
    const fit = () => {
      const v = $('#view'); const { w: pw0, h: ph } = panelBox(); const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--fit-top')) || 0;
      // --fit-left: 왼쪽에 비워 둘 폭 — ✎ 편집의 장 목록(썸네일)이 무대를 가리지 않게(deckedit-slides 가 편집 중에만 준다)
      const left = parseFloat(getComputedStyle(document.body).getPropertyValue('--fit-left')) || 0; const pw = pw0 + left;
      const bot = ph ? Math.max(0, ph - (innerHeight - v.getBoundingClientRect().bottom)) : 0;   // 아래 패널이 #view 를 덮는 높이(조작줄 몫은 빼고)
      // 전체화면(body.dfs)은 여백 없이 1600×900 그대로 맞춘다 — 16:9 화면이면 꽉 찬다
      const fs = document.body.classList.contains('dfs');
      const k = Math.min((v.clientWidth - pw) / (pw0 ? opt.fit.sideW : fs ? 1600 : opt.fit.w),   // 왼쪽 페이지 목록만 있으면 평소 여백(오른쪽 끝에 붙어 보였다)
        (v.clientHeight - top - bot) / (fs ? 900 : opt.fit.h));
      $('#stage').style.transform = `translate(${(left - pw0) / 2}px, ${(top - bot) / 2}px) scale(${k})`;
    };
    addEventListener('resize', fit);

    // ── 말풍선 — data-tip 위에서 무대 좌표로(확대 중에도 맞게 실제 화면 폭으로 나눈다) ──
    const tip = $('#tip');
    if (tip) {
      document.addEventListener('mousemove', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (!t) { tip.classList.remove('on'); return; }
        const r = $('#stage').getBoundingClientRect();
        tip.textContent = t.dataset.tip; tip.classList.add('on');
        const zk = r.width / 1600; let x = (e.clientX - r.left) / zk + 16; let y = (e.clientY - r.top) / zk + 14;
        if (x > 1160) x -= 460;
        if (y > 820) y -= 90;
        tip.style.left = `${x}px`; tip.style.top = `${y}px`;
      });
    }

    // ── 진행 막대(자막 모드) — 장마다 한 칸, 지금 장은 단계만큼 찬다 ──
    const prog = $('#prog');
    if (prog) prog.innerHTML = slides.map(() => '<i><b></b></i>').join('');
    const drawProg = (ms) => {
      if (!prog) return;
      $$('#prog i b').forEach((b, k) => {
        b.style.transition = 'none';
        const n = stepsOf(slides[cur]) + 1;
        b.style.width = `${(k < cur ? 1 : k > cur ? 0 : step / n) * 100}%`;
        if (k === cur && ms) requestAnimationFrame(() => { b.style.transition = `width ${ms}ms linear`; b.style.width = `${((step + 1) / n) * 100}%`; });
      });
    };

    const closeDrawer = () => $('#drawer')?.classList.remove('open');
    const stop = () => {
      clearInterval(timer); clearTimeout(timer); timer = null;
      $$('[data-play]').forEach((b) => { b.textContent = '▶'; });
      if (playing) { playing = false; const pl = $('#pl'); if (pl) pl.textContent = '▶ 재생'; }
    };

    // ── 한 단계 그리기 ──
    const render = () => {
      const s = slides[cur]; const n = stepsOf(s);
      // 단계가 없는 장은 처음부터 전부 보인다
      $$('[data-at]', s).forEach((el) => el.classList.toggle('shown', Number(el.dataset.at) <= step || n === 0));
      $$('[data-only]', s).forEach((el) => el.classList.toggle('shown', el.dataset.only.split(',').map(Number).includes(step)));
      $$('[data-play]', s).forEach((b) => { b.style.display = n ? '' : 'none'; });
      // 강조 줄 — 누른 요소가 있으면 그것, 없으면 가장 최근에 들어온 요소를 넓게
      $$('.focusrow', s).forEach((row) => {
        const shown = $$(':scope > .fitem.shown', row);
        const pick = shown.find((el) => el.dataset.at === row.dataset.fcur) || shown[shown.length - 1];
        $$(':scope > .fitem', row).forEach((el) => el.classList.toggle('cur', el === pick));
      });
      $$('.steps', s).forEach((box) => { box.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join(''); });
      const cnt = $('#cnt'); if (cnt) cnt.textContent = deckPlay ? `${cur + 1} / ${slides.length} · ${s.dataset.name}` : `${cur + 1} / ${slides.length}`;
      history.replaceState(null, '', `#${cur + 1}`);
      // 자막 — 박자마다 한 줄, 살짝 사라졌다 나타난다
      let ms = 0;
      if (deckPlay) {
        const cap = $('#cap'); const txt = (opt.captions[s.dataset.name] || [])[step] || '';
        if (cap) { cap.classList.add('fade'); setTimeout(() => { cap.innerHTML = txt; cap.classList.remove('fade'); }, 140); }
        ms = opt.durOf(txt);
      }
      if (ready && hook(s)) hook(s)(step, s);
      if (deckPlay) { clearTimeout(timer); drawProg(playing ? ms : 0); if (playing) timer = setTimeout(() => next(true), ms); }
    };

    const show = (i, st = 0) => {
      cur = Math.max(0, Math.min(slides.length - 1, i)); step = st;
      if (!playing) stop();
      slides.forEach((s, k) => s.classList.toggle('on', k === cur));
      $$('#toc button').forEach((b, k) => b.classList.toggle('on', k === cur));
      const tb = $('#toc button.on'); if (tb) tb.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      closeDrawer(); render();
      if (window.DeckKit && DeckKit.cfg) { DeckKit.hidePop(); DeckKit.refresh(); }
    };
    // 다음 = 이 장의 다음 단계, 단계를 다 보면 다음 장(자동 재생이 부른 것이면 재생을 잇는다)
    const next = (auto = false) => {
      if (!auto && playing) { clearTimeout(timer); }
      if (step < stepsOf(slides[cur])) { step += 1; $$('.focusrow', slides[cur]).forEach((r) => { delete r.dataset.fcur; }); render(); }
      else if (cur < slides.length - 1) show(cur + 1);
      else stop();
    };
    const prev = () => { if (step > 0) { step -= 1; render(); } else if (cur > 0) show(cur - 1, stepsOf(slides[cur - 1])); };

    // ── 자동 재생 ──
    // 장 안(▶ 알약): 1.8초마다 한 단계, 장 끝에서 멈춘다 / 덱 전체(#pl, Space): 자막 길이만큼 머물고 다음 장까지 넘어간다
    const playSlide = (btn) => {
      if (timer) { stop(); return; }
      if (step >= stepsOf(slides[cur])) { step = 0; render(); }
      btn.textContent = '❚❚'; timer = setInterval(() => { if (step < stepsOf(slides[cur])) { step += 1; render(); } else stop(); }, opt.stepMs);
    };
    const setPlay = (on) => { playing = on; const pl = $('#pl'); if (pl) pl.textContent = on ? '❚❚ 멈춤' : '▶ 재생'; if (!on) clearTimeout(timer); render(); };

    // ── 목차 · 등장인물 띠 ──
    slides.forEach((s, i) => {
      const toc = $('#toc');
      if (toc) { const b = document.createElement('button'); b.textContent = s.dataset.name; b.onclick = () => show(i); toc.appendChild(b); }
      if (s.dataset.cast !== undefined) {
        const on = new Set(s.dataset.cast.split(/\s+/).filter(Boolean));
        const c = document.createElement('div'); c.className = 'cast';
        c.innerHTML = CAST.map(([k, n]) => `<span class="${k}${on.has(k) ? ' on' : ''}">${n}</span>`).join('');
        s.appendChild(c);
      }
    });

    // ── 조작 ──
    if ($('#nx')) $('#nx').onclick = () => next();
    if ($('#pv')) $('#pv').onclick = prev;
    if ($('#pl')) $('#pl').onclick = () => setPlay(!playing);
    if ($('#dx')) $('#dx').onclick = closeDrawer;
    if ($('#fs')) $('#fs').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
    if ($('#fs') && !document.documentElement.requestFullscreen) $('#fs').style.display = 'none';
    // 전체화면 — 조작줄은 무대 위에 겹쳐 숨기고, 마우스가 화면 아래 80px 안에 오면 보인다(1.5초 머물면 다시 숨김). 발표 중 가리지 않게
    let barT = 0;
    const barShow = (on) => { clearTimeout(barT); document.body.classList.toggle('dbar', on); };
    document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; document.body.classList.toggle('dfs', on); barShow(false); fit(); });
    document.addEventListener('mousemove', (e) => {
      if (!document.body.classList.contains('dfs')) return;
      if (e.clientY > innerHeight - 80 || e.target.closest?.('#bar')) barShow(true);
      else if (document.body.classList.contains('dbar')) { clearTimeout(barT); barT = setTimeout(() => barShow(false), 1500); }
    });   // 아이폰 Safari 는 전체화면이 없다 — 눌러도 아무 일 없는 버튼을 두지 않는다

    // ── 장 목록 — 「2 / 13」 을 누르면 아래에서 올라온다. 폰에서는 목차 줄이 눌려 안 보이니 이게 목차다(2026-09-29) ──
    const sheet = () => {
      let d = $('#dsheet');
      if (!d) { d = document.createElement('div'); d.id = 'dsheet'; d.innerHTML = '<div class="bg"></div><div class="sh"><div class="grab"></div><div class="hd">페이지 목록</div><div class="ls"></div></div>'; document.body.appendChild(d);
        d.querySelector('.bg').onclick = () => d.classList.remove('on');
        d.querySelector('.ls').onclick = (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; d.classList.remove('on'); show(Number(b.dataset.k)); }; }
      d.querySelector('.ls').innerHTML = slides.map((x, k) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}"><i>${k + 1}</i>${esc(x.dataset.name)}</button>`).join('');
      d.classList.add('on'); d.querySelector('button.on')?.scrollIntoView({ block: 'center' });
    };
    if ($('#cnt')) { $('#cnt').onclick = sheet; $('#cnt').title = '페이지 목록'; }

    // ── 밀어 넘기기(터치) — 옆으로 50px 넘게, 세로보다 1.5배 넘게 밀면 다음/앞 장. 두 손가락 · 확대 중 · ✎ 편집 중에는 안 한다 ──
    // pointer 이벤트가 아니라 touch 이벤트인 이유: 브라우저가 스크롤로 가져가면 pointercancel 로 끊기는데 touchend 는 끝까지 온다
    let sw = null; let swAt = 0;
    const vw = $('#view');
    vw.addEventListener('touchstart', (e) => { sw = e.touches.length === 1 && !document.body.classList.contains('dedit') ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, { passive: true });
    vw.addEventListener('touchend', (e) => {
      if (!sw) return; const t = e.changedTouches[0]; const dx = t.clientX - sw[0]; const dy = t.clientY - sw[1]; sw = null;
      if ((window.visualViewport?.scale || 1) > 1.05 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swAt = Date.now(); if (dx < 0) next(); else prev();
    }, { passive: true });
    // 밀고 난 뒤 따라오는 click 은 '누르면 다음'으로 치지 않는다
    $('#stage').addEventListener('click', (e) => { if (Date.now() - swAt < 400) e.stopImmediatePropagation(); }, true);
    addEventListener('keydown', (e) => {
      if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName)) return;   // AI 입력창 등에서 치는 글자는 덱 조작이 아니다
      if (e.key === ' ' && deckPlay) { e.preventDefault(); setPlay(!playing); }
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { closeDrawer(); $('#dsheet')?.classList.remove('on'); }
      else if (e.key === 'f' || e.key === 'F') $('#fs')?.click();
    });
    $('#stage').addEventListener('click', (e) => { if (e.target.closest(opt.clickIgnore)) return; next(); });
    document.addEventListener('click', (e) => {
      const m = e.target.closest('[data-more]');
      if (m) { $('#dbody').innerHTML = $(`#${m.dataset.more}`).innerHTML; $('#drawer').classList.add('open'); $('#drawer').scrollTop = 0; return; }
      const p = e.target.closest('[data-play]'); if (p) { playSlide(p); return; }
      // 강조 줄의 이미 나온 요소를 누르면 그 요소를 다시 넓게
      const it = e.target.closest('.focusrow > .fitem.shown');
      if (it && !it.classList.contains('cur')) { it.parentElement.dataset.fcur = it.dataset.at; render(); }
    });

    // ── 시작 — 재료를 불러 장마다 한 번 그리고, 주소의 장을 연다 ──
    const api = {
      get cur() { return cur; }, get step() { return step; }, get playing() { return playing; },
      slides, show, next, prev, render, stepsOf, stop, fit,
    };
    window.DeckFit = fit; // 옆 패널(deckkit)이 열고 닫을 때 곧바로 부른다
    fit();
    Promise.resolve(opt.load ? opt.load() : null).then(async () => {
      ready = true;
      // data-frozen 장(✎ 편집으로 굳힌 장)은 그리기 스크립트를 건너뛴다 — 사람이 고친 마크업을 스크립트가 덮어쓰지 않게(2026-09-30)
      const frozen = new Set(slides.filter((s) => s.hasAttribute('data-frozen')).map((s) => s.dataset.name));
      // 없는 페이지의 INIT 도 건너뛴다 — ✎ 편집에서 페이지를 지워도 그리기 코드는 파일에 남는다(되살릴 때를 위해). 안 건너뛰면 없는 요소를 찾다 오류
      const have = new Set(slides.map((s) => s.dataset.name));
      Object.entries(opt.inits).forEach(([k, f]) => { if (frozen.has(k) || !have.has(k)) return; try { f(); } catch (e) { console.error(k, e); } });
      try { if (opt.onReady) await opt.onReady(api); } catch (e) { console.error('onReady', e); }
      const h = Number(location.hash.slice(1)); show(Number.isFinite(h) && h > 0 ? h - 1 : 0);
      dispatchEvent(new Event('deckready'));   // 덱 HTML 맨 앞의 불러오기 표시(#ldr)가 이걸 듣고 사라진다
    }).catch((e) => {
      dispatchEvent(new CustomEvent('deckfail', { detail: e.message }));
      $('#stage').insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;color:#dc2626">재료를 불러오지 못했습니다 — 8899 서버 주소로 여세요. ${esc(e.message)}</div>`);
    });
    return api;
  };

  window.Deck = { create };
})();
