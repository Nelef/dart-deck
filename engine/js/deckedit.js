// 덱 직접 고치기(✎ 편집) — PPT 처럼: 고르기(여러 개 · 안쪽으로 파고들기) · 끌어 옮기기(맞춤선 붙기) · 모서리 8개로 크기 · 돌리기 ·
// 글 고치기(글꼴 · 크기 · 굵게 · 색 …는 리본 js/deckedit-ribbon.js) · 넣기(글상자 · 도형 · 선 · 그림) · 복제 · 지우기 · 앞뒤 순서 ·
// 맞춤 · 간격 같게 · 숫자로 X Y W H · 되돌리기/다시 · 저장(백업 · 되돌리기). 사용자 지정(2026-09-29): "ppt 처럼 넓게, 글씨체부터 전부,
// **AI 가 수정한 것도 편집할 수 있어야**, Windows 든 Mac 이든 똑같이".
//
// AI 가 고친 것 편집하기 — 굳히기: 이 덱의 장은 스크립트(INIT['장 이름'])가 숫자로 그린다. AI 수정도 대개 그 스크립트를 고친다.
//   스크립트가 그린 요소는 파일 마크업에 없으니 그대로는 못 고친다 → **굳히기**: 지금 화면 모습 그대로를 마크업으로 저장하고
//   그 장의 스크립트는 비운다(숫자 자동 갱신은 끊긴다 — 원래 스크립트는 .deck-edits 백업에 남는다). 굳힌 뒤엔 모든 요소가 편집된다.
//   스크립트가 없는 장은 처음부터 굳힌 것과 같다. 스크립트가 있는 장은 파일에 그대로 적힌 요소만 바로 고치고, 그린 요소를 건드리면 굳힐지 묻는다.
// Windows = Mac: 글꼴은 전부 웹 글꼴(Google Fonts)만 쓴다(운영체제 글꼴로 넘어가지 않게). 단축키는 Ctrl 과 ⌘ 를 둘 다 받는다. 포인터 이벤트라 마우스 · 터치 같다.
// 저장은 serve.py /api/edit(지금 장 마크업 통째 · 스크립트 · 글꼴 줄) — localhost · Tailscale 에서만, 백업 후 저장, 커밋은 사람이.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const MAC = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const EMPTY_INIT = /^INIT\['[^']*'\] = \(\) => \{\s*(\/\*[\s\S]*?\*\/)?\s*\};$/;   // 굳혀서 비운 스크립트
  const CSS = `
  body.dedit { --fit-top: 104px; }
  /* 왼쪽 아래 — [✎ 편집 중] · [저장] · [끝내기](사용자 지정 2026-09-30: 편집 버튼은 왼쪽 아래 그대로, 저장 · 끝내기도 거기, 위 리본에서는 뺌) */
  /* 장 목록(220px) 바닥 줄 — 목록 폭 안에 세 버튼. 목록이 없는 좁은 화면에서는 떠 있는 알약으로 */
  #de-dock { position: fixed; left: 0; bottom: 0; width: var(--de-sw, 232px); z-index: 81; display: none; gap: 6px; align-items: center; padding: 12px 14px 14px;
    background: linear-gradient(to top, #f4f5f7 72%, rgba(244,245,247,0)); border-right: 1px solid #e3e6ea; }
  body.dedit #de-dock { display: flex; }
  #de-ai { position: fixed; right: 14px; bottom: 14px; z-index: 81; display: none; height: 38px; padding: 0 16px; border-radius: 99px; border: 0; background: #16181d; color: #fff;
    font: 800 13px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  body.dedit #de-ai { display: block; } body.dedit.kside #de-ai { display: none; }
  /* 편집 중 AI 패널은 리본 아래에서 — 리본(z 80)이 패널 머리를 가리지 않게 */
  body.dedit #kpanel { top: calc(var(--fit-top, 104px) - 4px); }
  #de-dock button { flex: 1 1 auto; height: 36px; padding: 0 8px; border-radius: 10px; border: 1px solid #e3e6ea; background: #fff; color: #2b3038; font: 800 12.5px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; cursor: pointer; white-space: nowrap; }
  #de-dock button:hover { background: #eef1f7; } #de-dock button:active { transform: scale(.98); }
  #de-dock .ed { color: #134E4A; flex: none; } #de-dock .sv { background: #134E4A; border-color: #134E4A; color: #fff; } #de-dock .sv:hover { background: #274aa8; }
  #de-dock .sv:disabled { background: #c9d3ee; border-color: #c9d3ee; cursor: default; }
  @media (max-width: 640px), (max-height: 500px) {
    #de-dock { width: auto; background: none; border: 0; left: 10px; bottom: calc(10px + env(safe-area-inset-bottom)); padding: 0; }
    #de-dock button { flex: none; border-radius: 99px; box-shadow: 0 4px 14px rgba(0,0,0,.3); padding: 0 12px; }
  }
  /* 편집 중엔 아래 조작줄을 내린다(사용자 지정 2026-09-30) — 장 옮기기는 왼쪽 장 목록, 끝내기는 리본 */
  body.dedit #bar { transform: translateY(calc(100% + 60px)); pointer-events: none; transition: transform .2s ease; } body.dedit #view { bottom: 0; }   /* 위에 띄운 [편집] · [AI] 까지 함께 내린다 */
  body.dedit #stage { touch-action: none; }
  body.dedit [contenteditable="true"] { outline: 2px solid #134E4A !important; cursor: text !important; background: rgba(232,238,253,.55); }
  #de-ov { position: absolute; inset: 0; pointer-events: none; z-index: 55; }
  #de-ov .box { position: absolute; border: 1.5px solid #0F766E; }
  #de-ov .box.gen { border-style: dashed; border-color: #b45309; }
  #de-ov .hov { position: absolute; border: 1px dashed rgba(65,106,240,.7); }
  #de-ov .h { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; background: #fff; border: 2px solid #0F766E; border-radius: 3px; pointer-events: auto; }
  #de-ov .h.rot { border-radius: 99px; background: #0F766E; }
  #de-ov .g { position: absolute; background: #DC2626; }
  #de-ov .kid { position: absolute; border: 1px dashed rgba(65,106,240,.6); background: rgba(65,106,240,.04); }
  #de-ov .tag { position: absolute; transform: translateY(-100%); margin-top: -4px; background: #134E4A; color: #fff; font: 700 13px 'Noto Sans KR', sans-serif; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
  #de-cm { position: fixed; z-index: 96; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(20,24,40,.22); padding: 6px; min-width: 200px; display: none; font: 600 13.5px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; }
  #de-cm.on { display: block; } #de-cm button { display: flex; justify-content: space-between; gap: 16px; width: 100%; border: 0; background: none; text-align: left; padding: 7px 10px; border-radius: 7px; font: inherit; color: #16181d; cursor: pointer; }
  @media (hover: hover) { #de-cm button:hover { background: #E8EEFD; } } #de-cm button:active { background: #E8EEFD; } #de-cm button:disabled { opacity: .35; cursor: default; background: none; } #de-cm hr { border: 0; border-top: 1px solid #eef0f3; margin: 4px 0; } #de-cm small { color: #7a828e; font-weight: 500; }
  #de-toast { position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%); z-index: 90; background: #16181d; color: #fff; font: 700 15px 'Noto Sans KR', sans-serif; padding: 10px 18px; border-radius: 12px; display: none; max-width: 90vw; }
  /* 폰(2026-09-29 "모바일 UI 도") — 길게 누르면 메뉴라 글자 고르기 · 복사 말풍선이 끼어들지 않게. 고치는 중인 글은 그대로 고른다 */
  body.dedit #stage { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  body.dedit #stage [contenteditable="true"] { -webkit-user-select: text; user-select: text; }
  /* 손가락으로 잡을 자리 — 손잡이는 14px 로 보이되 잡히는 칸은 사방 12px 더(무대 배율을 --inv 로 되돌려 화면 기준).
     화면에서 72px 보다 작은 요소는 넓히지 않는다 — 넓힌 칸이 요소 가운데를 덮어 옮기기 · 길게 누르기가 손잡이로 잡혔다(시험에서 확인) */
  @media (pointer: coarse) { #de-ov.hitwide .h::before { content: ''; position: absolute; inset: calc(-12px * var(--inv, 1)); } }
  /* 좁은 화면 — 편집 중엔 아래 조작줄(편집 중엔 어차피 흐리게 막힘)을 빼 무대를 그만큼 키운다. 끝내기는 리본에 있다 */
  @media (max-width: 640px), (max-height: 500px) {
    body.dedit #bar { display: none; } body.dedit #view { bottom: 0; }
    body.dedit #de-toast { bottom: calc(64px + env(safe-area-inset-bottom)); font-size: 13.5px; }   /* 왼쪽 아래 [편집 중 · 저장 · 끝내기] 위로 */
    #de-cm { font-size: 15px; min-width: 230px; max-height: calc(100dvh - 16px); overflow-y: auto; } #de-cm button { padding: 11px 12px; } #de-cm small { display: none; }
  }
  `;
  const E = {
    on: false, frozen: false, sel: [], hist: [], hi: -1, clip: null, snap: true,
    src: '', sha: '', slide: '', secSrc: '', iniSrc: '', tpl: null, dirty: 0, guides: [],
    MAC, cur: () => E.cfg.current(), stage: () => $('#stage'), k: () => $('#stage').getBoundingClientRect().width / 1600,
    toast(t, ms = 2800) { const x = $('#de-toast'); x.textContent = t; x.style.display = 'block'; clearTimeout(E.tt); E.tt = setTimeout(() => { x.style.display = 'none'; }, ms); },
    // 손가락으로 쓰는 중인가 — 안내 글을 '우클릭 · Shift' 대신 '길게 누르기'로 (마지막 누른 방식, 없으면 기기 종류)
    touch: () => (E.ptype ? E.ptype === 'touch' : matchMedia('(pointer: coarse)').matches),
    mod: (e) => e.ctrlKey || e.metaKey,   // Windows = Ctrl, Mac = ⌘ — 둘 다 받는다
    keyName: (k) => `${MAC ? '⌘' : 'Ctrl+'}${k}`,

    init(cfg) {
      if (window.DECK_VIEW) return;   // 읽기 모드(공유 주소) — 편집 없음
      E.cfg = cfg;
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      const ov = document.createElement('div'); ov.id = 'de-ov'; E.stage().appendChild(ov);
      const t = document.createElement('div'); t.id = 'de-toast'; document.body.appendChild(t);
      const b = document.createElement('button'); b.id = 'de-btn'; b.className = 'nb'; b.style.width = 'auto'; b.style.padding = '0 14px'; b.style.fontSize = '13px'; b.style.fontWeight = '800';
      b.textContent = '✎ 편집'; b.title = '지금 페이지를 직접 고치기 (E)'; b.onclick = () => (E.on ? E.quit() : E.start());
      const nb = $('#bar'); nb.insertBefore(b, nb.querySelector('#fs'));
      // 키 — 편집 중엔 덱 넘기기(방향키 · 스페이스)를 막고 단축키를 받는다
      addEventListener('keydown', (e) => E.key(e), true);
      E.stage().addEventListener('pointerdown', (e) => E.down(e), true);
      E.stage().addEventListener('pointermove', (e) => E.hover(e));
      E.stage().addEventListener('dblclick', (e) => E.dbl(e), true);
      E.stage().addEventListener('contextmenu', (e) => E.menu(e), true);
      const cm = document.createElement('div'); cm.id = 'de-cm'; document.body.appendChild(cm);
      // 편집 중 AI — 조작줄(그 안의 [AI])이 내려가 있으니 오른쪽 아래에 따로 띄운다. 패널이 열리면 숨긴다(패널 입력칸을 가리지 않게)
      const ai = document.createElement('button'); ai.id = 'de-ai'; ai.textContent = '✦ AI'; ai.title = 'AI 에게 묻기 · 고치기 부탁';
      ai.onclick = () => window.DeckKit?.open('ai'); document.body.appendChild(ai);
      const dock = document.createElement('div'); dock.id = 'de-dock';
      // [저장] · [✎ 편집 끝내기] 두 개 — '편집 중'과 '끝내기'가 같은 일을 해 겹쳤다(사용자 지적 2026-09-30)
      dock.innerHTML = `<button class="sv" title="파일에 저장 (${E.keyName('S')})">저장</button><button class="qt" title="편집 끝내기 (Esc)">✎ 편집 끝내기</button>`;
      dock.querySelector('.sv').onclick = () => E.save(); dock.querySelector('.qt').onclick = () => E.quit();
      document.body.appendChild(dock);
      document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#de-cm')) cm.classList.remove('on'); }, true);
      // 덱 엔진은 무대를 누르면 다음 장으로 넘긴다 — 편집 중엔 여기서 멈춘다
      E.stage().addEventListener('click', (e) => { if (E.on) e.stopPropagation(); }, true);
      addEventListener('resize', () => E.draw());
      addEventListener('beforeunload', (e) => { if (E.on && E.dirty) { e.preventDefault(); e.returnValue = ''; } });
      // 왼쪽 장 목록(썸네일 · 장 더하기) — 덱 HTML 을 고치지 않게 여기서 불러온다. 장을 더한 뒤 새로고침이면 편집을 이어 연다
      if (!window.DeckSlides) { const sc = document.createElement('script'); sc.src = 'js/deckedit-slides.js'; document.head.appendChild(sc); }
      // 한 페이지 안의 단계(나타나는 순서) — 리본 [단계] 탭(js/deckedit-steps.js, 2026-09-30 "한 장에 여러 단계인 것도 편집에")
      if (!window.DeckSteps) { const sc = document.createElement('script'); sc.src = 'js/deckedit-steps.js'; document.head.appendChild(sc); }
      try { if (sessionStorage.getItem('deckedit.resume')) { sessionStorage.removeItem('deckedit.resume'); addEventListener('deckready', () => setTimeout(() => E.start(), 300), { once: true }); } } catch (e) { /* 저장소 없음 */ }
      try { const j = sessionStorage.getItem(`deckedit.saved:${location.pathname}`); if (j) { sessionStorage.removeItem(`deckedit.saved:${location.pathname}`); setTimeout(() => window.DeckRibbon?.savedBanner(JSON.parse(j)), 300); } } catch (e) { /* 저장소 없음 */ }
    },

    // ── 시작 · 끝 ─────────────────────────────────────────────────────────────
    // keep — 편집을 켠 채 다른 페이지로(페이지 목록). 리본 · 목록 · 조작줄을 닫았다 여는 일 없이 이 페이지의 원본만 새로 읽는다
    async start(o = {}) {
      const s = E.cur(); E.slide = s.dataset.name;
      try {
        E.src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
        // 암호 API 는 https · localhost 에서만 — 폰에서 http://100.x 로 열면 없다(deckcheck.js 의 순수 JS 구현으로)
        E.sha = window.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(E.src)))].map((x) => x.toString(16).padStart(2, '0')).join('') : window.DeckCheck.sha256js(E.src);
      } catch (e) { E.toast(`원본을 못 읽었습니다: ${e.message}`); return; }
      const q = E.slide.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      E.secSrc = (E.src.match(new RegExp(`<section[^>]*data-name="${q}"[\\s\\S]*?</section>`)) || [''])[0];
      // 한 줄짜리(굳혀 비운) INIT 먼저 — '줄바꿈 뒤 };'까지 자르면 다음 장 INIT 까지 삼킨다(2026-09-30)
      E.iniSrc = (src0 => (src0.match(new RegExp(`^INIT\\['${q}'\\] = [^\\n]*\\};[ \\t]*$`, 'm')) || src0.match(new RegExp(`INIT\\['${q}'\\] = [\\s\\S]*?\\n};`)) || [''])[0])(E.src);
      if (!E.secSrc) { E.toast('이 페이지의 원본을 찾지 못했습니다'); return; }
      E.tpl = document.createElement('template'); E.tpl.innerHTML = E.secSrc;
      // 스크립트가 없거나 이미 비운(굳힌) 장은 화면 = 파일 — 처음부터 굳힌 것과 같다
      // 스크립트가 그리는 장인지 — INIT['장 이름'] = … 글자만 보면 놓친다: 간지처럼 목록을 돌며 INIT[p.k] 로 만든 스크립트는 그 글자가 없다
      // (실측 2026-09-30: 「1 결과」 간지를 스크립트 없는 장으로 봐 굳히지 않고 저장 → 새로고침하면 스크립트가 덮어써 "편집이 다 사라짐").
      // 그래서 **지금 화면과 파일 마크업의 글이 다르면** 스크립트가 그린 장으로 본다(엔진이 붙이는 등장인물 띠 .cast 는 빼고 비교)
      const txt = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.cast').forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
      const drawn = (E.iniSrc && !EMPTY_INIT.test(E.iniSrc.trim())) || txt(E.tpl.content.firstElementChild) !== txt(s);
      E.frozen = /^<section[^>]*\sdata-frozen=/.test(E.secSrc) || !drawn; E.frozen0 = E.frozen;
      // 그리는 스크립트를 글자로 못 찾은 장 — 스크립트가 어디까지 덮어쓰는지 모르니 모든 요소를 '스크립트가 그린 것'으로 친다(고치려면 굳히기)
      E.opaque = !E.frozen && !(E.iniSrc && !EMPTY_INIT.test(E.iniSrc.trim()));
      E.on = true; E.dirty = 0; E.sel = []; E.hist = []; E.hi = -1; document.body.classList.add('dedit');
      if (o.keep) { E.push(); window.DeckRibbon?.sync(); window.DeckSlides?.mark(); E.draw(); return; }
      window.DeckRibbon?.open(); window.DeckSlides?.open(); window.DeckFit?.(); E.push();
      E.toast(E.frozen ? (E.touch() ? `누르면 고르고 · 또 누르면 안쪽 · 두 번 누르면 글 고치기 · 길게 누르면 메뉴${innerWidth < innerHeight ? ' · 가로로 돌리면 크게' : ''}` : '누르면 고르고 · 또 누르면 안쪽 · 두 번 누르면 글 고치기 · Shift = 여럿') : '주황 점선 = 스크립트가 그린 부분 — 고치면 이 페이지를 지금 화면 그대로 고정합니다', 4200);
      E.draw();
    },
    // 편집을 켠 채 다른 페이지로 — 예전엔 끝내기 → 옮기기 → 다시 켜기라 리본 · 목록 · 조작줄이 사라졌다 나타나며 깜빡였다(사용자 신고 2026-09-30)
    async switchTo(k) {
      E.cur().querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
      E.sel = []; E.hov = null; E.editing = null; E.draw();
      E.cfg.deck().show(k); await E.start({ keep: true });
    },
    quit(force) {
      if (E.dirty && !force && !confirm(`저장하지 않은 편집 ${E.dirty}곳이 있습니다. 버리고 끝낼까요?`)) return;
      const dirty = E.dirty; E.on = false; E.sel = []; document.body.classList.remove('dedit');
      E.cur().querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
      window.DeckRibbon?.close(); window.DeckSlides?.close(); E.draw(); window.DeckFit?.();
      if (dirty) location.reload();   // 버린 편집은 새로고침으로 원래대로
    },

    // ── 원본과 짝짓기 · 굳히기 ───────────────────────────────────────────────
    pathOf(el) { const s = E.cur(); const p = []; for (let x = el; x && x !== s; x = x.parentElement) p.unshift([...x.parentElement.children].indexOf(x)); return p; },
    byPath(p) { let x = E.cur(); for (const k of p) { x = x?.children[k]; } return x && x !== E.cur() ? x : null; },
    srcOf(el) {
      let x = E.tpl.content.firstElementChild; if (!x) return null;
      for (const k of E.pathOf(el)) { x = x.children[k]; if (!x) return null; }
      return x.tagName === el.tagName ? x : null;
    },
    // 스크립트가 그린 요소인가 — 굳히지 않은 장에서 원본 마크업에 같은 자리가 없거나, 있어도 글이 다르면(스크립트가 채운 칸)
    gen(el) {
      if (E.frozen) return false; if (E.opaque) return true; const s = E.srcOf(el); if (!s) return true;
      const n = (h) => String(h).replace(/\s+/g, ' ').trim();
      return n(s.textContent) !== n(el.textContent);
    },
    // 스크립트가 그린 요소를 사람이 고치면 묻지 않고 그 장을 '지금 화면 그대로 고정'한다(사용자 지정 2026-09-30: "굳힌다고 자꾸 말하는데 어차피 상관없지 않아? · 굳힌다는 한국에서 안 쓰는 표현").
    // 고정하지 않으면 다음에 열 때 스크립트가 다시 그려 편집이 덮인다. 한계: 고정된 장은 데이터가 바뀌어도 다시 그려지지 않는다(스크립트는 파일에 남는다)
    need(els) { if (E.frozen || !els.some((x) => E.gen(x))) return true; E.freeze(); return true; },
    freeze() { if (E.frozen) return; E.frozen = true; E.dirty++; E.push(); E.toast('이 페이지를 지금 화면 그대로 고정했습니다 — 스크립트가 그린 것까지 고칠 수 있어요(저장해야 파일에 남음)', 3600); window.DeckRibbon?.sync(); E.draw(); },
    needFreeze() { if (!E.frozen) E.freeze(); return true; },

    // ── 되돌리기 · 다시 — 장의 화면(과 굳히지 않았으면 원본 틀)을 통째로 찍어 둔다 ──
    snap() { return { live: E.cur().innerHTML, tpl: E.tpl.innerHTML, frozen: E.frozen, dirty: E.dirty }; },
    push() { E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(E.snap()); if (E.hist.length > 80) E.hist.shift(); E.hi = E.hist.length - 1; },
    changed() { E.dirty++; E.push(); window.DeckRibbon?.sync(); E.draw(); window.DeckSlides?.touch?.(); },
    dockSync() { const b = document.querySelector('#de-dock .sv'); if (b) { b.textContent = E.dirty ? `저장 · ${E.dirty}` : '저장'; b.disabled = !E.dirty; } },
    restore(h) { const ids = E.sel.map((x) => E.pathOf(x)); E.cur().innerHTML = h.live; E.tpl.innerHTML = h.tpl; E.frozen = h.frozen; E.dirty = h.dirty; E.sel = ids.map((p) => E.byPath(p)).filter(Boolean); window.DeckRibbon?.sync(); E.draw(); },
    undo() { if (E.hi <= 0) { E.toast('더 되돌릴 것이 없습니다'); return; } E.hi--; E.restore(E.hist[E.hi]); },
    redo() { if (E.hi >= E.hist.length - 1) return; E.hi++; E.restore(E.hist[E.hi]); },
    // 화면에서 바꾼 것을 원본 틀의 같은 자리에 옮겨 적는다(굳히지 않은 장만 — 굳힌 장은 화면이 곧 파일)
    mirror(el, { html = false } = {}) {
      if (E.frozen) return; const s = E.srcOf(el); if (!s) return;
      const st = el.getAttribute('style'); if (st) s.setAttribute('style', st); else s.removeAttribute('style');
      // 나타나는 단계(data-at · data-only)도 원본 틀에 — 단계 탭에서 바꾼다
      for (const a of ['data-at', 'data-only']) { const v = el.getAttribute(a); if (v != null) s.setAttribute(a, v); else s.removeAttribute(a); }
      if (html) s.innerHTML = E.clean(el.innerHTML);
    },

    // ── 좌표 ──────────────────────────────────────────────────────────────────
    rectOf(el) { const S = E.stage().getBoundingClientRect(); const k = E.k(); const r = el.getBoundingClientRect(); return { x: (r.left - S.left) / k, y: (r.top - S.top) / k, w: r.width / k, h: r.height / k }; },
    // 옮기기 — 절대 위치면 left/top(right/bottom 이 적혀 있으면 함께), 흐름 속 요소는 translate 속성으로(배치를 깨지 않는다)
    moveBy(el, dx, dy) {
      const cs = getComputedStyle(el); const st = el.style;
      if (cs.position === 'absolute' || cs.position === 'fixed') {
        if (st.left || !st.right) st.left = `${Math.round(parseFloat(cs.left) + dx)}px`;
        if (st.right) st.right = `${Math.round(parseFloat(cs.right) - dx)}px`;
        if (st.top || !st.bottom) st.top = `${Math.round(parseFloat(cs.top) + dy)}px`;
        if (st.bottom) st.bottom = `${Math.round(parseFloat(cs.bottom) - dy)}px`;
      } else {
        const [tx, ty] = (st.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
        st.translate = `${Math.round(tx + dx)}px ${Math.round(ty + dy)}px`;
      }
    },
    // 크기 — 절대 위치는 left/top/width/height 로 풀어 적고(right/bottom 은 지움) 모서리 방향대로 늘린다
    resizeBy(el, h, dx, dy) {
      const cs = getComputedStyle(el); const st = el.style;
      if (cs.position === 'absolute') { st.left = cs.left; st.top = cs.top; st.right = ''; st.bottom = ''; }
      let w = parseFloat(cs.width); let hh = parseFloat(cs.height);
      if (h.includes('e')) w += dx; if (h.includes('s')) hh += dy;
      if (h.includes('w')) { w -= dx; E.moveBy(el, dx, 0); } if (h.includes('n')) { hh -= dy; E.moveBy(el, 0, dy); }
      if (h !== 's' && h !== 'n') st.width = `${Math.max(8, Math.round(w))}px`; if (h !== 'e' && h !== 'w') st.height = `${Math.max(8, Math.round(hh))}px`;
      if (el.tagName.toLowerCase() === 'svg') { el.setAttribute('width', Math.round(w)); el.setAttribute('height', Math.round(hh)); }
    },

    // ── 고르기 ────────────────────────────────────────────────────────────────
    // 누르면: 장 바로 아래 덩어리. 이미 고른 덩어리 안을 또 누르면 그 안쪽(PPT 묶음처럼). Shift = 여럿. Alt(⌥) = 한 번에 가장 안쪽
    pickAt(t, deep) {
      const s = E.cur(); if (!s.contains(t) || t === s) return null;
      const svgUp = (x) => (x && x.closest('svg') && x.tagName.toLowerCase() !== 'svg' && !/^(text|tspan)$/i.test(x.tagName) ? x.closest('svg') : x);
      if (deep) return svgUp(t);
      const chain = []; for (let x = t; x && x !== s; x = x.parentElement) chain.unshift(x);
      const cur = E.sel[0]; const i = cur ? chain.indexOf(cur) : -1;
      return svgUp(i >= 0 && i < chain.length - 1 ? chain[i + 1] : chain[0]);
    },
    select(list) { E.sel = list.filter(Boolean); window.DeckRibbon?.sync(); E.draw(); },
    // 안쪽 요소 — 보이는 자식만(크기 0 · 숨김 제외). svg 안은 통째로 한 덩어리
    kids(el) { if (!el || el.tagName.toLowerCase() === 'svg') return []; return [...el.children].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(c).visibility !== 'hidden'; }); },
    // 우클릭 메뉴 — 그룹 풀기(안쪽 고르기) · 바깥 고르기 · 글 고치기 · 복제 · 지우기 · 순서 · 굳히기(사용자 제안 2026-09-29)
    menu(e) {
      if (!E.on || !E.cur().contains(e.target)) return; e.preventDefault(); e.stopPropagation();
      if (!e.touch && $('#de-cm').classList.contains('on') && Date.now() - (E.cmAt || 0) < 800) return;   // 길게 누르기로 막 연 메뉴에 안드로이드 contextmenu 가 겹쳐 온 것
      if (E.editing) E.editDone?.();
      if (e.target !== E.cur() && !E.sel.some((x) => x === e.target || x.contains(e.target))) E.select([E.pickAt(e.target, e.altKey)]);
      const one = E.sel.length === 1 ? E.sel[0] : null; const kids = one ? E.kids(one) : []; const par = one && one.parentElement !== E.cur() ? one.parentElement : null;
      const hasText = one && [...one.querySelectorAll('*'), one].some((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      const K = E.keyName; const it = (id, label, key, ok = true) => `<button data-m="${id}" ${ok ? '' : 'disabled'}><span>${label}</span><small>${key || ''}</small></button>`;
      const cm = $('#de-cm');
      cm.innerHTML = it('in', `안쪽 요소 고르기 (그룹 풀기)${kids.length ? ` · ${kids.length}개` : ''}`, '다시 누르기', kids.length > 0) + it('out', '바깥 묶음 고르기', '', !!par)
        + it('text', '글 고치기', '두 번 누르기', !!hasText) + '<hr>'
        + it('dup', '복제', K('D'), E.sel.length > 0) + it('copy', '복사', K('C'), E.sel.length > 0) + it('paste', '붙여넣기', K('V'), !!E.clip) + it('del', '지우기', 'Delete', E.sel.length > 0) + '<hr>'
        + it('front', '맨 앞으로', '', E.sel.length > 0) + it('back', '맨 뒤로', '', E.sel.length > 0) + '';
      cm.classList.add('on'); const cw = cm.offsetWidth; const ch = cm.offsetHeight; E.cmAt = Date.now();
      if (e.touch) {   // 길게 누르기 — 손가락이 메뉴를 가리지 않게 누른 곳 아래(자리가 없으면 위)에, 가로는 가운데로
        const y = e.clientY + 28 + ch < innerHeight - 8 ? e.clientY + 28 : e.clientY - 28 - ch;
        cm.style.left = `${Math.max(8, Math.min(innerWidth - cw - 8, e.clientX - cw / 2))}px`; cm.style.top = `${Math.max(8, Math.min(innerHeight - ch - 8, y))}px`;
      } else { cm.style.left = `${Math.max(8, Math.min(innerWidth - cw - 8, e.clientX))}px`; cm.style.top = `${Math.max(8, Math.min(innerHeight - ch - 8, e.clientY))}px`; }
      cm.onclick = (ev) => { const b = ev.target.closest('button[data-m]'); if (!b || b.disabled || Date.now() - E.cmAt < 350) return; cm.classList.remove('on');
        ({ in: () => E.select(kids), out: () => E.select([par]), text: () => E.dbl({ target: one.querySelector('*') && ![...one.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? [...one.querySelectorAll('*')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) : one }),
          dup: () => E.dup(), copy: () => E.copy(), paste: () => E.paste(), del: () => E.del(), front: () => E.order('front'), back: () => E.order('back'),
          freeze: () => { E.freeze(); } })[b.dataset.m]?.(); };
    },
    hover(e) { if (!E.on || E.dragging) return; const t = e.target; E.hov = E.cur().contains(t) && t !== E.cur() ? E.pickAt(t, e.altKey) : null; E.drawHover(); },

    down(e) {
      E.ptype = e.pointerType; if (window.DeckSlides) window.DeckSlides.focus = false;   // 무대를 누르면 단축키는 다시 요소 단위
      if (!E.on || e.button > 0 || e.target.closest('#de-ov .h') || e.target.isContentEditable) return;
      if (E.editing && !E.editing.contains(e.target)) E.editDone?.();
      if (!E.cur().contains(e.target) || e.target === E.cur()) { if (!e.target.closest('#de-ov')) E.select([]); return; }
      e.preventDefault(); e.stopPropagation();
      // 폰은 dblclick 이 잘 안 온다 — 같은 곳을 0.35초 안에 두 번 탭하고 안 움직였으면 글 고치기
      let dbl = false; if (e.pointerType === 'touch') { const now = Date.now(); dbl = !!(E.tap && now - E.tap.t < 350 && E.tap.el === e.target); E.tap = dbl ? null : { t: now, el: e.target }; }
      const el = E.pickAt(e.target, e.altKey); if (!el) return;
      if (e.shiftKey) { E.select(E.sel.includes(el) ? E.sel.filter((x) => x !== el) : [...E.sel, el]); return; }
      if (!E.sel.includes(el)) E.select([el]);
      const k = E.k(); const x0 = e.clientX; const y0 = e.clientY; let moved = false; let ok = null; let lx = 0; let ly = 0;
      // 길게 누르기(0.5초 · 손가락이 거의 안 움직임) = 우클릭 메뉴 — 폰에는 우클릭이 없다(아이폰은 contextmenu 도 안 온다)
      let lp = null; let lpDone = false;
      if (e.pointerType === 'touch') lp = setTimeout(() => { lpDone = true; E.tap = null; E.menu({ target: e.target, clientX: x0, clientY: y0, touch: true, altKey: false, preventDefault() {}, stopPropagation() {} }); }, 500);
      const mv = (ev) => {
        if (lpDone) return;
        if (lp && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { clearTimeout(lp); lp = null; }
        let dx = (ev.clientX - x0) / k; let dy = (ev.clientY - y0) / k;
        if (!moved && Math.abs(dx) + Math.abs(dy) < (e.pointerType === 'touch' ? 6 / k : 3)) return;
        if (!moved) { ok = E.need(E.sel, '옮기기'); moved = true; } if (!ok) return;
        if (E.snap && !ev.altKey && E.sel.length === 1) { const s2 = E.snapTo(E.sel[0], dx - lx, dy - ly); dx = lx + s2.dx; dy = ly + s2.dy; }
        E.sel.forEach((x) => E.moveBy(x, dx - lx, dy - ly)); lx = dx; ly = dy; E.dragging = true; E.draw();
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); clearTimeout(lp); E.dragging = false; E.guides = [];
        if (lpDone) { E.cmAt = Date.now(); return; }   // 손가락을 뗄 때 따라오는 click 이 메뉴 항목을 누르지 않게(0.35초 막음)
        if (moved && ok) { E.sel.forEach((x) => E.mirror(x)); E.changed(); } else if (dbl) E.dbl(e); else E.draw(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    },
    // 맞춤선 — 무대 가장자리 · 가운데 · 여백(72) · 다른 덩어리의 가장자리/가운데에 6px 안이면 붙인다(Alt 로 끔)
    snapTo(el, dx, dy) {
      const r = E.rectOf(el); const nx = [r.x + dx, r.x + dx + r.w / 2, r.x + dx + r.w]; const ny = [r.y + dy, r.y + dy + r.h / 2, r.y + dy + r.h];
      const X = [0, 72, 800, 1528, 1600]; const Y = [0, 450, 900];
      [...E.cur().children].forEach((c) => { if (c === el || c.contains(el) || !c.getBoundingClientRect().width) return; const q = E.rectOf(c); X.push(q.x, q.x + q.w / 2, q.x + q.w); Y.push(q.y, q.y + q.h / 2, q.y + q.h); });
      const best = (vals, pts) => { let m = null; for (const v of vals) for (const p of pts) { const d = p - v; if (Math.abs(d) < 6 && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, p }; } return m; };
      const bx = best(nx, X); const by = best(ny, Y); E.guides = [bx && { x: bx.p }, by && { y: by.p }].filter(Boolean);
      return { dx: dx + (bx ? bx.d : 0), dy: dy + (by ? by.d : 0) };
    },
    gripDown(e, h) {
      e.preventDefault(); e.stopPropagation(); const el = E.sel[0]; if (!el || !E.need([el], '크기 바꾸기')) return;
      const k = E.k(); let lx = e.clientX; let ly = e.clientY; let moved = false;
      if (h === 'rot') {
        const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        const mv = (ev) => { moved = true; let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; if (!ev.shiftKey) a = Math.round(a / 15) * 15; el.style.rotate = `${Math.round(a)}deg`; E.draw(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { E.mirror(el); E.changed(); } };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
      }
      const mv = (ev) => { moved = true; E.resizeBy(el, h, (ev.clientX - lx) / k, (ev.clientY - ly) / k); lx = ev.clientX; ly = ev.clientY; E.draw(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { E.mirror(el); E.changed(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    },

    // ── 글 고치기 — 두 번 누르면 그 자리에서. 리본의 글자 도구는 고치는 중이면 고른 글자에, 아니면 고른 요소 전체에 ──
    dbl(e) {
      if (!E.on || !E.cur().contains(e.target)) return;
      e.preventDefault?.(); e.stopPropagation?.();
      let el = e.target; while (el && el !== E.cur() && !(el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) el = el.parentElement;
      if (!el || el === E.cur()) { E.toast('글이 있는 곳을 두 번 누르세요'); return; }
      if (el.closest('svg')) { E.editSvgText(el); return; }
      if (!E.need([el], '글 고치기')) return;
      E.select([el]); el.contentEditable = 'true'; el.focus(); E.editing = el; window.DeckRibbon?.tab?.('text');
      const before = el.innerHTML;
      const done = () => { if (E.editing !== el) return; el.removeEventListener('blur', onBlur); el.removeAttribute('contenteditable'); E.editing = null; E.editDone = null; if (el.innerHTML !== before) { E.mirror(el, { html: true }); E.changed(); } else E.draw(); };
      // 리본(글꼴 · 크기 고르기)으로 초점이 가도 글 고치기는 이어 간다 — 고른 글자 범위에 거는 도구라서. 무대의 다른 곳을 누르거나 Esc 로 끝낸다
      const onBlur = (ev) => { if (ev.relatedTarget?.closest?.('#de-rb')) return; setTimeout(() => { if (!document.activeElement?.closest?.('#de-rb')) done(); }, 0); };
      el.addEventListener('blur', onBlur); E.editDone = done;
    },
    // 그림(svg) 안의 글은 contentEditable 이 안 된다 — 작은 입력 창으로
    editSvgText(el) {
      if (!E.need([el], '글 고치기')) return;
      const v = prompt('글 고치기', el.textContent); if (v == null || v === el.textContent) return; el.textContent = v; E.mirror(el, { html: true }); E.changed();
    },

    // ── 넣기 · 복제 · 지우기 · 순서 · 맞춤 · 간격 · 숫자 ───────────────────────
    insert(kind, extra = {}) {
      if (!E.needFreeze('새 요소를 넣으')) return;
      const d = document.createElement(kind === 'image' ? 'img' : 'div'); const st = d.style;
      st.position = 'absolute'; st.left = '600px'; st.top = '340px';
      if (kind === 'text') { st.width = '400px'; st.fontSize = 'var(--fs-body)'; st.color = 'var(--ink)'; st.lineHeight = '1.4'; d.textContent = '글을 입력하세요'; }
      else if (kind === 'rect' || kind === 'round' || kind === 'circle') {
        // 테두리는 개별 속성으로만(축약형과 섞으면 상태 스타일에서 색이 사라진다 — 레포 CLAUDE.md 규칙)
        st.width = kind === 'circle' ? '200px' : '320px'; st.height = kind === 'circle' ? '200px' : '180px';
        st.backgroundColor = 'var(--c-brand-tint)'; st.borderWidth = '2px'; st.borderStyle = 'solid'; st.borderColor = 'var(--c-brand)';
        st.borderRadius = kind === 'round' ? '20px' : kind === 'circle' ? '50%' : '0px';
        st.display = 'flex'; st.alignItems = 'center'; st.justifyContent = 'center'; st.fontSize = 'var(--fs-box)'; st.color = 'var(--ink)'; st.textAlign = 'center';
      } else if (kind === 'line' || kind === 'arrow') {
        // 선 · 화살표 — 가로로 긴 틀 안의 svg(틀 폭에 맞춰 늘어난다), 방향은 돌리기로
        st.width = '320px'; st.height = '24px';
        d.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none" style="display:block;overflow:visible"><line x1="0" y1="12" x2="${kind === 'arrow' ? 90 : 100}" y2="12" stroke="#0F766E" stroke-width="3" vector-effect="non-scaling-stroke"/>${kind === 'arrow' ? '<polygon points="100,12 88,4 88,20" fill="#0F766E"/>' : ''}</svg>`;
      } else if (kind === 'image') { d.src = extra.src; d.alt = extra.alt || ''; st.width = '480px'; st.left = '560px'; st.top = '260px'; }
      E.cur().appendChild(d); E.select([d]); E.changed();
      if (kind === 'text') setTimeout(() => E.dbl({ target: d }), 30);
    },
    dup() {
      if (!E.sel.length || !E.needFreeze('복제하')) return;
      const out = E.sel.map((el) => { const c = el.cloneNode(true); el.after(c); E.moveBy(c, 24, 24); return c; });
      E.select(out); E.changed();
    },
    del() {
      if (!E.sel.length || !E.need(E.sel, '지우기')) return;
      E.sel.forEach((el) => { if (!E.frozen) E.srcOf(el)?.remove(); el.remove(); }); E.select([]); E.changed();
    },
    copy() { if (E.sel.length) { E.clip = E.sel.map((x) => x.outerHTML); E.toast(`${E.sel.length}개 복사 — ${E.keyName('V')} 로 붙여넣기`); } },
    paste() {
      if (!E.clip || !E.needFreeze('붙여넣으')) return;
      const t = document.createElement('template'); t.innerHTML = E.clip.join(''); const els = [...t.content.children];
      els.forEach((x) => { E.cur().appendChild(x); E.moveBy(x, 24, 24); }); E.select(els); E.changed();
    },
    order(dir) {   // 앞으로 · 뒤로 · 맨 앞 · 맨 뒤 — z-index 로(위치 속성이 없으면 relative 를 준다)
      if (!E.sel.length || !E.need(E.sel, '순서 바꾸기')) return;
      const zs = [...E.cur().querySelectorAll('*')].map((x) => parseInt(getComputedStyle(x).zIndex, 10)).filter(Number.isFinite);
      const hi = Math.max(0, ...zs); const lo = Math.min(0, ...zs);
      E.sel.forEach((el) => { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; const z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
        el.style.zIndex = String(dir === 'front' ? hi + 1 : dir === 'back' ? lo - 1 : dir === 'up' ? z + 1 : z - 1); E.mirror(el); });
      E.changed();
    },
    align(how) {   // 하나면 무대 기준(좌우는 여백 72), 여럿이면 고른 것들 기준
      if (!E.sel.length || !E.need(E.sel, '맞추기')) return;
      const R = E.sel.map((x) => E.rectOf(x));
      const box = E.sel.length > 1 ? { x: Math.min(...R.map((r) => r.x)), y: Math.min(...R.map((r) => r.y)), r: Math.max(...R.map((r) => r.x + r.w)), b: Math.max(...R.map((r) => r.y + r.h)) } : { x: 72, y: 0, r: 1528, b: 900 };
      E.sel.forEach((el, i) => { const r = R[i]; let dx = 0; let dy = 0;
        if (how === 'left') dx = box.x - r.x; if (how === 'right') dx = box.r - (r.x + r.w); if (how === 'center') dx = (box.x + box.r) / 2 - (r.x + r.w / 2);
        if (how === 'top') dy = box.y - r.y; if (how === 'bottom') dy = box.b - (r.y + r.h); if (how === 'middle') dy = (box.y + box.b) / 2 - (r.y + r.h / 2);
        E.moveBy(el, dx, dy); E.mirror(el); });
      E.changed();
    },
    distribute(axis) {   // 셋 이상 — 첫 것과 끝 것 사이를 같은 간격으로
      if (E.sel.length < 3) { E.toast('셋 이상 고르세요(Shift+누르기)'); return; } if (!E.need(E.sel, '간격 맞추기')) return;
      const items = E.sel.map((el) => ({ el, r: E.rectOf(el) })).sort((a, b) => (axis === 'x' ? a.r.x - b.r.x : a.r.y - b.r.y));
      const sz = (r) => (axis === 'x' ? r.w : r.h); const pos = (r) => (axis === 'x' ? r.x : r.y);
      const total = pos(items.at(-1).r) + sz(items.at(-1).r) - pos(items[0].r); const gap = (total - items.reduce((a, it) => a + sz(it.r), 0)) / (items.length - 1);
      let p = pos(items[0].r) + sz(items[0].r) + gap;
      items.slice(1, -1).forEach((it) => { const d = p - pos(it.r); E.moveBy(it.el, axis === 'x' ? d : 0, axis === 'y' ? d : 0); E.mirror(it.el); p += sz(it.r) + gap; });
      E.changed();
    },
    setRect(el, key, v) {   // 숫자 칸(X Y W H 회전)
      v = Number(v); if (!Number.isFinite(v) || !E.need([el], '고치기')) return; const r = E.rectOf(el);
      if (key === 'x') E.moveBy(el, v - r.x, 0); if (key === 'y') E.moveBy(el, 0, v - r.y);
      if (key === 'w') E.resizeBy(el, 'e', v - r.w, 0); if (key === 'h') E.resizeBy(el, 's', 0, v - r.h);
      if (key === 'rot') el.style.rotate = `${v}deg`;
      E.mirror(el); E.changed();
    },
    // 스타일 하나 걸기 — 리본이 부른다. 여러 개 고른 경우 모두에. 빈 값이면 지운다
    style(prop, val, { silent = false } = {}) {
      if (!E.sel.length) { E.toast('먼저 요소를 고르세요'); return false; } if (!E.need(E.sel, '꾸미기')) return false;
      E.sel.forEach((el) => { if (val === '' || val == null) el.style.removeProperty(prop); else el.style.setProperty(prop, val); E.mirror(el); });
      if (!silent) E.changed(); return true;
    },

    // ── 키 ────────────────────────────────────────────────────────────────────
    key(e) {
      if (E.on && window.DeckSlides?.key(e)) return;   // 장 목록을 누른 뒤의 Ctrl+D · C · V 는 장 단위(js/deckedit-slides.js)
      if (!E.on) { if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !/TEXTAREA|INPUT|SELECT/.test(e.target.tagName) && !e.target.isContentEditable) E.start(); return; }
      const k = (e.key || '').toLowerCase();
      if (e.target.closest?.('#de-rb, #kpanel') && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.stopImmediatePropagation(); return; }   // 리본 입력 칸 · AI 패널은 그대로
      if (e.target.isContentEditable) {
        if (e.key === 'Escape') { e.target.blur(); e.stopImmediatePropagation(); return; }
        if (E.mod(e) && k === 's') { e.preventDefault(); e.target.blur(); E.save(); }
        e.stopImmediatePropagation(); return;   // 글 고치는 중 — 방향키 · 지우기는 글에, Ctrl/⌘+B·I·U 는 브라우저 기본
      }
      e.stopImmediatePropagation();
      if (E.mod(e)) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); E.undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); E.redo(); }
        else if (k === 's') { e.preventDefault(); E.save(); } else if (k === 'd') { e.preventDefault(); E.dup(); }
        else if (k === 'c') { E.copy(); } else if (k === 'v') { e.preventDefault(); E.paste(); } else if (k === 'a') { e.preventDefault(); E.select([...E.cur().children].filter((x) => x.getBoundingClientRect().width)); }
        return;
      }
      if (e.key === 'Escape') { if ($('#de-cm')?.classList.contains('on')) { $('#de-cm').classList.remove('on'); return; } if (E.sel.length) E.select([]); else E.quit(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); E.del(); return; }
      if (e.key === 'Enter' && E.sel.length === 1) { e.preventDefault(); E.dbl({ target: E.sel[0] }); return; }
      const d = e.shiftKey ? 10 : 1; const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (mv && E.sel.length) { e.preventDefault(); if (!E.need(E.sel, '옮기기')) return; E.sel.forEach((x) => { E.moveBy(x, mv[0], mv[1]); E.mirror(x); }); E.changed(); return; }
      if (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'PageDown' || e.key === 'PageUp') e.preventDefault();
    },

    // ── 그리기(선택 상자 · 손잡이 · 맞춤선) ───────────────────────────────────
    drawHover() {
      const ov = $('#de-ov'); if (!ov) return; ov.querySelectorAll('.hov').forEach((x) => x.remove());
      if (!E.on || !E.hov || E.sel.includes(E.hov)) return; const r = E.rectOf(E.hov);
      const d = document.createElement('div'); d.className = 'hov'; Object.assign(d.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); ov.appendChild(d);
    },
    draw() {
      const ov = $('#de-ov'); if (!ov) return; ov.innerHTML = ''; if (!E.on) return;
      const px = (v) => `${v}px`; ov.style.setProperty('--inv', String(1 / E.k()));
      E.sel = E.sel.filter((x) => E.cur().contains(x));
      E.sel.forEach((el) => { const r = E.rectOf(el); const b = document.createElement('div'); b.className = `box${E.gen(el) ? ' gen' : ''}`; Object.assign(b.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) }); ov.appendChild(b); });
      // 고르자마자 안쪽 요소를 점선으로 — 마우스를 움직여야만 안쪽이 보이던 불편(사용자 지적 2026-09-29)
      if (E.sel.length === 1 && !E.dragging) {
        const kids = E.kids(E.sel[0]); const r0 = E.rectOf(E.sel[0]);
        kids.forEach((c) => { const q = E.rectOf(c); const d = document.createElement('div'); d.className = 'kid'; Object.assign(d.style, { left: px(q.x), top: px(q.y), width: px(q.w), height: px(q.h) }); ov.appendChild(d); });
        const tag = document.createElement('div'); tag.className = 'tag';
        tag.textContent = `${E.gen(E.sel[0]) ? '스크립트가 그림 · ' : ''}${kids.length ? `안쪽 ${kids.length}개 — 다시 누르면 안으로 · ${E.touch() ? '길게 누르면' : '우클릭 ='} 그룹 풀기` : `${E.touch() ? '길게 누르면 메뉴' : '우클릭 = 메뉴'} · 두 번 누르면 글 고치기`}`;
        // 딱지 · 손잡이는 무대 배율과 상관없이 화면에서 늘 같은 크기로(좁은 창에서 글씨가 작아지고 손잡이를 못 잡았다)
        // 딱지는 상자 **아래**에(위 가운데는 돌리기 손잡이 자리) — 아래 자리가 없으면 위로
        const inv = 1 / E.k(); const below = r0.y + r0.h + 32 * inv < 900;
        Object.assign(tag.style, { left: px(Math.max(0, Math.min(1600 - 440 * inv, r0.x))), top: px(below ? r0.y + r0.h + 6 * inv : Math.max(26 * inv, r0.y)), transform: below ? 'none' : 'translateY(-100%)', fontSize: px(13 * inv), padding: `${2 * inv}px ${8 * inv}px`, borderRadius: px(6 * inv), marginTop: below ? '0' : px(-4 * inv) }); ov.appendChild(tag);
      }
      if (E.sel.length === 1) {
        const r = E.rectOf(E.sel[0]);
        const inv = 1 / E.k(); const hs = 14 * inv;   // 손잡이도 화면에서 14px 로
        ov.classList.toggle('hitwide', Math.min(r.w, r.h) * E.k() >= 72);
        const pts = { nw: [r.x, r.y], n: [r.x + r.w / 2, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, r.y + r.h / 2], se: [r.x + r.w, r.y + r.h], s: [r.x + r.w / 2, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, r.y + r.h / 2], rot: [r.x + r.w / 2, Math.max(8 * inv, r.y - 30 * inv)] };
        const cur = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab' };
        for (const [h, [x, y]] of Object.entries(pts)) { const d = document.createElement('div'); d.className = `h${h === 'rot' ? ' rot' : ''}`; d.title = h === 'rot' ? '돌리기(15°씩 · Shift = 자유)' : '크기'; Object.assign(d.style, { left: px(x), top: px(y), cursor: cur[h], width: px(hs), height: px(hs), margin: `${-hs / 2}px 0 0 ${-hs / 2}px`, borderWidth: px(2 * inv) }); d.onpointerdown = (e) => E.gripDown(e, h); ov.appendChild(d); }
      }
      E.guides.forEach((g) => { const d = document.createElement('div'); d.className = 'g'; Object.assign(d.style, g.x != null ? { left: px(g.x), top: 0, width: '1px', height: '900px' } : { top: px(g.y), left: 0, height: '1px', width: '1600px' }); ov.appendChild(d); });
      // 넘침 · 겹침 수 — 저장 전 점검과 같은 규칙(js/deckcheck.js)
      const dk = E.cfg.deck?.(); if (!E.dragging && window.DeckCheck && dk) window.DeckRibbon?.problems(window.DeckCheck.slideProblems(document, dk).length);
      E.drawHover();
    },

    // ── 저장 ─────────────────────────────────────────────────────────────────
    // shown — 덱 엔진이 단계마다 붙였다 뗐다 하는 표시(지금 단계에 보이는 것). 파일에 굳으면 저장한 순간의 단계가 박힌다
    clean(h) { return String(h).replace(/\s*\b(de-sel|de-over|ksel|kdim|shown)\b/g, '').replace(/ class="\s*"/g, '').replace(/ contenteditable="[^"]*"/g, ''); },
    async save() {
      if (!E.dirty) { E.toast('바꾼 곳이 없습니다'); return; }
      document.activeElement?.blur?.();
      let open = E.secSrc.match(/^<section[^>]*>/)[0];
      // 이번에 굳혔으면 장에 data-frozen 표시 — deck.js 가 그 장의 그리기 스크립트를 건너뛴다. 스크립트는 파일에 그대로 둔다
      // (예전엔 INIT 을 비웠다 — 목록으로 만든 스크립트(간지)는 비울 글자가 없어 굳힘이 안 먹었다. 표시를 지우면 다시 스크립트가 그린다)
      const froze = E.frozen && !E.frozen0;
      if (froze) open = open.replace(/>$/, ` data-frozen="${new Date().toLocaleDateString('sv')}">`);
      if (window.DeckSteps?.openTag) open = window.DeckSteps.openTag(open);   // 단계 수를 바꿨으면 data-steps
      const inner = E.frozen ? E.clean(E.cur().innerHTML) : E.clean(E.tpl.content.firstElementChild.innerHTML);
      const edits = [{ kind: 'slide', find: E.secSrc, replace: `${open}${inner}</section>` }];
      // 새 글꼴을 썼으면 서버가 fonts/ 에 받아 두고 덱이 그 CSS 를 읽게 한다 — 다른 컴퓨터(Windows · Mac)에서도 같은 글꼴로, Google 을 기다리지 않고
      E.toast('저장 중…', 20000); const fe = await window.DeckRibbon?.fontEdit?.(E.src, inner); if (fe) edits.push(fe);
      try {
        const r = await fetch('/api/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, sha: E.sha, slide: E.slide, edits }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        try { sessionStorage.setItem(`deckedit.saved:${location.pathname}`, JSON.stringify({ slide: E.slide, n: E.dirty, backup: j.backup, froze })); } catch (e) { /* 저장소 없음 */ }
        E.dirty = 0; E.on = false; location.reload();
      } catch (e) { E.toast(`저장 못 함: ${e.message}`, 6000); }
    },
  };
  window.DeckEdit = E;
})();
