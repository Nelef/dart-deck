// ✎ 편집 리본 — PPT 의 홈 탭처럼 위에 붙는 도구 막대(js/deckedit.js 가 편집 중에만 연다). 2026-09-29 사용자 지정 "글씨체부터 전부".
// 줄 1: 저장 · 되돌리기 · 다시 | 넣기(글상자 · 사각형 · 둥근 · 원 · 선 · 화살표 · 그림) | 복제 · 지우기 | 순서 | 굳히기 | 상태 | 끝내기
// 줄 2: 글꼴 · 크기(pt) · 굵게 · 기울임 · 밑줄 · 취소선 · 글자색 · 형광 · 정렬 · 줄 간격 · 자간 | 채우기 · 테두리(색 · 두께 · 모양) · 둥글기 · 그림자 · 투명도 · 안쪽 여백
//       | 맞춤 6 · 간격 같게 | X · Y · W · H · 회전 | 맞춤선
// 글자 도구는 글을 고치는 중이면 **고른 글자 범위**에(execCommand, 스타일은 CSS 로), 아니면 **고른 요소 전체**에 건다.
// 글꼴은 전부 Google Fonts 웹 글꼴 — Windows · Mac 이 같은 글자꼴로 그린다(운영체제 글꼴로 넘어가지 않게). 저장할 때 쓴 글꼴을 덱 머리 글꼴 줄에 더한다.
// 크기는 pt 로 보이고 px 로 적는다 — 무대 1600px = PPT 16:9 13.33in → 1pt = 1.667px(DECK.md 3 과 같은 환산).
(() => {
  const $ = (s, r = document) => r.querySelector(s); const E = () => window.DeckEdit;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PT = 1600 / (13.333 * 72);
  // 웹 글꼴 — [CSS 이름, 보이는 이름, 굵기들]. 굵기를 적어야 Google 이 그 굵기를 준다(안 적으면 400 만)
  const FONTS = [
    ['Noto Sans KR', '본고딕 (Noto Sans KR)', '400;500;700;800;900'], ['Noto Serif KR', '본명조 (Noto Serif KR)', '400;700;900'],
    ['Nanum Gothic', '나눔고딕', '400;700;800'], ['Nanum Myeongjo', '나눔명조', '400;700;800'], ['Nanum Pen Script', '나눔손글씨 펜', '400'],
    ['Gowun Dodum', '고운돋움', '400'], ['Gowun Batang', '고운바탕', '400;700'], ['IBM Plex Sans KR', 'IBM Plex Sans KR', '400;500;700'],
    ['Gothic A1', '고딕 A1', '400;700;900'], ['Hahmlet', '함렛', '400;700;900'], ['Black Han Sans', '검은고딕', '400'], ['Do Hyeon', '도현', '400'],
    ['Jua', '주아', '400'], ['Sunflower', '해바라기', '300;500;700'], ['JetBrains Mono', 'JetBrains Mono (코드)', '400;500;700'],
  ];
  const fontUrl = (fams) => `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f[0].replace(/ /g, '+')}:wght@${f[2]}`).join('&')}&display=swap`;
  // 색 — 덱이 쓰는 색 변수(DECK.md 6: 파랑 한 가족 + 회색 + 빨강)를 먼저. 새 색을 만들고 싶으면 맨 끝의 고르개
  const PAL = [['var(--c-brand)', '파랑'], ['var(--c-brand-deep)', '진한 파랑'], ['var(--c-brand-mid)', '중간 파랑'], ['var(--c-brand-tint)', '연한 파랑'],
    ['var(--ink)', '글자 검정'], ['var(--sub)', '글자 회색'], ['var(--c-text-mute)', '흐린 글자'], ['var(--c-neutral)', '회색'], ['var(--c-neutral-tint)', '연한 회색'],
    ['var(--c-alert)', '빨강'], ['var(--c-alert-tint)', '연한 빨강'], ['#ffffff', '흰색'], ['transparent', '없음']];
  const CSS = `
  #de-rb { position: fixed; left: 0; right: 0; top: 0; z-index: 80; background: #fff; border-bottom: 1px solid #e3e6ea; box-shadow: 0 4px 16px rgba(20,24,40,.08);
    font: 500 13px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; color: #16181d; display: none; }
  body.dedit #de-rb { display: block; }
  /* 좁은 창에서도 — 가로 스크롤 막대 대신 줄바꿈(사용자 지적 2026-09-29: 1280px 창에서 두 줄 다 넘쳐 스크롤 · 잘림).
     윗줄 = 늘 보이는 것(저장 · 되돌리기 · 탭 · 상태 · 끝내기), 아랫줄 = 고른 탭의 도구만(PPT 식) */
  #de-rb .row { display: flex; align-items: center; gap: 4px; padding: 4px 8px; flex-wrap: wrap; min-height: 44px; }
  #de-rb .row + .row { border-top: 1px solid #eef0f3; background: #fafbfc; }
  #de-rb .grp { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border-right: 1px solid #eef0f3; flex: none; flex-wrap: wrap; }
  #de-rb .tabs { display: inline-flex; gap: 2px; padding: 0 6px; }
  #de-rb .tabs button { font-weight: 800; color: #545b66; border-radius: 8px 8px 0 0; }
  #de-rb .tabs button.on { background: #fafbfc; color: #1E3A8A; box-shadow: inset 0 -3px 0 #416AF0; }
  #de-rb .pane { display: none; align-items: center; flex-wrap: wrap; gap: 2px; } #de-rb .pane.on { display: flex; }
  #de-rb .st { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 900px) { #de-rb button { min-width: 28px; padding: 0 6px; } #de-rb select.font { width: 130px; } #de-rb .lab { display: none; } }
  #de-rb .grp:last-child { border-right: 0; }
  /* 폰(2026-09-29 "모바일 UI 도") — 여러 줄로 접히면 세로 폰에서 리본이 화면 절반(420px)을 먹었다(실측).
     폰에선 두 줄로 고정하고 넘치는 도구는 손가락으로 옆으로 민다(폰 편집기의 흔한 방식 · 스크롤 막대는 숨김). 상태 글은 딱지 · 알림이 대신한다 */
  @media (max-width: 640px), (max-height: 500px) {
    #de-rb .row { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -webkit-overflow-scrolling: touch; min-height: 42px; padding: 3px 6px; }
    #de-rb .row::-webkit-scrollbar { display: none; }
    #de-rb .pane.on, #de-rb .grp { flex-wrap: nowrap; }
    #de-rb .grp { padding: 2px 4px; } #de-rb .tabs { padding: 0 2px; flex: none; }
    #de-rb .st { display: none; }
    #de-rb .row:first-child > .grp:last-child { margin-left: auto; }
    #de-rb button.pri { padding: 0 10px; }
  }
  @media (pointer: coarse) { #de-rb button { height: 38px; min-width: 36px; } #de-rb select, #de-rb input { height: 36px; font-size: 16px; } }   /* 16px 미만 입력칸은 아이폰이 누를 때 화면을 확대한다 */
  #de-rb .lab { font-size: 11px; color: #7a828e; margin-right: 2px; }
  #de-rb button { border: 0; background: transparent; border-radius: 8px; min-width: 32px; height: 34px; padding: 0 8px; white-space: nowrap; font: 700 13px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; color: #2b3038; cursor: pointer; }
  #de-rb button:hover { background: #f2f3f6; } #de-rb button.on { background: #E8EEFD; color: #1E3A8A; }
  #de-rb button:disabled { opacity: .35; cursor: default; }
  #de-rb button.pri { background: #1E3A8A; color: #fff; padding: 0 14px; } #de-rb button.warn { color: #b45309; }
  #de-rb select, #de-rb input { height: 32px; border: 1px solid #d5d9df; border-radius: 8px; font: 500 13px 'Noto Sans KR', sans-serif; padding: 0 6px; background: #fff; color: #16181d; }
  #de-rb input[type=number] { width: 64px; } #de-rb input.sm { width: 54px; } #de-rb select.font { width: 170px; }
  #de-rb input[type=range] { width: 80px; padding: 0; border: 0; }
  #de-rb .sw { width: 22px; height: 22px; border-radius: 6px; border: 1px solid #c3c8cf; display: inline-block; vertical-align: middle; }
  #de-rb .st { font-size: 12px; color: #545b66; padding: 0 6px; } #de-rb .st b { color: #16181d; } #de-rb .st .bad { color: #DC2626; font-weight: 800; }
  #de-pal { position: fixed; z-index: 85; background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(20,24,40,.2); padding: 10px; display: none; width: 236px; font: 500 12px 'Noto Sans KR', sans-serif; }
  #de-pal.on { display: block; } #de-pal .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  #de-pal .grid button { width: 26px; height: 26px; border-radius: 7px; border: 1px solid #c3c8cf; cursor: pointer; padding: 0; }
  #de-pal .grid button.none { background: linear-gradient(135deg, #fff 45%, #DC2626 45% 55%, #fff 55%); }
  #de-pal .more { display: flex; align-items: center; gap: 8px; margin-top: 8px; } #de-pal input[type=color] { width: 40px; height: 28px; border: 0; padding: 0; background: none; }
  #de-banner { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); z-index: 95; background: #16181d; color: #fff; border-radius: 12px; padding: 8px 10px 8px 16px; display: flex; align-items: center; gap: 10px; font: 700 14px 'Noto Sans KR', sans-serif; }
  #de-banner button { border: 0; border-radius: 99px; padding: 6px 14px; font: 800 13px 'Noto Sans KR', sans-serif; cursor: pointer; } #de-banner .ghost { background: rgba(255,255,255,.15); color: #fff; }
  `;
  const B = (act, label, title, cls = '') => `<button data-act="${act}" title="${esc(title)}" class="${cls}">${label}</button>`;
  const R = {
    built: false,
    build() {
      if (R.built) return; R.built = true;
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      // 글꼴 미리 불러오기(고르기 목록이 그 글꼴로 보이게) + 기호 글꼴(✓ ✎ ✦ 등 — Noto Sans KR 에 없어 운영체제마다 달라지던 것)
      const ln = document.createElement('link'); ln.rel = 'stylesheet'; ln.href = fontUrl(FONTS); document.head.appendChild(ln);
      const k = E().keyName;
      const rb = document.createElement('div'); rb.id = 'de-rb';
      const TAB = (id, nm) => `<button data-tab="${id}" title="${nm} 도구">${nm}</button>`;
      rb.innerHTML = `<div class="row">
        <div class="grp">${B('undo', '↶ 되돌리기', `되돌리기 (${k('Z')})`)}${B('redo', '↷ 다시 실행', `다시 실행 (${k('Shift+Z')})`)}</div>
        <div class="tabs">${TAB('text', '글자')}${TAB('shape', '도형')}${TAB('insert', '넣기')}${TAB('arrange', '배치')}</div>
        <div class="grp st" id="de-st"></div>
      </div><div class="row">
        <div class="pane" data-pane="text">
          <div class="grp"><select class="font" data-in="font" title="글꼴 — 전부 웹 글꼴(Windows · Mac 똑같이)"><option value="">글꼴</option>${FONTS.map(([f, nm]) => `<option value="${f}" style="font-family:'${f}'">${nm}</option>`).join('')}</select>
            <input type="number" class="sm" data-in="size" min="6" max="200" step="1" title="글자 크기(pt)" placeholder="pt"></div>
          <div class="grp">${B('t:bold', '<b>B</b>', `굵게 (${k('B')})`)}${B('t:italic', '<i>I</i>', `기울임 (${k('I')})`)}${B('t:underline', '<u>U</u>', `밑줄 (${k('U')})`)}${B('t:strike', '<s>S</s>', '취소선')}
            ${B('pal:color', 'A<span class="sw" data-sw="color" style="width:14px;height:5px;display:block;margin:-3px auto 0"></span>', '글자색')}${B('pal:hilite', '형광', '글자 배경(형광펜)')}</div>
          <div class="grp">${B('al:left', '⇤', '왼쪽 정렬')}${B('al:center', '≡', '가운데 정렬')}${B('al:right', '⇥', '오른쪽 정렬')}${B('al:justify', '☰', '양쪽 정렬')}</div>
          <div class="grp" style="border-right:0"><select data-in="lh" title="줄 간격"><option value="">줄 간격</option>${['1', '1.15', '1.3', '1.5', '1.8', '2'].map((v) => `<option>${v}</option>`).join('')}</select>
            <select data-in="ls" title="자간"><option value="">자간</option>${['-0.05em', '-0.02em', '0', '0.02em', '0.05em', '0.1em'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        </div>
        <div class="pane" data-pane="shape">
          <div class="grp">${B('pal:fill', '채우기<span class="sw" data-sw="fill" style="width:12px;height:12px;margin-left:4px"></span>', '채우기 색')}${B('pal:line', '선<span class="sw" data-sw="line" style="width:12px;height:12px;margin-left:4px"></span>', '테두리 색')}
            <select data-in="bw" title="테두리 두께"><option value="">두께</option>${[0, 1, 2, 3, 4, 6, 8].map((v) => `<option value="${v}">${v}px</option>`).join('')}</select>
            <select data-in="bs" title="테두리 모양"><option value="">모양</option><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option></select></div>
          <div class="grp"><span class="lab">둥글기</span><input type="number" class="sm" data-in="radius" min="0" max="400" title="모서리 둥글기(px)" placeholder="둥글기">
            <select data-in="shadow" title="그림자"><option value="">그림자</option><option value="none">없음</option><option value="0 2px 10px rgba(20,24,40,.10)">약</option><option value="0 8px 30px rgba(20,24,40,.22)">강</option></select></div>
          <div class="grp" style="border-right:0"><span class="lab">투명</span><input type="range" data-in="op" min="10" max="100" step="5" title="불투명도">
            <span class="lab">여백</span><input type="number" class="sm" data-in="pad" min="0" max="200" title="안쪽 여백(px)" placeholder="여백"></div>
        </div>
        <div class="pane" data-pane="insert">
          <div class="grp">${B('ins:text', '글상자', '글상자 넣기')}${B('ins:rect', '▭', '사각형')}${B('ins:round', '▢', '둥근 사각형')}${B('ins:circle', '○', '원')}${B('ins:line', '─', '선')}${B('ins:arrow', '→', '화살표')}${B('ins:image', '그림', '그림 파일 넣기')}</div>
          <div class="grp" style="border-right:0">${B('dup', '복제', `복제 (${k('D')})`)}${B('del', '지우기', '지우기 (Delete)')}${B('copy', '복사', `복사 (${k('C')})`)}${B('paste', '붙이기', `붙여넣기 (${k('V')})`)}</div>
        </div>
        <div class="pane" data-pane="arrange">
          <div class="grp">${B('ord:front', '맨 앞', '맨 앞으로')}${B('ord:up', '앞', '앞으로')}${B('ord:down', '뒤', '뒤로')}${B('ord:back', '맨 뒤', '맨 뒤로')}</div>
          <div class="grp">${B('a:left', '⊢', '왼쪽 맞춤(하나면 무대 여백 기준)')}${B('a:center', '⊥', '가운데 맞춤')}${B('a:right', '⊣', '오른쪽 맞춤')}${B('a:top', '⊤', '위 맞춤')}${B('a:middle', '⊶', '중간 맞춤')}${B('a:bottom', '⊥̲', '아래 맞춤')}${B('d:x', '↔', '가로 간격 같게(셋 이상)')}${B('d:y', '↕', '세로 간격 같게(셋 이상)')}</div>
          <div class="grp"><span class="lab">X</span><input type="number" class="sm" data-in="x" title="X"><span class="lab">Y</span><input type="number" class="sm" data-in="y" title="Y"><span class="lab">W</span><input type="number" class="sm" data-in="w" title="너비"><span class="lab">H</span><input type="number" class="sm" data-in="h" title="높이"><span class="lab">↻</span><input type="number" class="sm" data-in="rot" step="1" title="회전(도)"></div>
          <div class="grp" style="border-right:0">${B('snap', '맞춤선', '끌 때 가장자리 · 가운데에 붙기(Alt 로 잠시 끔)', 'on')}${B('freeze', '고정', '스크립트가 그린 부분까지 지금 모습 그대로 고정해 모두 편집(AI 가 고친 곳 포함)', 'warn')}</div>
        </div>
      </div>`;
      document.body.appendChild(rb);
      const pal = document.createElement('div'); pal.id = 'de-pal'; document.body.appendChild(pal);
      const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/gif,image/webp'; file.style.display = 'none'; file.id = 'de-file'; document.body.appendChild(file);
      file.onchange = () => R.upload(file);
      // 누르는 순간 초점을 뺏지 않는다 — 글을 고치는 중이면 고른 글자 범위가 살아 있어야 한다
      rb.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
      rb.addEventListener('click', (e) => { const t = e.target.closest('button[data-tab]'); if (t) { R.tab(t.dataset.tab); return; } const b = e.target.closest('button[data-act]'); if (b) R.act(b.dataset.act, b); });
      // 리본이 창 폭에 따라 한 줄 · 여러 줄이 된다 — 그 높이만큼 무대를 내린다(deck.js --fit-top)
      new ResizeObserver(() => { if (!document.body.classList.contains('dedit')) return; document.body.style.setProperty('--fit-top', `${rb.offsetHeight + 4}px`); window.DeckFit?.(); E().draw(); }).observe(rb);
      R.tab('text');
      rb.addEventListener('change', (e) => { const i = e.target.closest('[data-in]'); if (i) R.input(i.dataset.in, i.value, i); });
      rb.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); R.input(e.target.dataset.in, e.target.value, e.target); } });
      // 글 고치는 중 고른 범위를 기억한다 — 글꼴 · 크기 고르기(select · input)는 초점을 가져가서 범위가 풀린다
      document.addEventListener('selectionchange', () => { const ed = E().editing; const sel = getSelection(); if (ed && sel.rangeCount && ed.contains(sel.anchorNode)) R.range = sel.getRangeAt(0).cloneRange(); });
      document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#de-pal') && !e.target.closest('[data-act^="pal:"]')) pal.classList.remove('on'); }, true);
    },
    open() { R.build(); R.sync(); document.body.style.setProperty('--fit-top', `${$('#de-rb').offsetHeight + 4}px`); },
    close() { $('#de-pal')?.classList.remove('on'); document.body.style.removeProperty('--fit-top'); },
    tab(id) { const rb = $('#de-rb'); rb.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id)); rb.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('on', p.dataset.pane === id)); R.cur = id; },

    // 글을 고치는 중이고 글자 범위가 골라져 있나 — 그러면 글자 도구를 그 범위에만
    textRange() {
      const ed = E().editing; if (!ed || !R.range || R.range.collapsed || !ed.contains(R.range.commonAncestorContainer)) return null;
      ed.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(R.range); return ed;
    },
    exec(cmd, val) { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); const s = getSelection(); if (s.rangeCount) R.range = s.getRangeAt(0).cloneRange(); },
    first() { return E().sel[0]; },
    cs() { const el = R.first(); return el ? getComputedStyle(el) : null; },
    resolve(v) { const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v : v; },

    act(a, btn) {
      const D = E(); const [op, arg] = a.split(':');
      if (a === 'save') return D.save(); if (a === 'undo') return D.undo(); if (a === 'redo') return D.redo(); if (a === 'quit') return D.quit();
      if (a === 'dup') return D.dup(); if (a === 'del') return D.del(); if (a === 'copy') return D.copy(); if (a === 'paste') return D.paste();
      if (a === 'freeze') { if (D.frozen) { D.toast('이미 고정된 페이지입니다'); return; } D.freeze(); return; }
      if (a === 'snap') { D.snap = !D.snap; btn.classList.toggle('on', D.snap); return; }
      if (op === 'ins') { if (arg === 'image') { if (!D.needFreeze('그림을 넣으')) return; $('#de-file').click(); return; } return D.insert(arg); }
      if (op === 'ord') return D.order(arg);
      if (op === 'a') return D.align(arg); if (op === 'd') return D.distribute(arg);
      if (op === 'pal') return R.palette(arg, btn);
      if (op === 't') return R.textStyle(arg);
      if (op === 'al') return D.style('text-align', arg);
    },
    // 굵게 · 기울임 · 밑줄 · 취소선 — 범위가 있으면 그 글자만, 없으면 요소 전체를 켜고 끈다
    textStyle(kind) {
      const D = E(); const cmd = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' }[kind];
      if (R.textRange()) { R.exec(cmd); return; }
      const cs = R.cs(); if (!cs) { D.toast('먼저 요소를 고르세요'); return; }
      if (kind === 'bold') D.style('font-weight', parseInt(cs.fontWeight, 10) >= 600 ? '400' : '700');
      if (kind === 'italic') D.style('font-style', cs.fontStyle === 'italic' ? 'normal' : 'italic');
      if (kind === 'underline' || kind === 'strike') { const w = kind === 'underline' ? 'underline' : 'line-through'; const cur = cs.textDecorationLine.split(' ').filter((x) => x && x !== 'none');
        const next = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]; D.style('text-decoration-line', next.join(' ') || 'none'); }
    },
    input(k, v, el) {
      const D = E(); if (!D.sel.length && !['size', 'font'].includes(k)) { D.toast('먼저 요소를 고르세요'); return; }
      if (k === 'font') { if (!v) return; if (R.textRange()) R.exec('fontName', v); else D.style('font-family', `'${v}', 'Noto Sans KR', sans-serif`); el.value = ''; R.sync(); return; }
      if (k === 'size') { const px = Math.round(Number(v) * PT); if (!px) return;
        if (R.textRange()) { R.exec('fontSize', '7'); E().editing.querySelectorAll('font[size="7"], span[style*="xxx-large"]').forEach((f) => { const sp = document.createElement('span'); sp.style.fontSize = `${px}px`; sp.innerHTML = f.innerHTML; f.replaceWith(sp); }); return; }
        D.style('font-size', `${px}px`); return; }
      const map = { lh: ['line-height', v], ls: ['letter-spacing', v], bw: ['border-width', v === '' ? '' : `${v}px`], bs: ['border-style', v], radius: ['border-radius', v === '' ? '' : `${v}px`], shadow: ['box-shadow', v], op: ['opacity', String(Number(v) / 100)], pad: ['padding', v === '' ? '' : `${v}px`] };
      if (map[k]) {
        // 테두리 두께만 주면 안 보인다 — 모양이 없으면 실선을 함께(개별 속성으로만, 축약형 금지)
        if (k === 'bw' && Number(v) > 0 && R.cs()?.borderStyle === 'none') D.style('border-style', 'solid', { silent: true });
        D.style(...map[k]); return;
      }
      if (['x', 'y', 'w', 'h', 'rot'].includes(k) && D.sel.length === 1) D.setRect(D.sel[0], k, v);
    },
    // 색 고르기 — 덱 색 변수 먼저, 그다음 자유 색
    palette(which, btn) {
      const p = $('#de-pal'); const r = btn.getBoundingClientRect();
      p.innerHTML = `<div class="grid">${PAL.map(([v, nm]) => `<button data-c="${esc(v)}" title="${esc(nm)}" class="${v === 'transparent' ? 'none' : ''}" style="background:${v === 'transparent' ? '' : v}"></button>`).join('')}</div>
        <div class="more"><input type="color" value="#416af0"><span>다른 색(덱 색 변수 밖 — 되도록 위 색을)</span></div>`;
      Object.assign(p.style, { left: `${Math.min(innerWidth - 250, r.left)}px`, top: `${r.bottom + 6}px` }); p.classList.add('on');
      const pick = (v) => { p.classList.remove('on'); R.color(which, v); };
      p.querySelectorAll('[data-c]').forEach((b) => { b.onmousedown = (e) => e.preventDefault(); b.onclick = () => pick(b.dataset.c); });
      p.querySelector('input[type=color]').onchange = (e) => pick(e.target.value);
    },
    color(which, v) {
      const D = E();
      if ((which === 'color' || which === 'hilite') && R.textRange()) { R.exec(which === 'color' ? 'foreColor' : 'hiliteColor', v === 'transparent' ? 'transparent' : R.resolve(v)); return; }
      const prop = { color: 'color', hilite: 'background-color', fill: 'background-color', line: 'border-color' }[which];
      if (which === 'line' && R.cs()?.borderStyle === 'none') { D.style('border-style', 'solid', { silent: true }); if (!parseFloat(R.cs().borderTopWidth)) D.style('border-width', '2px', { silent: true }); }
      D.style(prop, v);
    },
    // 그림 넣기 — 서버(serve.py /api/asset)가 덱 폴더의 img/uploads/ 에 저장하고 상대 경로를 준다
    async upload(input) {
      const f = input.files?.[0]; input.value = ''; if (!f) return;
      if (f.size > 8e6) { E().toast('그림이 너무 큽니다(8MB 까지)'); return; }
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      try {
        const r = await fetch('/api/asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, name: f.name, data }) });
        const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || r.status);
        E().insert('image', { src: j.src, alt: f.name });
      } catch (e) { E().toast(`그림을 못 넣었습니다: ${e.message}`, 5000); }
    },

    // 리본 값을 고른 요소에 맞춘다
    sync() {
      if (!R.built) return; const D = E(); const el = R.first(); const cs = el ? getComputedStyle(el) : null; const rb = $('#de-rb');
      const set = (k, v) => { const i = rb.querySelector(`[data-in="${k}"]`); if (i && document.activeElement !== i) i.value = v ?? ''; };
      if (cs) {
        const r = D.rectOf(el); set('x', Math.round(r.x)); set('y', Math.round(r.y)); set('w', Math.round(r.w)); set('h', Math.round(r.h)); set('rot', parseFloat(el.style.rotate) || 0);
        set('size', Math.round(parseFloat(cs.fontSize) / PT)); set('radius', parseFloat(cs.borderTopLeftRadius) || 0); set('op', Math.round(Number(cs.opacity) * 100)); set('pad', parseFloat(cs.paddingTop) || 0);
        const sw = (k, c) => { const x = rb.querySelector(`[data-sw="${k}"]`); if (x) x.style.background = c; };
        sw('color', cs.color); sw('fill', cs.backgroundColor); sw('line', cs.borderTopColor);
        rb.querySelector('[data-act="t:bold"]').classList.toggle('on', parseInt(cs.fontWeight, 10) >= 600);
        rb.querySelector('[data-act="t:italic"]').classList.toggle('on', cs.fontStyle === 'italic');
        rb.querySelector('[data-act="t:underline"]').classList.toggle('on', cs.textDecorationLine.includes('underline'));
        rb.querySelector('[data-act="t:strike"]').classList.toggle('on', cs.textDecorationLine.includes('line-through'));
        ['left', 'center', 'right', 'justify'].forEach((a) => rb.querySelector(`[data-act="al:${a}"]`).classList.toggle('on', cs.textAlign === a || (a === 'left' && cs.textAlign === 'start')));
      } else ['x', 'y', 'w', 'h', 'rot', 'size', 'radius', 'pad'].forEach((k) => set(k, ''));
      rb.querySelector('[data-act="freeze"]').disabled = D.frozen;
      rb.querySelector('[data-act="freeze"]').textContent = D.frozen ? '고정됨' : '고정';
      rb.querySelector('[data-act="undo"]').disabled = D.hi <= 0; rb.querySelector('[data-act="redo"]').disabled = D.hi >= D.hist.length - 1;
      D.dockSync?.();
      R.status();
    },
    probs: 0,
    problems(n) { R.probs = n; R.status(); },
    status() {
      const D = E(); const s = $('#de-st'); if (!s) return;
      s.innerHTML = `「<b>${esc(D.slide)}</b>」 · 고른 것 <b>${D.sel.length}</b> · 바꾼 곳 <b>${D.dirty}</b>${R.probs ? ` · <span class="bad">넘침·겹침 ${R.probs}</span>` : ''}`;
    },
    // 쓴 글꼴을 덱이 읽게 하는 수정안(없으면 null) — 서버(/api/font)가 그 글꼴을 fonts/ 에 받아 두고, 덱 머리의 fonts/base.css 줄 뒤에 그 CSS 를 잇는다.
    // Google 을 거치지 않는다: 덱이 Google 글꼴 CSS 를 받을 때까지 첫 화면이 멈췄다(Google 5초 지연 → 첫 화면 5.8초, 실측).
    // 기본 글꼴(Noto Sans KR · JetBrains Mono)은 base.css 에 이미 있다. 받기에 실패하면 예전처럼 Google 줄에 더한다(있을 때만).
    async fontEdit(src, html) {
      html = String(html).replace(/&quot;/g, '"');   // 속성 안 따옴표는 innerHTML 로 꺼내면 &quot; 가 된다 — 이걸 못 풀어 글꼴을 못 찾았다(실측)
      const base = ['Noto Sans KR', 'JetBrains Mono'];
      const used = FONTS.filter(([f]) => !base.includes(f) && (new RegExp(`font-family:\\s*['"]?${f.replace(/ /g, '\\s')}`, 'i').test(html) || html.includes(`'${f}'`) || html.includes(`"${f}"`) || html.includes(`face="${f}"`)));
      const loc = (src.match(/<link rel="stylesheet" href="fonts\/base\.css">[^\n]*/) || [])[0];
      if (loc) {
        const miss = used.filter(([f]) => !src.includes(`fonts/${f.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.css`)); if (!miss.length) return null;
        const add = [];
        for (const [f] of miss) {
          try { const r = await fetch('/api/font', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, family: f }) }); const j = await r.json(); if (j.ok) add.push(j.css); else throw new Error(j.error); }
          catch (e) { E().toast(`글꼴 「${f}」 를 서버에 못 받았습니다(${e.message}) — 이 컴퓨터 밖에서는 다르게 보일 수 있습니다`, 6000); }
        }
        return add.length ? { kind: 'small', find: loc, replace: `${loc}\n${add.map((c) => `<link rel="stylesheet" href="${c}">`).join('\n')}` } : null;
      }
      const tag = (src.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/) || [])[0]; if (!tag) return null;
      const miss = used.filter(([f]) => !tag.includes(`family=${f.replace(/ /g, '+')}`)); if (!miss.length) return null;
      return { kind: 'small', find: tag, replace: tag.replace('&display=swap', `${miss.map((f) => `&family=${f[0].replace(/ /g, '+')}:wght@${f[2]}`).join('')}&display=swap`) };
    },
    savedBanner(o) {
      const b = document.createElement('div'); b.id = 'de-banner';
      b.innerHTML = `<span>✓ 「${esc(o.slide)}」 편집 ${o.n}곳 저장됨${o.froze ? ' (장 고정 포함)' : ''} · 커밋은 직접</span><button class="undo" style="background:#fff;color:#1E3A8A">되돌리기</button><button class="ghost">닫기</button>`;
      document.body.appendChild(b); b.querySelector('.ghost').onclick = () => b.remove();
      b.querySelector('.undo').onclick = async () => {
        const r = await fetch('/api/edit/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) { E().toast(`되돌리기 못 함: ${j.error || r.status}`); return; } location.reload();
      };
      setTimeout(() => b.remove(), 20000);
    },
  };
  window.DeckRibbon = R;
})();
