// 덱 AI 패널의 「Claude Code」 엔진 — 서버(server/deckagent.py)가 Claude Code 를 돌려 덱 사본을 고치고, 여기서는 진행 · 결과 카드 · [적용]을 그린다.
// AI PPT(2026-09-30 이전 프로토타입 에서 옮김): **Claude Code 만** 쓴다(로컬 gemma 는 부탁 종류 판단 · 없으면 건너뜀). 구독 토큰은 계정에 묶여 서버에 있고
//   (브라우저는 연결 여부만 /api/me 로 안다), 새 덱(?new=1)은 열리자마자 받은 정보(brief.json)로 Claude Code 가 처음부터 만든다(A.build).
// 사용자 지정(2026-09-30): "클로드 코드 도구를 연결 · 구독 계정으로, 클로드 계정 있으면 그걸로". js/deckkit.js 가 고칠 수 있는 덱(editable)에서만 불러온다.
// 엔진 두 가지(사용자 지정 2026-09-30 "설명은 빠른 답, 수정은 gemma 26b thinking, Claude Code 는 연결 안 되면 못 보내게, 모델 선택도"):
//   · gemma 26b — 부탁마다 먼저 설명인지 수정인지 gemma 에게 한 단어로 묻는다(1~2초). 설명 → 빠른 답(예전 패널, 생각 끔 · 수정 문맥 없이),
//     수정 → gemma 생각 켬으로 사본을 고친다. 고치는 틀은 Claude Code 도구 틀(LiteLLM 경유)을 쓴다 — 하네스 비교에서 같은 gemma 생각으로
//     이 틀이 17/24, 패널 한 번에 쓰기 + 생각은 빈 답 11/24(생각 3만 자에서 잘림)였다. Claude 계정은 쓰지 않는다.
//   · Claude Code — 쓰는 사람의 Claude 구독으로만(토큰은 이 브라우저 localStorage 에만 — 부탁할 때 서버로 보내고 서버는 저장하지 않는다).
//     연결 전에는 보내기를 막는다. 모델은 자동(기본) · Opus · Sonnet · Haiku(구독 등급에 따라 못 쓰는 것이 있을 수 있다).
//     자동 = 부탁 종류를 gemma 가 먼저 한 단어로 판단해 설명 → Haiku · 작은 수정 → Sonnet · 큰 수정(배치 · 레이아웃 · 새 그림) → Opus —
//     사용자 제안(2026-09-30 "모델 각 선택해서 토큰 절약"). 판단은 로컬 gemma 라 구독 사용량을 쓰지 않는다.
(() => {
  const K = window.DeckKit; if (!K || window.DeckAgent) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 저장소 없음 */ } } };
  const CSS = `
  .ka-bar { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-bottom: 1px solid #eceef1; font: 700 12px 'Noto Sans KR', sans-serif; color: #545b66; flex-wrap: wrap; }
  .ka-seg { display: inline-flex; background: #f2f3f6; border-radius: 99px; padding: 2px; }
  .ka-seg button { border: 0; background: transparent; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #545b66; cursor: pointer; }
  .ka-seg button.on { background: #16181d; color: #fff; }
  .ka-model { border: 1px solid #e3e6ea; border-radius: 99px; padding: 3px 8px; font: 700 12px 'Noto Sans KR', sans-serif; background: #fff; color: #2b3038; }
  .ka-new { margin-left: auto; border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; width: 28px; height: 26px; padding: 0; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .ka-acct ~ .ka-new { margin-left: 0; }
  .ka-acct { margin-left: auto; border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .ka-acct.on { border-color: #d97706; color: #92400e; background: #fffbeb; }
  .ka-steps { margin: 4px 0 8px; font: 600 12.5px/1.6 'Noto Sans KR', sans-serif; color: #545b66; }
  .ka-steps summary { cursor: pointer; font-weight: 800; }
  .ka-steps li { list-style: none; padding-left: 2px; } .ka-steps li.bad { color: #b91c1c; }
  .ka-live { font: 700 12.5px 'Noto Sans KR', sans-serif; color: #7c3aed; }
  #ka-login { position: fixed; inset: 0; z-index: 98; background: rgba(10,12,16,.55); display: none; align-items: center; justify-content: center; padding: 16px; }
  #ka-login.on { display: flex; }
  #ka-login .bx { background: #fff; border-radius: 16px; max-width: 460px; width: 100%; padding: 20px 22px; font: 500 14px/1.6 'Noto Sans KR', sans-serif; color: #16181d; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  #ka-login h4 { margin: 0 0 8px; font-size: 18px; font-weight: 900; }
  #ka-login ol { padding-left: 20px; margin: 8px 0; } #ka-login .warn { font-size: 12.5px; color: #92400e; background: #fffbeb; border-radius: 10px; padding: 8px 10px; margin: 10px 0; }
  #ka-login input { width: 100%; box-sizing: border-box; border: 1px solid #d5d9df; border-radius: 10px; padding: 9px 11px; font: 16px 'JetBrains Mono', monospace; margin: 6px 0; }
  #ka-login .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
  #ka-login button { border: 0; border-radius: 99px; padding: 8px 16px; font: 800 13.5px 'Noto Sans KR', sans-serif; cursor: pointer; background: #f2f3f6; color: #16181d; }
  #ka-login button.go { background: #16181d; color: #fff; } #ka-login a.open { display: inline-block; margin: 4px 0; font-weight: 800; color: #416AF0; }
  #ka-login .err { color: #b91c1c; font-size: 13px; font-weight: 700; }
  .ka-u { margin: 12px 0; } .ka-ul { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; } .ka-ul span { color: #545b66; font-weight: 700; }
  .ka-ub { height: 10px; border-radius: 99px; background: #eef0f3; overflow: hidden; margin: 6px 0 3px; } .ka-ub i { display: block; height: 100%; border-radius: 99px; }
  .ka-ur { font-size: 12px; color: #7a828e; }
  .ka-use { width: auto !important; padding: 0 10px !important; }
  .ka-files { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 4px 6px; } .ka-files:empty { display: none; }
  .ka-f { position: relative; width: 54px; height: 54px; border-radius: 9px; overflow: hidden; border: 1px solid #e3e6ea; }
  .ka-f img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ka-f button { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 99px; border: 0; background: rgba(22,24,29,.75); color: #fff; font-size: 10px; cursor: pointer; padding: 0; }
  .ka-att { flex: none; align-self: center; border: 0; background: #f2f3f6; border-radius: 99px; width: 30px; height: 30px; padding: 0; font: 700 20px/30px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; margin-right: 4px; }
  .ka-att:hover { background: #e6e8ec; }
  #kpanel.ka-drop .kc-box { border-color: #416AF0; box-shadow: 0 0 0 3px rgba(65,106,240,.18); }
  #kpanel.ka-drop .kc-box textarea::placeholder { color: #416AF0; }

  .ka-att:disabled { opacity: .4; cursor: default; }
  .ka-uthumbs { display: flex; gap: 4px; justify-content: flex-end; margin-top: 6px; } .ka-uthumbs img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
  .ka-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; } .ka-shots img { width: 100%; display: block; border-radius: 6px; }
  #ka-login a.cl { margin-right: auto; align-self: center; font: 800 13px 'Noto Sans KR', sans-serif; color: #416AF0; text-decoration: none; }
  `;
  const A = {
    get engine() { return 'claude'; }, set engine(v) { /* Claude Code 만 */ },
    get model() { return ls.get('deckagent.model') ?? 'auto'; }, set model(v) { ls.set('deckagent.model', v); },
    // 노력(effort) — Claude Code --effort. 자동 = 작은 수정 medium · 큰 수정 high · 설명(Haiku)은 주지 않음(사용자 지정 2026-09-30 "effort 도 조절")
    get effort() { return ls.get('deckagent.effort') ?? 'auto'; }, set effort(v) { ls.set('deckagent.effort', v); },
    // 연결 여부 — 토큰 자체는 서버(계정)에만. 'server' 는 자리표시(서버가 이 값을 무시하고 계정 토큰을 붙인다). 끊기 = 서버에서 지운다
    me: null,
    get token() { return A.me?.claude ? 'server' : ''; },
    set token(v) { if (!A.me) return; if (v) { A.me.claude = true; return; } if (A.me.claude) K.post('/api/me/claude/disconnect', {}).catch(() => {}); A.me.claude = false; },
    sess: null,  // 이어 묻기 — 대화 기억(Claude Code 세션)만 잇는다 {e: 엔진, id}. 사본은 부탁마다 지금 파일에서 새로(사용자 지정 2026-09-30 "심플하게")
    init() {
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      // 부탁 — Claude Code 엔진이 켜져 있으면 가로챈다(예전 방식의 자가검증 · 되묻기 차례는 그대로 예전 길로)
      const ask0 = K.ask.bind(K); A.ask0 = ask0;
      K.ask = (q, opts = {}) => {
        if (opts.retry || opts.verify || opts.src || opts.noEdit) return ask0(q, opts);   // 예전 길의 자가검증 · 되묻기 · 설명 답
        if (A.pendingIdx() >= 0) { A.lock(true); return; }   // 수정안이 떠 있으면 새 부탁은 받지 않는다 — 적용 · 버리기 먼저
        if (A.engine === 'claude' && !A.token) return A.needLogin();
        const att = A.take();   // 첨부 그림 — 보낼 때 입력칸에서 비운다
        return A.route(q, ask0, att);
      };
      // 답 그리기 — 에이전트 답은 진행 단계 + 글 + 결과 카드
      const ans0 = K.ansHtml.bind(K);
      K.ansHtml = (m) => (m.agent ? A.html(m, ans0) : ans0(m));
      // 패널 머리 — 엔진 고르기 · 계정
      const rc0 = K.renderChat.bind(K);
      K.renderChat = (body) => { rc0(body); A.bar(body); A.attachUI(body); A.decorate(body); A.lock(); body.querySelector('.kc-new')?.addEventListener('click', () => { A.sess = null; K.chat.forEach((m, i) => { if (A.isPending(m)) A.discard(i); }); }); };
      const um0 = K.updateMsg.bind(K); K.updateMsg = (i) => { um0(i); A.lock(); };
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ka]'); if (!b) return;
        const i = Number(b.dataset.mi); const m = K.chat[i];
        if (b.dataset.ka === 'apply') A.apply(i, b); else if (b.dataset.ka === 'discard') { A.discard(i); K.updateMsg(i); K.render(); }
        else if (b.dataset.ka === 'go') { m.agent.go = true; K.updateMsg(i); const g = m.agent.o || {}; A.ask('계획대로 진행해 주세요. 끝나면 고친 페이지마다 화면을 찍어 확인해 주세요.', { files: m.agent.files, model: g.model, effort: g.effort, kind: '여러 장 · 진행' }); }
        else if (b.dataset.ka === 'cancel') { m.agent.cancelled = true; K.updateMsg(i); K.render(); }
        else if (b.dataset.ka === 'w-claude' || b.dataset.ka === 'w-gemma' || b.dataset.ka === 'w-cancel') A.decide(i, b.dataset.ka.slice(2));
      });
      // 그림 끌어 놓기 — 패널 어디에 놓아도 첨부
      const kp = document.querySelector('#kpanel');
      const hasFile = (e) => [...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file');
      kp?.addEventListener('dragover', (e) => { if (hasFile(e)) { e.preventDefault(); kp.classList.add('ka-drop'); } });
      kp?.addEventListener('dragleave', (e) => { if (!kp.contains(e.relatedTarget)) kp.classList.remove('ka-drop'); });
      kp?.addEventListener('drop', (e) => { kp.classList.remove('ka-drop'); const fs = e.dataTransfer?.files; if (fs?.length) { e.preventDefault(); A.addFiles(fs); } });
      if (document.body.classList.contains('kchatmode')) K.render();
      fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => { A.me = j.user; K.render(); if (/[?&]new=1\b/.test(location.search)) A.build(); }).catch(() => {});
    },
    // ── 새 덱 처음 만들기 — 목록에서 받은 정보(brief.json)를 서버가 부탁으로 만든다(Opus · 노력 high). 끝나면 곧바로 적용(빈 표지뿐이라 잃을 것이 없고, 백업은 남는다)
    async build() {
      history.replaceState(null, '', location.pathname + location.hash);   // 새로고침해도 두 번 만들지 않게
      let b = {}; try { b = await (await fetch('brief.json', { cache: 'no-store' })).json(); } catch (e) { /* 없으면 제목만 */ }
      K.open('ai');
      const q = `받은 정보로 새 발표 자료를 만들어 주세요${b.audience ? ` — 보는 사람: ${b.audience}` : ''}${b.key ? ` · 핵심: ${b.key}` : ''}`;
      const go = () => A.ask(q, { build: true, model: 'opus', effort: 'high', kind: '새로 만들기', autoApply: true });
      if (A.token) go(); else { A.afterLogin = go; A.login(); }
    },
    // ── 그림 첨부(사용자 지정 2026-09-30) — [그림] 버튼 · 붙여넣기(Ctrl/⌘+V) · 끌어 놓기, 3장까지. 폰 사진이 커서 긴 변 1600px 로 줄인다
    //    (/api/ask 본문 3MB · /api/asset 8MB 상한). 작은 png 는 그대로 둔다(로고 등 투명 배경을 지키려고)
    files: [],
    take() { const f = A.files; A.files = []; A.drawFiles(); return f; },
    async addFiles(list) {
      for (const file of [...list].filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type)).slice(0, Math.max(0, 3 - A.files.length))) A.files.push(await A.prep(file));
      A.drawFiles();
    },
    prep(file) {
      return new Promise((ok, no) => {
        const rd = new FileReader(); rd.onerror = no;
        rd.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => {
          const big = Math.max(im.naturalWidth, im.naturalHeight); const keep = big <= 1600 && file.size <= 2e6 && file.type !== 'image/webp';
          const k = Math.min(1, 1600 / big); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const data = keep ? rd.result : c.toDataURL('image/jpeg', 0.88);
          const t = document.createElement('canvas'); const tk = 120 / big; t.width = Math.max(1, Math.round(im.naturalWidth * tk)); t.height = Math.max(1, Math.round(im.naturalHeight * tk));
          t.getContext('2d').drawImage(im, 0, 0, t.width, t.height);
          ok({ name: keep ? file.name.replace(/[^\w.]+/g, '_') : 'image.jpg', data, thumb: t.toDataURL('image/jpeg', 0.8) });
        }; im.src = rd.result; };
        rd.readAsDataURL(file);
      });
    },
    attachUI(body) {
      const box = body.querySelector('.kc-box'); const comp = body.querySelector('.kc-comp'); if (!box || !comp) return;
      const row = document.createElement('div'); row.className = 'ka-files'; comp.insertBefore(row, box);
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.multiple = true; inp.style.display = 'none';
      inp.onchange = () => { A.addFiles(inp.files); inp.value = ''; }; comp.appendChild(inp);
      const bt = document.createElement('button'); bt.className = 'ka-att'; bt.type = 'button'; bt.textContent = '+'; bt.title = '그림 첨부 — 붙여넣기(Ctrl/⌘+V) · 채팅창에 끌어 놓기도 됨, 3장까지';
      bt.onclick = () => inp.click(); box.insertBefore(bt, box.firstChild);
      box.querySelector('textarea')?.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); A.addFiles(fs); } });
      A.drawFiles();
    },
    drawFiles() {
      const row = document.querySelector('#kpanel .ka-files'); if (!row) return;
      row.innerHTML = A.files.map((f, k) => `<div class="ka-f"><img src="${f.thumb}" alt=""><button data-kx="${k}" title="빼기">✕</button></div>`).join('');
      row.querySelectorAll('[data-kx]').forEach((b) => { b.onclick = () => { A.files.splice(Number(b.dataset.kx), 1); A.drawFiles(); }; });
      const sb = document.querySelector('#kpanel .kc-send'); if (sb && A.files.length && !K.busy && A.pendingIdx() < 0) sb.disabled = false;
    },
    // 내 말풍선에 첨부 그림 작게 — deckkit 은 말풍선에 글만 그린다
    decorate(body) {
      const us = K.chat.filter((m) => m.role === 'user'); const els = body.querySelectorAll('.kc-u');
      us.forEach((m, k) => { if (m.thumbs?.length && els[k]) (els[k].firstElementChild || els[k]).insertAdjacentHTML('beforeend', `<div class="ka-uthumbs">${m.thumbs.map((t) => `<img src="${t}" alt="">`).join('')}</div>`); });
    },
    // ── 수정안 대기 — 떠 있는 동안은 [적용] · [버리기] 둘 중 하나만(사용자 지정 2026-09-30: "무시하고 계속 쓰면? 추천 질문을 누르면? 가정이 너무 많다, 심플하게")
    // 입력칸 · 추천 질문 · 장 안의 질문 버튼을 멈추고 까닭을 입력칸에 쓴다. 예전 방식(빠른 답)의 수정안 카드도 같게
    isPending(m) {
      if (!m || m.role !== 'assistant' || m.streaming) return false;
      if (m.agent?.warn) return !m.agent.decided;
      if (m.agent) return !!(m.agent.done && !m.err && ((m.agent.plan && !m.agent.go && !m.agent.cancelled) || (m.agent.changed && !m.agent.applied && !m.agent.discarded)));
      return !!((m.passState || (m.shotErr && m.edits?.ok)) && !m.applied && !m.cancelled && !m.rollback);
    },
    pendingIdx() { for (let i = K.chat.length - 1; i >= 0; i--) if (A.isPending(K.chat[i])) return i; return -1; },
    lock(flash) {
      const i = A.pendingIdx(); const ta = document.querySelector('#kpanel .kc-box textarea'); const sb = document.querySelector('#kpanel .kc-send');
      document.querySelectorAll('#kpanel .kc-row, #kpanel .kc-sug').forEach((x) => { x.style.display = i >= 0 ? 'none' : ''; });
      if (ta) { ta.disabled = i >= 0; if (i >= 0) ta.placeholder = '먼저 위 카드에서 골라 주세요'; }
      const at = document.querySelector('#kpanel .ka-att'); if (at) at.disabled = i >= 0;
      if (sb && i >= 0 && !K.busy) sb.disabled = true;
      if (flash && i >= 0) { const el = document.querySelector(`#kpanel .kc-a[data-mi="${i}"] .kc-eda`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.animate?.([{ background: '#fef3c7' }, { background: 'transparent' }], { duration: 1200 }); }
    },
    bar(body) {
      const top = body.querySelector('.kc-top'); if (!top) return;
      const sub = !!A.token; const cc = A.engine === 'claude';
      const MODELS = [['auto', '자동(추천)'], ['opus', 'Opus 5.5'], ['sonnet', 'Sonnet 5'], ['haiku', 'Haiku 4.5'], ['', '계정 기본']];
      const bar = document.createElement('div'); bar.className = 'ka-bar';
      bar.innerHTML = '<span class="ka-seg"><button class="on" title="Claude Code — 내 Claude 구독으로">Claude Code</button></span>'
        + (cc && sub ? `<select class="ka-model" title="Claude 모델 — 구독 등급에 따라 못 쓰는 것이 있을 수 있다">${MODELS.map(([v, n]) => `<option value="${v}" ${A.model === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`
          + `<select class="ka-model ka-effort" title="노력(effort) — 높을수록 오래 생각하고 사용량이 는다">${[['auto', '노력 자동'], ['low', '노력 low'], ['medium', '노력 medium'], ['high', '노력 high'], ['xhigh', '노력 xhigh'], ['max', '노력 max']].map(([v, n]) => `<option value="${v}" ${A.effort === v ? 'selected' : ''}>${n}</option>`).join('')}</select>` : '')
        + (cc ? `<button class="ka-acct${sub ? ' on' : ''}">${sub ? '✓ 구독 연결됨' : 'Claude 구독 연결'}</button>` : '')
        + (cc && sub ? '<button class="ka-new ka-use" title="남은 사용량">사용량</button>' : '')
        ;
      top.after(bar);
      // 윗줄(새 대화 버튼만 남음)을 엔진 줄 오른쪽으로 합친다 — 설명 문구를 뺀 뒤 한 줄을 통째로 먹었다(사용자 지정 2026-09-30 설명 문구 삭제)
      const nw = top.querySelector('.kc-new'); if (nw) { nw.classList.add('ka-new'); nw.textContent = '＋'; nw.title = '새 대화'; bar.appendChild(nw); top.style.display = 'none'; }
      bar.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { A.engine = b.dataset.e; K.render(); }; });
      const ms = bar.querySelector('.ka-model:not(.ka-effort)'); if (ms) ms.onchange = () => { A.model = ms.value; };
      const es = bar.querySelector('.ka-effort'); if (es) es.onchange = () => { A.effort = es.value; };
      const us = bar.querySelector('.ka-use'); if (us) us.onclick = () => A.usage();
      const ac = bar.querySelector('.ka-acct'); if (ac) ac.onclick = () => (sub ? (confirm('Claude 구독 연결을 끊을까요? (내 계정에 저장된 연결을 지웁니다)') && (A.token = '', K.render())) : A.login());
      // 연결 안 된 Claude Code — 보내기를 막는다(입력은 그대로 두고 연결을 권한다)
      const sendB = body.querySelector('.kc-send'); const ta = body.querySelector('.kc-box textarea');
      if (cc && !sub && ta) { ta.placeholder = 'Claude 구독을 연결하면 보낼 수 있습니다'; }
      if (cc && !sub && sendB) { const lock = () => { if (!K.busy) sendB.disabled = true; }; lock(); ta?.addEventListener('input', lock); }
    },
    needLogin() { A.login(); },
    // 남은 사용량 팝업 — 서버가 이 토큰으로 Claude 사용량 주소를 대신 부른다(api/oauth/usage)
    async usage(probe = false) {
      let v = document.querySelector('#ka-login');
      if (!v) { v = document.createElement('div'); v.id = 'ka-login'; document.body.appendChild(v); v.addEventListener('click', (e) => { if (e.target === v) v.classList.remove('on'); }); }
      v.innerHTML = '<div class="bx"><h4>남은 사용량</h4><div>불러오는 중…</div></div>'; v.classList.add('on');
      const NM = { five_hour: '5시간 한도', seven_day: '주간 한도', seven_day_opus: '주간 · Opus', seven_day_sonnet: '주간 · Sonnet', seven_day_oauth_apps: '주간 · 연결 앱' };
      const when = (t) => { if (!t) return ''; const d = new Date(t); if (Number.isNaN(+d)) return ''; const m = Math.round((d - Date.now()) / 60000);
        const rel = m < 60 ? `${m}분 뒤` : m < 48 * 60 ? `${Math.round(m / 60)}시간 뒤` : `${Math.round(m / 1440)}일 뒤`;
        return `${d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 초기화(${rel})`; };
      let body;
      const ST = { allowed: '여유', allowed_warning: '한도 가까움', rejected: '한도 도달' };
      try { const j = await K.post('/api/agent/usage', { probe });
        body = j.rows.length ? j.rows.map((r) => { const p = Math.max(0, Math.min(100, Number(r.pct) || 0)); const col = p >= 90 ? '#DC2626' : p >= 70 ? '#d97706' : '#416AF0';
          const hasP = r.pct != null;
          return `<div class="ka-u"><div class="ka-ul"><b>${esc(NM[r.key] || r.key)}</b><span>${hasP ? `${p.toFixed(0)}% 사용 · 남은 ${(100 - p).toFixed(0)}%` : esc(ST[r.status] || r.status || '')}${r.overage ? ' · 초과 사용 중' : ''}</span></div>${hasP ? `<div class="ka-ub"><i style="width:${p}%;background:${col}"></i></div>` : ''}<div class="ka-ur">${esc(when(r.resets))}</div></div>`; }).join('')
          + (j.source === 'events' ? `<div class="ka-ur">Claude Code 가 부탁할 때 받은 값 · ${j.age < 90 ? '방금' : `${Math.round(j.age / 60)}분 전`}</div>` : '')
          : '<div>사용량 정보가 없습니다</div>';
      } catch (e) { body = `<div class="err">${esc(e.message)}</div>`; }
      v.innerHTML = `<div class="bx"><h4>남은 사용량</h4>${body}<div class="row"><a class="cl" href="https://claude.ai/settings/usage" target="_blank" rel="noopener" title="Claude 공식 사용량 화면(새 탭)">claude.ai 에서 보기 ↗</a><button class="re" title="아주 짧은 부탁을 한 번 보내 최신 값을 받는다">새로 보기</button><button class="go x">닫기</button></div></div>`;
      v.querySelector('.x').onclick = () => v.classList.remove('on'); v.querySelector('.re').onclick = () => A.usage(true);
    },
    // gemma 엔진 나누기 — 설명이면 빠른 답(생각 끔 · 수정 문맥 없이), 수정이면 생각 켜고 사본 고치기.
    // 판단은 gemma 에게 한 단어(수정 · 설명)로 — 앞 답이 제안이었으면 "그래 해줘"도 수정이다. 판단이 실패하면 수정 쪽으로(고치는 쪽은 안 고쳐도 답은 준다)
    async route(q, ask0, att = [], o2 = {}) {
      if (K.busy) return;
      K.busy = true; K.setSend(); let kind = '작은 수정';
      try {
        const last = [...K.chat].reverse().find((m) => m.role === 'assistant' && m.text);
        // 판단 전용 주소(serve.py /api/classify) — 패널 지시문이 붙은 /api/ask 로 시키면 '질문'이라 쓰거나 본답을 해 버렸다(실측)
        const r = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, last: last ? last.text : '' }) });
        const k2 = (await r.json()).kind; if (['설명', '작은 수정', '큰 수정', '여러 장'].includes(k2)) kind = k2;
      } catch (e) { /* 판단 실패 — 수정 쪽 */ }
      K.busy = false;
      // 고치기 부탁은 편집 화면에서(사용자 지정 2026-09-30 "일반 AI 모드에서 편집 요청하면 그 화면으로") — 보기 화면이면 편집을 켠 뒤 이어 간다.
      // 편집 중 직접 고친 것을 저장하지 않았으면 보내지 않는다 — AI 수정안을 적용하면 새로고침돼 그 편집이 사라진다
      const ED = window.DeckEdit;
      if (kind !== '설명' && ED) {
        if (ED.on && ED.dirty) { ED.toast('직접 고친 것을 먼저 저장해 주세요 — 그다음 AI 에게 고치기를 부탁할 수 있어요', 4200); K.draft = q; A.files = att; K.render(); return; }
        if (!ED.on) { await ED.start(); K.open('ai'); }
      }
      // 여러 장(두 장 이상 · 새 장)은 계획부터 — 한 장이면 바로 고친다(사용자 지정 2026-09-30 "한 장만이면 지금처럼, 여러 장이면 물어보기")
      const plan = kind === '여러 장';
      if (A.engine === 'claude') return A.ask(q, { model: A.model === 'auto' ? { 설명: 'haiku', '작은 수정': 'sonnet', '큰 수정': 'opus', '여러 장': 'opus' }[kind] : '', effort: { '작은 수정': 'medium', '큰 수정': 'high', '여러 장': 'high' }[kind] || '', kind, att, plan, noUser: o2.noUser });
      // gemma 로 여러 장 · 레이아웃(큰 수정)은 바로 돌리지 않고 묻는다 — 벤치에서 레이아웃 과제는 거의 실패, 여러 장은 계획부터 어긋났다
      // (사용자 지정 2026-09-30 "로컬 llm 으로는 안 될 것 같다, Claude Code 로 돌리기 · 무시하고 진행 버튼으로")
      if (!o2.forceGemma && (kind === '여러 장' || kind === '큰 수정')) return A.warn(q, att, kind);
      if (kind === '설명') { await ask0(q, { noEdit: true, userImages: att.map((f) => f.data), thumbs: att.map((f) => f.thumb) }); const m = K.chat[K.chat.length - 1]; if (m?.role === 'assistant') { m.model = '빠른 답 · gemma-4-26b'; K.updateMsg(K.chat.length - 1); } return; }
      return A.ask(q, { att, plan, kind, noUser: o2.noUser });
    },
    // gemma 안내 카드 — [Claude Code 로 하기] · [무시하고 진행] · [취소]. 떠 있는 동안은 수정안 카드처럼 새 부탁을 막는다
    warn(q, att, kind) {
      const slide = K.cfg.current().dataset.name;
      K.chat.push({ role: 'user', text: q, slide, ...(att.length ? { thumbs: att.map((f) => f.thumb) } : {}) });
      K.chat.push({ role: 'assistant', text: '', slide, root: q, agent: { warn: true, done: true, kind, att, steps: [] }, model: `gemma 26b · ${kind.replace(/장/g, '페이지')}` });
      K.draft = ''; K.render();
    },
    decide(i, how) {
      const m = K.chat[i]; const g = m.agent; if (g.decided) return; g.decided = how; K.updateMsg(i);
      if (how === 'cancel') { K.render(); return; }
      // 다시 판단하지 않는다(판단이 바뀌면 헷갈린다) — 이 카드의 종류 그대로 보낸다
      const plan = g.kind === '여러 장';
      if (how === 'gemma') return A.ask(m.root, { att: g.att, plan, kind: g.kind, noUser: true });
      A.engine = 'claude'; K.render();
      const go = () => A.ask(m.root, { att: g.att, plan, kind: g.kind, noUser: true, model: A.model === 'auto' ? 'opus' : '', effort: A.effort === 'auto' ? 'high' : '' });
      if (A.token) go(); else { A.afterLogin = go; A.login(); }
    },

    // ── 부탁 ──
    async ask(q, o = {}) {
      if (K.busy) return;
      const slide = K.cfg.current().dataset.name;
      const att = o.att || [];
      if (!o.noUser) K.chat.push({ role: 'user', text: q, slide, ...(att.length ? { thumbs: att.map((f) => f.thumb) } : {}) });
      const a = { role: 'assistant', text: '', slide, streaming: true, agent: { steps: [], engine: A.engine === 'claude' ? 'sub' : 'gemma', plan: !!o.plan, o: { model: o.model, effort: o.effort, kind: o.kind } }, root: q }; K.chat.push(a); const ai = K.chat.length - 1;
      K.draft = ''; K.tab = 'ai'; document.body.classList.add('kside'); K.follow = 'pin'; K.render(); K.relayout();
      K.busy = true; K.ctrl = new AbortController(); K.setSend(); const t0 = performance.now();
      try {
        const cc = A.engine === 'claude';
        // 첨부 그림을 덱 폴더(img/uploads/)에 올린다 — Claude Code 가 작업 폴더 안에서 Read 로 연다. [진행] 차례는 계획 때 올린 경로를 그대로
        let files = o.files || [];
        if (att.length) { a.agent.steps.push({ t: `그림 ${att.length}장 올리기` }); K.updateMsg(ai);
          files = []; for (const f of att) { const j = await K.post('/api/asset', { file: location.pathname, name: f.name, data: f.data.split(',')[1] }); files.push(j.src); } }
        a.agent.files = files;
        const r = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: K.ctrl.signal,
          body: JSON.stringify({ file: location.pathname, slide, prompt: q, files, plan: !!o.plan, build: !!o.build, session: A.sess?.e === (cc ? 'sub' : 'gemma') ? A.sess.id : undefined, token: cc ? A.token : undefined, model: cc ? (o.model || (A.model === 'auto' ? '' : A.model) || undefined) : undefined,
            effort: cc ? ((A.effort === 'auto' ? o.effort : A.effort) || undefined) : undefined }) });
        if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
        const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let k;
          while ((k = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1); if (!line) continue;
            const j = JSON.parse(line);
            if (j.session) A.sess = { e: a.agent.engine, id: j.session };
            if (j.step) a.agent.steps.push({ t: j.step });
            if (j.stepErr) a.agent.steps.push({ t: j.stepErr.replace(/<\/?tool_use_error>/g, '').slice(0, 120), bad: true });
            if (j.think) a.think = (a.think || 0) + j.think;
            if (j.d) a.text = a.text ? `${a.text}\n\n${j.d}` : j.d;
            if (j.error) a.err = j.error;
            if (j.done) {
              Object.assign(a.agent, { done: true, rid: j.rid, changed: j.changed, slides: j.slides || [], other: j.other, sec: j.sec, turns: j.turns, models: j.models || [] });
              if (j.result) a.text = j.result;   // 마지막 답만 남긴다(중간 설명은 단계로 충분)
              if (j.shots?.length > 1) a.shots = j.shots;
              if (j.changed && j.before && j.after) {
                const d = window.DeckCheck ? window.DeckCheck.diff(j.before, j.after) : { problems: [], errors: [] };
                a.state = { jpg: j.after.jpg, base: j.before.jpg, problems: d.problems, errors: d.errors };
              }
            }
            K.updateMsg(ai);
          }
        }
        if (!a.text && !a.err && !a.agent.done) a.err = '답을 받지 못했습니다';
      } catch (e) {
        if (e.name === 'AbortError') a.stopped = true; else a.err = e.message;
      }
      a.streaming = false; a.ms = performance.now() - t0; const mm = o.model || (A.model === 'auto' ? '' : A.model); const NM = { opus: 'Opus 5.5', sonnet: 'Sonnet 5', haiku: 'Haiku 4.5' };
      const ef = A.effort === 'auto' ? o.effort : A.effort;
      // 실제 모델 ID(Claude Code 결과의 modelUsage) — 보조 호출용 작은 모델(haiku)이 같이 찍히면 둘 다
      const used = (a.agent.models || []).join(', ');
      a.model = a.agent.engine === 'sub' ? `Claude Code · ${NM[mm] || '계정 기본 모델'}${ef ? ` · 노력 ${ef}` : ''}${o.kind ? ` (자동: ${o.kind.replace(/장/g, '페이지')})` : ''}${used ? ` · 실제: ${used}` : ''}` : 'gemma 26b 생각 · 수정';
      // 구독 인증 실패 — 저장한 토큰을 지우고 다시 연결하게(잘못 잡은 토큰으로 계속 401 이 나지 않게)
      if (a.agent.engine === 'sub' && /구독 인증 실패|401|OAuth access token/i.test(a.err || '')) { A.token = ''; a.err += ' — 연결을 지웠습니다. [Claude 구독 연결]로 다시 연결해 주세요'; K.render(); }
      K.busy = false; K.ctrl = null; K.updateMsg(ai); K.setSend();
      if (o.autoApply && a.agent.done && a.agent.changed && !a.err) { const b = document.querySelector(`#kpanel [data-ka="apply"][data-mi="${ai}"]`); if (b) A.apply(ai, b); }
    },
    html(m, ans0) {
      const g = m.agent; const i = K.chat.indexOf(m);
      if (g.warn) {
        const what = g.kind === '여러 장' ? '여러 페이지 · 새 페이지' : '레이아웃(배치 · 그래프 모양)';
        return `<div class="kc-body"><p>로컬 gemma 로는 <b>${what}</b> 수정이 많이 부족합니다. Claude Code 로 하면 훨씬 정확합니다.</p></div>`
          + (g.decided ? `<div class="kc-eda">${{ claude: '▶ Claude Code 로 — 아래', gemma: '▶ gemma 로 진행 — 아래', cancel: '취소함' }[g.decided]}</div>`
            : `<div class="kc-eda"><button class="go" data-ka="w-claude" data-mi="${i}">Claude Code 로 하기</button><button data-ka="w-gemma" data-mi="${i}">무시하고 진행</button><button data-ka="w-cancel" data-mi="${i}">취소</button></div>`);
      }
      const steps = g.steps.length ? (m.streaming ? `<ul class="ka-steps">${g.steps.slice(-6).map((s) => `<li class="${s.bad ? 'bad' : ''}">${s.bad ? '✕' : '·'} ${esc(s.t)}</li>`).join('')}</ul>`
        : `<details class="ka-steps"><summary>한 일 ${g.steps.length}가지${g.sec ? ` · ${g.sec}초` : ''}</summary><ul>${g.steps.map((s) => `<li class="${s.bad ? 'bad' : ''}">${s.bad ? '✕' : '·'} ${esc(s.t)}</li>`).join('')}</ul></details>`) : '';
      const live = m.streaming ? `<div class="ka-live">${g.steps.length ? '작업 중' : '시작하는 중'}…${m.think ? ` 생각 ${m.think.toLocaleString()}` : ''}</div>` : '';
      const text = m.text ? ans0({ text: m.text, streaming: m.streaming }) : (m.err ? '' : '');
      const err = m.err ? `<div class="kc-err">실패: ${esc(m.err)}</div>` : '';
      let card = '';
      if (g.done && g.plan && !m.streaming && !m.err) {
        card = g.go ? '<div class="kc-eda">▶ 계획대로 진행 — 아래</div>' : g.cancelled ? '<div class="kc-eda">취소함</div>'
          : `<div class="kc-eda"><button class="go" data-ka="go" data-mi="${i}">진행</button><button data-ka="cancel" data-mi="${i}">취소</button><span>진행하면 계획대로 고치고 화면으로 확인합니다</span></div>`;
      } else if (g.done && g.changed && !m.streaming) {
        const st = m.state; const probs = st ? [...st.errors.map((e) => `스크립트 오류: ${e}`), ...st.problems.slice(0, 6).map((p) => `${p.slide}페이지 ${p.text}`)] : [];
        card = `<div class="kc-ed"><div class="h">바뀐 페이지: ${esc(g.slides.join(' · ') || '없음')}${g.other ? ' · <span style="color:#b45309">공용 부분(스타일 · 스크립트)도 바뀜</span>' : ''}</div>`
          + (m.shots?.length > 1
            ? `<div class="ka-shots">${m.shots.map((s, k) => `<div class="kshot-t" data-kshot="${i}:s${k}" title="누르면 크게 · 이전과 겹쳐 비교"><img src="${s.after}"><span>${s.n}. ${esc(s.name)}</span></div>`).join('')}</div>`
            : st?.jpg ? `<div class="kshot-t" data-kshot="${i}:state" title="누르면 크게 · 이전과 겹쳐 비교"><img src="${st.jpg}" style="width:100%;display:block"><span>⤢ 크게 · 이전과 비교</span></div>` : '')
          + (probs.length ? `<pre class="del">${esc(probs.join('\n'))}</pre>` : '') + '</div>'
          + (g.applied ? `<div class="kc-eda">✓ 파일에 저장됨 · 커밋은 직접 <button data-kundo="${i}">되돌리기</button></div>`
            : g.discarded ? '<div class="kc-eda">버림 — 원본은 그대로</div>'
            : `<div class="kc-eda"><button class="go" data-ka="apply" data-mi="${i}">적용 — 파일에 저장</button><button data-ka="discard" data-mi="${i}">버리기</button></div>`)
          + (g.applyErr ? `<div class="kc-ed"><div class="bad">${esc(g.applyErr)}</div></div>` : '');
      } else if (g.done && !g.changed && !m.streaming) card = '';
      return steps + live + text + err + card;
    },
    async apply(i, btn) {
      const m = K.chat[i]; btn.disabled = true; m.agent.applyErr = '';
      try { try { if (window.DeckEdit?.on) sessionStorage.setItem('deckedit.resume', '1'); } catch (e2) { /* 저장소 없음 */ }   // 적용 뒤 새로고침하면 편집 화면으로 돌아온다
        const j = await K.post('/api/agent/apply', { rid: m.agent.rid }); m.agent.applied = j.backup; m.applied = j.backup; m.edit = { file: location.pathname, sha: '', slide: m.slide }; K.keepChat(); location.reload(); }   // m.edit — [되돌리기](K.undoEdit)가 m.edit.file 을 본다
      catch (e) { m.agent.applyErr = `저장 못 함: ${e.message}`; btn.disabled = false; K.updateMsg(i); }
    },
    discard(i) { const m = K.chat[i]; if (!m?.agent) { if (m) m.cancelled = true; return; } m.agent.discarded = true; if (m.agent.rid) K.post('/api/agent/discard', { rid: m.agent.rid }).catch(() => {}); },

    // ── 구독 계정 연결 — 서버가 `claude setup-token` 을 대신 돌리고, 로그인은 이 사람이 자기 브라우저에서 ──
    async login() {
      let v = document.querySelector('#ka-login');
      if (!v) { v = document.createElement('div'); v.id = 'ka-login'; document.body.appendChild(v); v.addEventListener('click', (e) => { if (e.target === v) v.classList.remove('on'); }); }
      v.innerHTML = '<div class="bx"><h4>Claude 구독 연결</h4><div>로그인 주소를 받는 중…</div></div>'; v.classList.add('on');
      let id = '';
      try { const j = await K.post('/api/agent/login/start', {}); id = j.id;
        v.innerHTML = `<div class="bx"><h4>Claude 구독 연결</h4>
          <ol><li><a class="open" href="${esc(j.url)}" target="_blank" rel="noopener">Claude 로그인 열기 ↗</a> — 새 탭에서 구독 계정(Pro · Max)으로 로그인하고 허용</li>
          <li>로그인 뒤 화면에 나오는 <b>코드</b>를 복사해 아래에 붙여 넣기</li></ol>
          <input placeholder="코드 붙여 넣기" autocomplete="off" spellcheck="false">
          <div class="warn">구독으로 돌리면 Claude 와 연결됩니다. 사용량은 이 구독에 잡히고, 연결은 내 계정에 저장됩니다(1년, 언제든 끊기 가능).</div>
          <div class="err"></div><div class="row"><button class="x">취소</button><button class="go">연결</button></div></div>`;
      } catch (e) { v.innerHTML = `<div class="bx"><h4>Claude 구독 연결</h4><div class="err">${esc(e.message)}</div><div class="row"><button class="x">닫기</button></div></div>`; }
      v.querySelector('.x').onclick = () => v.classList.remove('on');
      const go = v.querySelector('.go'); if (!go) return;
      go.onclick = async () => {
        const code = v.querySelector('input').value.trim(); if (!code) return; go.disabled = true; go.textContent = '연결 중…';
        // 코드만 넘기고 곧바로 돌아온 뒤 1초마다 결과를 묻는다 — 탭을 오가도(폰 브라우저가 뒤 탭 요청을 끊는다) 돌아오면 이어서 확인
        try { await K.post('/api/agent/login/finish', { id, code });
          let j = null; for (let k = 0; k < 150 && !j?.connected; k++) { await new Promise((ok) => setTimeout(ok, 1000)); try { j = await K.post('/api/agent/login/poll', { id }); } catch (e) { if (!/Failed to fetch|NetworkError|Load failed/.test(e.message)) throw e; } }
          if (!j?.connected) throw new Error('연결하지 못했습니다 — 다시 연결을 눌러 주세요');
          A.token = 'server'; A.engine = 'claude'; v.classList.remove('on'); K.render(); const af = A.afterLogin; A.afterLogin = null; if (af) af(); }
        catch (e) { v.querySelector('.err').textContent = e.message; go.disabled = false; go.textContent = '연결'; }
      };
    },
  };
  window.DeckAgent = A;
  A.init();
})();
