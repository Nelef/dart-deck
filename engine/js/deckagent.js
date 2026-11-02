// 덱 AI 패널의 「Claude Code」 엔진 — 서버(server/deckagent.py)가 Claude Code 를 돌려 덱 사본을 고치고, 여기서는 진행 · 결과 카드 · [적용]을 그린다.
// DART Deck: 엔진은 Claude Code(개인 구독) · 로컬 LLM(선택) 둘 — **새 덱 만들기만 Claude Code**(사용자 지정).
//   (옮길 때 '클로드 코드만'을 패널 전체로 잘못 읽어 gemma 를 뺐다가 되살림 — 사용자 지적 2026-09-30 "로컬 llm 으로 사용하기 있지 않았나"). 구독 토큰은 계정에 묶여 서버에 있고
//   (브라우저는 연결 여부만 /api/me 로 안다), 새 덱(?new=1)은 열리자마자 받은 정보(brief.json)로 Claude Code 가 처음부터 만든다(A.build).
// 사용자 지정(2026-09-30): "클로드 코드 도구를 연결 · 구독 계정으로, 클로드 계정 있으면 그걸로". js/deckkit.js 가 고칠 수 있는 덱(editable)에서만 불러온다.
// 엔진 두 가지(사용자 지정 2026-09-30 "설명은 빠른 답, 수정은 로컬 LLM thinking, Claude Code 는 연결 안 되면 못 보내게, 모델 선택도"):
//   · 로컬 LLM — 부탁마다 먼저 설명인지 수정인지 gemma 에게 한 단어로 묻는다(1~2초). 설명 → 빠른 답(예전 패널, 생각 끔 · 수정 문맥 없이),
//     수정 → gemma 생각 켬으로 사본을 고친다. 고치는 틀은 Claude Code 도구 틀(LiteLLM 경유)을 쓴다 — 하네스 비교에서 같은 gemma 생각으로
//     이 틀이 17/24, 패널 한 번에 쓰기 + 생각은 빈 답 11/24(생각 3만 자에서 잘림)였다. Claude 계정은 쓰지 않는다.
//   · Claude Code — 쓰는 사람의 Claude 구독으로만(토큰은 이 브라우저 localStorage 에만 — 부탁할 때 서버로 보내고 서버는 저장하지 않는다).
//     연결 전에는 보내기를 막는다. 모델 선택 기본은 **Sonnet 5.5 · 노력 medium**(브라우저에 고른 값이 없을 때, 사용자 지정 2026-10-01 — 새로 만들기와 같은 Sonnet. 그 전엔 Opus · low, 023aa34) — 모델 자동 · Opus · Sonnet · Haiku · 계정 기본(구독 등급에 따라 못 쓰는 것이 있을 수 있다).
//     「모델 자동」 = 부탁 종류를 gemma 가 먼저 한 단어로 판단해 설명 → Haiku · 작은 수정 → Sonnet(노력 medium) · 큰 수정 / 여러 장 → Sonnet(노력 high) — Opus 는 사람이 고를 때만(b9911ef).
//     사용자 제안(2026-09-30 "모델 각 선택해서 토큰 절약"). 판단은 로컬 LLM 라 구독 사용량을 쓰지 않는다.
(() => {
  const K = window.DeckKit; if (!K || window.DeckAgent) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 저장소 없음 */ } } };
  // 선 아이콘 — 글자색(currentColor)을 따른다. 대화 목록 = 말풍선 여럿 · 새 대화 = 연필 · 웹 = 지구
  const IC = {
    list: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 8h9M8 12h6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    web: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  };
  // 첨부 문서(사용자 지정 2026-09-30 "ppt, pdf 같은 거 첨부 가능한가") — pdf · pptx · docx. 썸네일은 확장자를 적은 작은 SVG(그림 썸네일 자리에 그대로 쓴다)
  const DOC_RE = /\.(pdf|pptx|docx)$/i;
  const docThumb = (name) => { const x = (name.match(DOC_RE)?.[1] || '').toUpperCase().replace('PPTX', 'PPT').replace('DOCX', 'DOC'); const c = { PDF: '#DC2626', PPT: '#d97706', DOC: '#0F766E' }[x] || '#6b7280';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="14" fill="#f2f3f6"/><path d="M36 20h36l20 20v60H36z" fill="#fff" stroke="${c}" stroke-width="4"/><text x="64" y="84" font-family="sans-serif" font-size="22" font-weight="900" fill="${c}" text-anchor="middle">${x}</text></svg>`); };
  const CSS = `
  /* 데모 한도 — 오른쪽 아래 떠 있는 알약(AI 창이 열리면 그 왼쪽으로) · 누르면 계산 방식 */
  #kq { position: fixed; z-index: 60; right: 16px; bottom: 118px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font: 600 12.5px/1.45 'Noto Sans KR', sans-serif; color: #16181d; }
  body.kside #kq { right: calc(var(--kw, 420px) + 16px); bottom: 64px; }
  #kq .qb { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px 7px 8px; border: 1px solid rgba(22,24,29,.12); border-radius: 99px; background: rgba(255,255,255,.94); box-shadow: 0 10px 26px -12px rgba(0,0,0,.45); cursor: pointer; font: inherit; color: inherit; }
  #kq .qb:hover { border-color: #0F766E; }
  #kq .ring { --p: 0; --qc: #0F766E; width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--qc) calc(var(--p) * 1turn), #e3e6ea 0); display: grid; place-items: center; }
  #kq .ring::after { content: ''; width: 14px; height: 14px; border-radius: 50%; background: #fff; }
  #kq .qp { width: min(330px, calc(100vw - 32px)); background: #fff; border: 1px solid rgba(22,24,29,.12); border-radius: 16px; padding: 14px 16px; box-shadow: 0 24px 50px -22px rgba(0,0,0,.5); font-weight: 500; }
  #kq .qp h3 { margin: 0 0 10px; font-size: 14px; }
  #kq .qr { margin-bottom: 11px; }
  #kq .qr .top { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; }
  #kq .qr .top span:last-child { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
  #kq .qbar { height: 6px; border-radius: 6px; background: #eef0f3; margin: 5px 0 4px; overflow: hidden; }
  #kq .qbar i { display: block; height: 100%; width: calc(var(--v) * 100%); background: var(--qc, #0F766E); border-radius: inherit; }
  #kq .qr p { margin: 0; color: #5b6270; font-size: 12px; }
  #kq .qf { border-top: 1px solid #eef0f3; padding-top: 9px; color: #5b6270; font-size: 12px; }
  #kq .qf a { color: #0F766E; font-weight: 700; }
  @media (max-width: 640px) { body.kside #kq { display: none; } #kq { right: 10px; bottom: 112px; } }

  /* 머리 정리(사용자 지적 2026-09-30 "자리만 차지 · 버튼 UX 별로") — 윗줄 = 덱 · 페이지 + 아이콘(대화 목록 · 새 대화 · 닫기), 아랫줄 = 엔진 · 모델 · 노력 · 웹 · ⋯ 한 줄.
     탭이 AI 하나뿐인 덱(noCode)은 「AI 에게 묻기」 알약과 따로 한 줄 먹던 페이지 이름 줄(kstage)을 없애고 윗줄에 합친다 */
  #kpanel.ka-solo .khead { padding: 10px 10px 10px 16px; gap: 4px; }
  #kpanel.ka-solo .khead button[data-kt="ai"], #kpanel.ka-solo .khead button[data-kt="code"] { display: none; }
  #kpanel.ka-solo .kstage { display: none; }
  #kpanel .ka-ctx { flex: 1; min-width: 0; font: 800 13.5px 'Noto Sans KR', sans-serif; color: #2b3038; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #kpanel .ka-ctx small { color: #9aa1ab; font-weight: 700; margin-right: 6px; }
  #kpanel .khead .ka-ic { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px; border-radius: 99px; background: #f2f3f6; color: #2b3038; font: 800 12.5px 'Noto Sans KR', sans-serif; position: relative; transition: background .15s, transform .08s; }
  #kpanel .khead .ka-ic svg { flex: none; }
  #kpanel .khead .ka-ic:hover { background: #e6e8ec; } #kpanel .khead .ka-ic:active { transform: scale(0.96); }
  #kpanel .khead .ka-ic .dot { position: absolute; top: -1px; right: -1px; width: 9px; height: 9px; border-radius: 99px; background: #0F766E; box-shadow: 0 0 0 2px #fff; }
  /* 웹 검색 — 입력창 안, 보내기 단추 왼쪽(사용자 지정 2026-09-30). 켜면 파랑 */
  .ka-webin { flex: none; align-self: center; display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border-radius: 99px; border: 0; background: #f2f3f6; color: #545b66; font: 800 12px 'Noto Sans KR', sans-serif; cursor: pointer; transition: background .15s, color .15s, transform .08s; }
  .ka-webin:hover { background: #e6e8ec; } .ka-webin:active { transform: scale(0.98); }
  .ka-webin.on { background: #E8EEFD; color: #0F766E; }
  #kpanel.ka-solo .khead .kx { margin-left: 0; width: 34px; height: 34px; padding: 0; border-radius: 10px; }
  .ka-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #eceef1; font: 700 12px 'Noto Sans KR', sans-serif; color: #545b66; flex-wrap: nowrap; min-width: 0; position: relative; }
  .ka-seg { flex: none; } .ka-seg button { white-space: nowrap; }
  .ka-seg button .ok { display: inline-block; width: 6px; height: 6px; border-radius: 99px; background: #22c55e; margin-left: 5px; vertical-align: 2px; }
  .ka-more { margin-left: auto; flex: none; border: 0; background: transparent; border-radius: 8px; width: 30px; height: 28px; font: 900 16px 'Noto Sans KR', sans-serif; color: #545b66; cursor: pointer; }
  .ka-more:hover { background: #f2f3f6; }
  .ka-menu { position: absolute; right: 10px; top: calc(100% - 4px); z-index: 5; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(20,24,40,.16); padding: 6px; min-width: 190px; display: none; }
  .ka-menu.on { display: block; }
  .ka-menu button { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 9px 12px; font: 700 13px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .ka-menu button:hover { background: #f2f3f6; } .ka-menu .sub { font-size: 11.5px; color: #7a828e; padding: 4px 12px 6px; }
  .ka-connect { margin-left: auto; flex: none; border: 0; background: #16181d; color: #fff; border-radius: 99px; padding: 5px 12px; font: 800 12px 'Noto Sans KR', sans-serif; cursor: pointer; }
  .ka-seg { display: inline-flex; background: #f2f3f6; border-radius: 99px; padding: 2px; }
  .ka-seg button { border: 0; background: transparent; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #545b66; cursor: pointer; }
  .ka-seg button.on { background: #16181d; color: #fff; }
  /* 모델 · 노력 — 한 단추(지금 설정을 보여 줌)를 누르면 판이 열려 둘을 함께 고른다(사용자 지정 2026-10-01 "모델 선택과 노력 수치를 한 버튼으로") */
  .ka-mdl { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid #e3e6ea; border-radius: 99px; background: #fff; color: #2b3038; font: 800 12px 'Noto Sans KR', sans-serif; cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s, transform .08s; }
  .ka-mdl span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ka-mdl i { flex: none; font-style: normal; color: #9aa1ab; font-size: 9px; transition: transform .15s; }
  .ka-mdl:hover { background: #f7f8fa; } .ka-mdl:active { transform: scale(0.98); } .ka-mdl.on { border-color: #0F766E; box-shadow: 0 0 0 3px rgba(65,106,240,.12); } .ka-mdl.on i { transform: rotate(180deg); }
  .ka-mpop { position: absolute; left: 12px; top: calc(100% - 2px); z-index: 6; width: min(340px, calc(100% - 24px)); max-height: min(70dvh, 560px); overflow-y: auto; background: #fff; border-radius: 14px; box-shadow: 0 12px 34px rgba(20,24,40,.22); padding: 12px 12px 10px; display: none; font: 600 12.5px/1.45 'Noto Sans KR', sans-serif; color: #2b3038; }
  .ka-mpop.on { display: block; }
  @media (max-width: 640px) { .ka-mpop { max-height: max(180px, calc(var(--kh, 58dvh) - 110px)); } }   /* 폰은 아래에서 올라오는 판 안 — 판 높이 안에서 스크롤 */
  .ka-mpop h5 { margin: 2px 2px 6px; font: 900 11.5px 'Noto Sans KR', sans-serif; color: #7a828e; letter-spacing: .02em; } .ka-mpop h5 ~ h5, .ka-mpop .chips ~ h5 { margin-top: 12px; }
  .ka-mpop .opt { display: flex; align-items: flex-start; gap: 9px; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 10px; padding: 7px 8px; cursor: pointer; font: inherit; color: inherit; }
  .ka-mpop .opt:hover { background: #f2f3f6; } .ka-mpop .opt.on { background: #f3f6ff; }
  .ka-mpop .opt .rd { flex: none; width: 15px; height: 15px; margin-top: 2px; border-radius: 99px; border: 2px solid #c9ced6; box-sizing: border-box; } .ka-mpop .opt.on .rd { border-color: #0F766E; background: radial-gradient(#0F766E 42%, transparent 46%); }
  .ka-mpop .opt b { display: block; font-weight: 800; } .ka-mpop .opt small { display: block; color: #7a828e; font-weight: 600; font-size: 11.5px; }
  .ka-mpop .chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 2px; }
  .ka-mpop .chips button { border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; padding: 4px 11px; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; } .ka-mpop .chips button:hover { background: #f2f3f6; }
  .ka-mpop .chips button.on { background: #16181d; border-color: #16181d; color: #fff; }
  .ka-mpop .efnote { margin: 7px 2px 0; color: #545b66; font-size: 11.8px; font-weight: 600; }
  .ka-mpop .mfoot { margin: 10px 2px 0; padding-top: 9px; border-top: 1px solid #eceef1; color: #8b929c; font-size: 11.5px; font-weight: 600; }
  .ka-new { margin-left: auto; border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; width: 28px; height: 26px; padding: 0; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .ka-acct ~ .ka-new { margin-left: 0; }
  .ka-acct { margin-left: auto; border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .ka-acct.on { border-color: #d97706; color: #92400e; background: #fffbeb; }
  .ka-web { flex: none; border-width: 1px; border-style: solid; border-color: #e3e6ea; background: #fff; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #545b66; cursor: pointer; transition: transform .08s, background .15s, color .15s, border-color .15s; }
  .ka-web:hover { background: #f2f3f6; } .ka-web:active { transform: scale(0.98); }
  .ka-web.on { border-color: #0F766E; background: #E8EEFD; color: #0F766E; }
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
  #ka-login button.go { background: #16181d; color: #fff; } #ka-login a.open { display: inline-block; margin: 4px 0; font-weight: 800; color: #0F766E; }
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
  #kpanel.ka-drop .kc-box { border-color: #0F766E; box-shadow: 0 0 0 3px rgba(65,106,240,.18); }
  #kpanel.ka-drop .kc-box textarea::placeholder { color: #0F766E; }

  .ka-att:disabled { opacity: .4; cursor: default; }
  .ka-uthumbs { display: flex; gap: 4px; justify-content: flex-end; margin-top: 6px; } .ka-uthumbs img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
  .ka-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; } .ka-shots.one { grid-template-columns: 1fr; } .ka-shots img { width: 100%; display: block; border-radius: 6px; }
  .ka-shots .tag { position: absolute; left: 8px; top: 8px; padding: 2px 9px; border-radius: 99px; font: 800 11.5px 'Noto Sans KR', sans-serif; color: #fff; background: #0F766E; } .ka-shots .tag.del { background: #b91c1c; }
  .ka-more-shots { padding: 0 8px 8px; font: 700 12px 'Noto Sans KR', sans-serif; color: #7a828e; }
  /* 대화 목록(대화방) — 패널 위로 왼쪽에서 밀려 나오는 서랍. TOSS: 행 높이 64 · hover 틴트 · 누르면 scale(0.98) · 뜨는 효과 없음 */
  .ka-hist { position: relative; border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; padding: 4px 10px; font: 800 12px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; transition: transform .08s, background .15s; }
  .ka-hist:hover { background: #f2f3f6; } .ka-hist:active, .ka-new:active, .ka-acct:active { transform: scale(0.98); }
  .ka-hist .dot { position: absolute; top: -2px; right: -2px; width: 9px; height: 9px; border-radius: 99px; background: #0F766E; box-shadow: 0 0 0 2px #fff; animation: ka-pulse 1.4s ease-in-out infinite; }
  /* 닫힌 서랍은 패널 왼쪽 밖(무대 위)에 걸려 보이지 않게 — 밀려 나간 뒤 숨긴다 */
  #ka-th { position: absolute; inset: 0; z-index: 5; background: #fff; display: flex; flex-direction: column; transform: translateX(-104%); opacity: 0; visibility: hidden; transition: transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s, visibility 0s linear .28s; box-shadow: 8px 0 30px rgba(0,0,0,.08); }
  #ka-th.on { transform: none; opacity: 1; visibility: visible; transition: transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s; }
  #ka-th .hd { display: flex; align-items: center; gap: 8px; padding: 16px 16px 10px; }
  #ka-th .hd h4 { margin: 0; font: 900 18px 'Noto Sans KR', sans-serif; letter-spacing: -.02em; margin-right: auto; }
  #ka-th .hd button { border: 0; border-radius: 99px; height: 34px; padding: 0 14px; font: 800 13px 'Noto Sans KR', sans-serif; cursor: pointer; background: #f2f3f6; color: #16181d; transition: transform .08s, background .15s; }
  #ka-th .hd button.go { background: #16181d; color: #fff; } #ka-th .hd button:active { transform: scale(0.98); }
  #ka-th .hd .x { width: 34px; padding: 0; font-size: 16px; background: none; }
  #ka-th .ls { flex: 1; overflow-y: auto; padding: 4px 8px 16px; }
  #ka-th .row { position: relative; display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px 40px 10px 12px; border-radius: 14px; cursor: pointer; transition: background .15s, transform .08s; animation: ka-in .32s cubic-bezier(.2,.8,.2,1) both; }
  #ka-th .row:hover { background: #f2f3f6; } #ka-th .row:active { transform: scale(0.98); }
  #ka-th .row.cur { background: #E8EEFD; }
  #ka-th .row .tx { flex: 1; min-width: 0; }
  #ka-th .row .tt { font: 800 15px/1.4 'Noto Sans KR', sans-serif; color: #16181d; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  #ka-th .row .sb { font: 600 12.5px 'Noto Sans KR', sans-serif; color: #8b929c; margin-top: 2px; display: flex; gap: 6px; align-items: center; }
  #ka-th .row .run { color: #0F766E; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; }
  #ka-th .row .pd { color: #92400e; background: #fffbeb; border-radius: 99px; padding: 0 7px; font-weight: 800; }
  #ka-th .row .run i { width: 7px; height: 7px; border-radius: 99px; background: #0F766E; animation: ka-pulse 1.4s ease-in-out infinite; }
  #ka-th .row .del { position: absolute; right: 8px; top: 50%; margin-top: -15px; width: 30px; height: 30px; border: 0; border-radius: 99px; background: transparent; color: #8b929c; font-size: 13px; cursor: pointer; opacity: 0; transition: opacity .15s, background .15s; }
  #ka-th .row:hover .del { opacity: 1; } #ka-th .row .del:hover { background: #e6e8ec; color: #b91c1c; }
  @media (hover: none) { #ka-th .row .del { opacity: 1; } }
  #ka-th .row.gone { animation: ka-out .22s ease both; }
  #ka-th .em { text-align: center; color: #545b66; padding: 60px 16px; font: 600 14px/1.6 'Noto Sans KR', sans-serif; } #ka-th .em b { display: block; font-size: 16px; color: #16181d; margin-bottom: 4px; }
  #ka-th .sk { height: 52px; margin: 8px 12px; border-radius: 12px; background: linear-gradient(90deg, #f2f3f6 25%, #e9ebef 50%, #f2f3f6 75%); background-size: 200% 100%; animation: ka-sk 1.1s linear infinite; }
  /* 대화방을 바꾸면 말풍선이 살짝 올라오며 나타난다 · 새 말풍선도 */
  #kpanel .kc-list.ka-swap > * { animation: ka-in .3s cubic-bezier(.2,.8,.2,1) both; }
  #kpanel .ka-pop { animation: ka-in .28s cubic-bezier(.2,.8,.2,1) both; }
  .ka-live::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 99px; background: #7c3aed; margin-right: 6px; vertical-align: middle; animation: ka-pulse 1.4s ease-in-out infinite; }
  .ka-toast { position: absolute; left: 50%; bottom: 96px; z-index: 6; transform: translateX(-50%); background: #16181d; color: #fff; border-radius: 99px; padding: 8px 16px; font: 700 13px 'Noto Sans KR', sans-serif; white-space: nowrap; animation: ka-toast 2.4s ease both; pointer-events: none; }
  @keyframes ka-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes ka-out { to { opacity: 0; transform: translateX(-24px); height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; } }
  @keyframes ka-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.8); } }
  @keyframes ka-sk { to { background-position: -200% 0; } }
  @keyframes ka-toast { 0% { opacity: 0; transform: translate(-50%, 8px); } 12%, 80% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { #ka-th, #ka-th .row, #kpanel .kc-list.ka-swap > *, #kpanel .ka-pop { transition: none; animation: none; } }
  #ka-login a.cl { margin-right: auto; align-self: center; font: 800 13px 'Noto Sans KR', sans-serif; color: #0F766E; text-decoration: none; }
  `;
  const A = {
    // 엔진 — 고른 적 없으면 구독이 연결돼 있으면 Claude Code, 아니면 gemma
    get engine() { const e = ls.get('deckagent.engine'); return A.me && !A.me.local ? 'claude' : (e === 'claude' || e === 'gemma' ? e : 'claude'); },   // 로컬 LLM 이 없으면 늘 Claude set engine(v) { ls.set('deckagent.engine', v); },
    get model() { return ls.get('deckagent.model') ?? 'sonnet'; }, set model(v) { ls.set('deckagent.model', v); },
    // 노력(effort) — Claude Code --effort. 기본 medium(고른 값 없을 때). 「노력 자동」 = 작은 수정 medium · 큰 수정 / 여러 장 high · 설명(Haiku)은 주지 않음(사용자 지정 2026-09-30 "effort 도 조절")
    get effort() { return ls.get('deckagent.effort') ?? 'medium'; }, set effort(v) { ls.set('deckagent.effort', v); },
    // 웹 검색 — Claude Code 엔진에서만(검색은 Claude 쪽 도구). 켠 부탁만 검색 · 웹 읽기가 열리고, 가져온 사실엔 출처를 단다(사용자 지정 2026-09-30)
    get web() { return ls.get('deckagent.web') === '1'; }, set web(v) { ls.set('deckagent.web', v ? '1' : null); },
    // 연결 여부 — 토큰 자체는 서버(계정)에만. 'server' 는 자리표시(서버가 이 값을 무시하고 계정 토큰을 붙인다). 끊기 = 서버에서 지운다
    me: null,
    get token() { return A.me?.claude ? 'server' : ''; },
    set token(v) { if (!A.me) return; if (v) { A.me.claude = true; return; } if (A.me.claude) K.post('/api/me/claude/disconnect', {}).catch(() => {}); A.me.claude = false; },
    // 지금 대화방 — 덱마다 이 브라우저가 마지막으로 연 방(다른 기기에서는 가장 최근 방이 열린다)
    get thread() { return ls.get(`deckagent.thread:${location.pathname}`) || ''; }, set thread(v) { ls.set(`deckagent.thread:${location.pathname}`, v || null); },
    newId() { const b = new Uint8Array(6); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); },
    gen: 0,      // 대화방을 바꿀 때마다 +1 — 앞 방의 따라 보기가 새 방 화면을 건드리지 않게
    sess: null,  // 이어 묻기 — 대화 기억(Claude Code 세션)만 잇는다 {e: 엔진, id}. 사본은 부탁마다 지금 파일에서 새로(사용자 지정 2026-09-30 "심플하게")
    init() {
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      // 부탁 — Claude Code 엔진이 켜져 있으면 가로챈다(예전 방식의 자가검증 · 되묻기 차례는 그대로 예전 길로)
      const ask0 = K.ask.bind(K); A.ask0 = ask0;
      K.ask = (q, opts = {}) => {
        setTimeout(() => A.quota(true), 2500);
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
      K.renderChat = (body) => { rc0(body); A.bar(body); A.attachUI(body); A.decorate(body); A.lock(); A.popNew(body);  };
      const um0 = K.updateMsg.bind(K); K.updateMsg = (i) => { um0(i); A.lock(); };
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ka]'); if (!b) return;
        const i = Number(b.dataset.mi); const m = K.chat[i];
        if (b.dataset.ka === 'apply') A.apply(i, b); else if (b.dataset.ka === 'discard') { A.discard(i); K.updateMsg(i); K.render(); }
        else if (b.dataset.ka === 'go') { m.agent.go = true; A.mark(i, { go: true }); K.updateMsg(i); const g = m.agent.o || {}; A.ask('계획대로 진행해 주세요. 끝나면 고친 페이지마다 화면을 찍어 확인해 주세요.', { files: m.agent.files, docs: m.agent.docs, model: g.model, effort: g.effort, kind: '여러 장 · 진행' }); }
        else if (b.dataset.ka === 'cancel') { m.agent.cancelled = true; A.mark(i, { cancelled: true }); K.updateMsg(i); K.render(); }
        else if (b.dataset.ka === 'w-claude' || b.dataset.ka === 'w-gemma' || b.dataset.ka === 'w-cancel') A.decide(i, b.dataset.ka.slice(2));
      });
      // 그림 끌어 놓기 — 패널 어디에 놓아도 첨부
      const kp = document.querySelector('#kpanel');
      const hasFile = (e) => [...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file');
      kp?.addEventListener('dragover', (e) => { if (hasFile(e)) { e.preventDefault(); kp.classList.add('ka-drop'); } });
      kp?.addEventListener('dragleave', (e) => { if (!kp.contains(e.relatedTarget)) kp.classList.remove('ka-drop'); });
      kp?.addEventListener('drop', (e) => { kp.classList.remove('ka-drop'); const fs = e.dataTransfer?.files; if (fs?.length) { e.preventDefault(); A.addFiles(fs); } });
      if (document.body.classList.contains('kchatmode')) K.render();
      // 캡처용 사본(.deckpreview-* · .deckagent-*)에서는 계정 · 지난 대화를 부르지 않는다 — 서버 안 크롬이 여는 숨김 파일이다
      if (/\/\.[^/]*$/.test(location.pathname)) return;
      fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then(async (j) => { A.me = j.user; K.render(); A.quota(); if (/[?&]new=1\b/.test(location.search)) A.build(); else await A.resume(); }).catch(() => {});
    },
    // ── 데모 한도 — 오른쪽 아래 위젯. /api/me 의 demo 값(조회만)으로 그린다 ──
    quota(refresh) {
      if (A.me?.role !== 'demo') return;
      if (refresh) return fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j.user) { A.me = j.user; A.quota(); } }).catch(() => {});
      const d = A.me.demo; if (!d) return;
      let w = document.getElementById('kq');
      if (!w) {
        w = document.createElement('div'); w.id = 'kq'; w.innerHTML = '<div class="qp" hidden></div><button class="qb" aria-expanded="false"><span class="ring"></span><span class="qt"></span></button>'; document.body.appendChild(w);
        const p = w.querySelector('.qp'), b = w.querySelector('.qb');
        b.onclick = (e) => { e.stopPropagation(); p.hidden = !p.hidden; b.setAttribute('aria-expanded', !p.hidden); if (!p.hidden) A.quota(true); };
        document.addEventListener('click', (e) => { if (!w.contains(e.target)) { p.hidden = true; b.setAttribute('aria-expanded', false); } });
        setInterval(() => { if (!document.hidden) A.quota(true); }, 20000);
      }
      const mins = (s) => { const m = Math.ceil(s / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
      const row = (t, u, m, note) => `<div class="qr" style="${u >= m ? '--qc:#b45309' : ''}"><div class="top"><span>${t}</span><span>${u} / ${m}</span></div><div class="qbar"><i style="--v:${Math.min(1, u / m)}"></i></div><p>${note}</p></div>`;
      const left = Math.max(0, d.runsMax - d.runs), out = left === 0 || d.day >= d.dayMax;
      w.querySelector('.qt').textContent = out ? 'AI 부탁 한도 — 시연 요청은 메일로' : `AI 부탁 ${left}/${d.runsMax} 남음`;
      const ring = w.querySelector('.ring'); ring.style.setProperty('--p', left / d.runsMax); ring.style.setProperty('--qc', out ? '#b45309' : '#0F766E');
      w.querySelector('.qp').innerHTML = '<h3>데모 사용 한도</h3>'
        + row('AI 부탁 · 이 데모', d.runs, d.runsMax, `데모 하나(사본 자료 묶음)마다 ${d.runsMax}번입니다. 질문 · 수정 모두 1번씩 셉니다. 다 쓰면 첫 화면에서 데모를 다시 시작하면 원본 사본과 함께 새로 ${d.runsMax}번입니다.`)
        + row('AI 부탁 · 사이트 전체 오늘', d.day, d.dayMax, '모든 데모 방문자를 합친 하루 횟수입니다. 한국 시간 0시에 다시 0이 됩니다.')
        + `<div class="qf">${out ? `<b>한도에 걸렸나요?</b> 시연을 원하시면 <a href="mailto:${d.contact}">${d.contact}</a> 으로 연락 주세요.<br>` : `더 보고 싶으시면 <a href="mailto:${d.contact}">${d.contact}</a> 으로 연락 주세요.<br>`}이 데모와 고친 사본은 <b>${mins(d.expIn)}</b> 뒤 지워집니다. 데모의 AI 는 개인 Claude 구독으로 돌아가서 한도를 둡니다.</div>`;
    },
    // ── 새 덱 처음 만들기 — 목록에서 받은 정보(brief.json)를 서버가 부탁으로 만든다(Opus · 노력 high). 끝나면 곧바로 적용(빈 표지뿐이라 잃을 것이 없고, 백업은 남는다)
    async build() {
      history.replaceState(null, '', location.pathname + location.hash);   // 새로고침해도 두 번 만들지 않게
      let b = {}; try { b = await (await fetch('brief.json', { cache: 'no-store' })).json(); } catch (e) { /* 없으면 제목만 */ }
      K.open('ai');
      const q = `받은 정보로 새 발표 자료를 만들어 주세요${b.audience ? ` — 보는 사람: ${b.audience}` : ''}${b.key ? ` · 핵심: ${b.key}` : ''}`;
      A.thread = A.newId();
      // 새로 만들기 = Sonnet 5.5 · 설문에서 고른 노력(빠르게 medium · 자세하게 high, 기본 high). Opus 는 쓰지 않는다 —
      // 30쪽 PDF 비교(2026-09-30): Sonnet high 9분 · 17페이지 · 숫자 74/74 가 Opus high 13분 · 16페이지보다 빠르고 촘촘했다(사용자 지정 "opus high 는 쓰지 마")
      const ef = b.effort === 'medium' ? 'medium' : 'high';
      const go = () => A.ask(q, { build: true, model: 'sonnet', effort: ef, kind: '새로 만들기' });
      if (A.token) go(); else { A.afterLogin = go; A.login(); }
    },
    // ── 그림 첨부(사용자 지정 2026-09-30) — [그림] 버튼 · 붙여넣기(Ctrl/⌘+V) · 끌어 놓기, 3장까지. 폰 사진이 커서 긴 변 1600px 로 줄인다
    //    (/api/ask 본문 3MB · /api/asset 8MB 상한). 작은 png 는 그대로 둔다(로고 등 투명 배경을 지키려고)
    files: [],
    take() { const f = A.files; A.files = []; A.drawFiles(); return f; },
    async addFiles(list) {
      const ok = [...list].filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type) || DOC_RE.test(f.name));
      const big = ok.find((f) => DOC_RE.test(f.name) && f.size > 25e6); if (big) A.toast(`「${big.name}」 은 25MB 를 넘어 뺐어요`, 3600);
      for (const file of ok.filter((f) => !(DOC_RE.test(f.name) && f.size > 25e6)).slice(0, Math.max(0, 3 - A.files.length))) A.files.push(DOC_RE.test(file.name) ? await A.prepDoc(file) : await A.prep(file));
      A.drawFiles();
    },
    // 문서는 줄이지 않고 그대로(서버가 글을 뽑는다)
    prepDoc(file) { return new Promise((ok, no) => { const rd = new FileReader(); rd.onerror = no; rd.onload = () => ok({ name: file.name, data: rd.result, thumb: docThumb(file.name), doc: true }); rd.readAsDataURL(file); }); },
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
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif,.pdf,.pptx,.docx,application/pdf'; inp.multiple = true; inp.style.display = 'none';
      inp.onchange = () => { A.addFiles(inp.files); inp.value = ''; }; comp.appendChild(inp);
      const bt = document.createElement('button'); bt.className = 'ka-att'; bt.type = 'button'; bt.textContent = '+'; bt.title = '그림 · 문서(PDF · PPT · 워드) 첨부 — 붙여넣기(Ctrl/⌘+V) · 채팅창에 끌어 놓기도 됨, 3개까지';
      bt.onclick = () => inp.click(); box.insertBefore(bt, box.firstChild);
      // 웹 검색 켜기 — Claude 구독 엔진에서만 된다(gemma 는 LiteLLM 경유라 검색 도구가 없다)
      const send = box.querySelector('.kc-send');
      if (A.engine === 'claude' && A.token && send && A.me?.role !== 'demo') {   // 데모는 웹 검색을 쓰지 않는다(서버도 끈다)
        const wb = document.createElement('button'); wb.type = 'button'; wb.className = `ka-webin${A.web ? ' on' : ''}`; wb.innerHTML = `${IC.web}웹`;
        wb.title = '켜면 AI 가 웹에서 찾아 넣는다 — 가져온 사실엔 출처를 달고, 검색 결과에 나온 주소만 연다';
        wb.onclick = () => { A.web = !A.web; wb.classList.toggle('on', A.web); A.toast(A.web ? '웹 검색 켬 — 필요하면 웹에서 찾아 출처와 함께 넣어요' : '웹 검색 끔'); };
        box.insertBefore(wb, send);
      }
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
      // [값, 이름, 설명] — 값 ''(계정 기본)은 --model 을 주지 않는다. 구독 등급에 따라 못 쓰는 모델이 있을 수 있다
      const MODELS = [['auto', '모델 자동', '설명은 Haiku · 수정은 Sonnet — 부탁 종류를 보고 알아서'], ['opus', 'Opus 5.5', '가장 강하지만 느리고 사용량이 많음'], ['sonnet', 'Sonnet 5.5', '균형 — 새로 만들기도 이 모델'], ['haiku', 'Haiku 4.5', '빠르고 가벼움 — 설명 위주'], ['', '계정 기본', '내 구독 계정에 정해 둔 모델']];
      // [값, 칩 글자, 단추 글자, 설명] — 노력(effort)이 높을수록 오래 생각하고 사용량이 는다
      const EFFORTS = [['auto', '자동', '자동', '작은 수정은 medium · 큰 수정 · 여러 페이지는 high · 설명은 지정하지 않음'], ['low', 'low', 'low', '가장 빠름 — 간단한 글 고치기'], ['medium', 'medium', 'med', '보통 — 대부분의 수정 (기본)'],
        ['high', 'high', 'high', '오래 생각함 — 큰 수정 · 레이아웃, 사용량이 늘어남'], ['xhigh', 'xhigh', 'xhigh', '더 깊게 — 매우 오래 걸리고 사용량이 많음'], ['max', 'max', 'max', '최대 — 가장 오래 걸리고 사용량이 가장 많음']];
      const bar = document.createElement('div'); bar.className = 'ka-bar';
      bar.innerHTML = `<span class="ka-seg">${A.me?.local ? `<button data-e="gemma" class="${cc ? '' : 'on'}" title="로컬 LLM — 설명은 빠른 답, 수정은 생각 켜고 사본을 고치며 화면으로 확인">로컬</button>` : ''}<button data-e="claude" class="${cc ? 'on' : ''}" title="${sub ? 'Claude Code — 내 Claude 구독 연결됨' : 'Claude Code — 내 Claude 구독으로'}">Claude${sub ? '<i class="ok"></i>' : ''}</button></span>`
        + (cc && sub && A.me?.role !== 'demo' ? `<button class="ka-mdl" title="모델 · 노력(effort) 고르기"><span></span><i>▼</i></button><div class="ka-mpop" role="dialog" aria-label="모델 · 노력"></div>`
          + `<button class="ka-more" title="사용량 · 구독 연결">⋯</button><div class="ka-menu"><button data-m="use">남은 사용량 보기</button>${A.me?.shared ? '' : '<button data-m="acct">구독 연결 끊기</button>'}<div class="sub">${A.me?.shared ? '주인 구독을 같이 씀' : 'Claude 구독 연결됨'}</div></div>` : '')
        + (cc && !sub ? '<button class="ka-connect ka-acct">Claude 구독 연결</button>' : '');
      top.after(bar);
      // 윗줄(khead) — 덱 · 페이지 이름과 아이콘 버튼. render 때마다 다시 붙이니 전 것을 먼저 뗀다
      const P = document.querySelector('#kpanel'); const head = P?.querySelector('.khead');
      if (head) {
        P.classList.toggle('ka-solo', !!K.cfg.noCode);
        head.querySelectorAll('.ka-ctx, .ka-ic').forEach((e) => e.remove());
        const kx = head.querySelector('.kx');
        const ctx = document.createElement('div'); ctx.className = 'ka-ctx'; const cur = K.cfg.current()?.dataset.name || '';
        ctx.innerHTML = `<small>AI</small>${esc(cur)}`; ctx.title = `${K.cfg.deck} · ${cur}`;
        const ic = (t, title, fn, dot) => { const x = document.createElement('button'); x.className = 'ka-ic'; x.title = title; x.innerHTML = t + (dot ? '<span class="dot"></span>' : ''); x.onclick = fn; return x; };
        if (K.cfg.noCode) head.insertBefore(ctx, kx);
        const th = ic(`${IC.list}대화 목록`, '지난 대화 보기 · 바꾸기', () => A.showThreads(), A.otherRunning); th.classList.add('ka-th'); head.insertBefore(th, kx);
        head.insertBefore(ic(`${IC.edit}새 대화`, '새 대화 시작', () => A.newThread()), kx);
      }
      top.style.display = 'none';
      bar.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { A.engine = b.dataset.e; K.render(); }; });
      // 모델 · 노력 단추 + 판 — 고르면 바로 적용(판은 열어 둔 채 단추 글만 바뀐다), 바깥을 누르거나 Esc 면 닫는다
      const mb0 = bar.querySelector('.ka-mdl'), pop = bar.querySelector('.ka-mpop');
      if (mb0 && pop) {
        const mi = Math.max(0, MODELS.findIndex((m) => m[0] === A.model)); const ei = Math.max(0, EFFORTS.findIndex((x) => x[0] === A.effort));
        const paint = () => {
          const m = MODELS.find((x) => x[0] === A.model) || MODELS[mi], f = EFFORTS.find((x) => x[0] === A.effort) || EFFORTS[ei];
          mb0.querySelector('span').textContent = A.model === 'auto' && A.effort === 'auto' ? '모델 · 노력 자동' : `${m[1]} · ${A.effort === 'auto' ? '노력 자동' : f[2]}`;
          mb0.title = `모델 ${m[1]} · 노력 ${f[1]} — 눌러서 바꾸기`;
          pop.innerHTML = '<h5>모델</h5>' + MODELS.map(([v, n, d]) => `<button class="opt${A.model === v ? ' on' : ''}" data-mv="${v}"><span class="rd"></span><span><b>${n}</b><small>${d}</small></span></button>`).join('')
            + '<h5>노력 (effort)</h5><div class="chips">' + EFFORTS.map(([v, n]) => `<button class="${A.effort === v ? 'on' : ''}" data-ev="${v}">${n}</button>`).join('') + `</div><div class="efnote">${f[3]}</div>`
            + '<div class="mfoot">새로 만들기는 이 설정과 상관없이 Sonnet 5.5 로 합니다(설문에서 고른 빠르게 · 자세하게).</div>';
        };
        paint();
        mb0.onclick = (e) => { e.stopPropagation(); const on = !pop.classList.contains('on'); pop.classList.toggle('on', on); mb0.classList.toggle('on', on); };
        pop.onclick = (e) => { e.stopPropagation(); const o = e.target.closest('[data-mv]'), f = e.target.closest('[data-ev]'); if (o) A.model = o.dataset.mv; if (f) A.effort = f.dataset.ev; if (o || f) paint(); };
        if (!A._mpBound) { A._mpBound = true;
          const shut = () => document.querySelectorAll('.ka-mpop.on').forEach((x) => { x.classList.remove('on'); x.parentElement?.querySelector('.ka-mdl')?.classList.remove('on'); });
          document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.ka-mpop, .ka-mdl')) shut(); }, true);
          document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); }, true); }
      }
      const mn = bar.querySelector('.ka-menu'); const mb = bar.querySelector('.ka-more');
      if (mb && mn) { mb.onclick = (e) => { e.stopPropagation(); mn.classList.toggle('on'); }; document.addEventListener('click', () => mn.classList.remove('on'), { once: true });
        mn.querySelector('[data-m="use"]').onclick = () => { mn.classList.remove('on'); A.usage(); };
        const ab = mn.querySelector('[data-m="acct"]'); if (ab) ab.onclick = () => { mn.classList.remove('on'); if (confirm('Claude 구독 연결을 끊을까요? (내 계정에 저장된 연결을 지웁니다)')) { A.token = ''; K.render(); } }; }   // 주인 구독을 같이 쓰는 계정엔 '연결 끊기'가 없다
      const ac = bar.querySelector('.ka-connect'); if (ac) ac.onclick = () => A.login();
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
        body = j.rows.length ? j.rows.map((r) => { const p = Math.max(0, Math.min(100, Number(r.pct) || 0)); const col = p >= 90 ? '#DC2626' : p >= 70 ? '#d97706' : '#0F766E';
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
      // 문서(PDF · PPT · 워드)는 Claude Code 만 읽는다 — gemma 빠른 답 · LiteLLM 경유 도구에는 문서를 넘길 길이 없다
      if (A.engine !== 'claude' && att.some((f) => f.doc)) { A.toast('문서(PDF · PPT · 워드)는 Claude Code 에서만 읽어요 — 위에서 Claude 로 바꿔 주세요', 4200); K.draft = q; A.files = att; K.render(); return; }
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
      if (A.engine === 'claude') return A.ask(q, { model: A.model === 'auto' ? { 설명: 'haiku', '작은 수정': 'sonnet', '큰 수정': 'sonnet', '여러 장': 'sonnet' }[kind] : '', effort: { '작은 수정': 'medium', '큰 수정': 'high', '여러 장': 'high' }[kind] || '', kind, att, plan, noUser: o2.noUser });
      // gemma 로 여러 장 · 레이아웃(큰 수정)은 바로 돌리지 않고 묻는다 — 벤치에서 레이아웃 과제는 거의 실패, 여러 장은 계획부터 어긋났다
      // (사용자 지정 2026-09-30 "로컬 llm 으로는 안 될 것 같다, Claude Code 로 돌리기 · 무시하고 진행 버튼으로")
      if (!o2.forceGemma && (kind === '여러 장' || kind === '큰 수정')) return A.warn(q, att, kind);
      if (kind === '설명') {
        await ask0(q, { noEdit: true, userImages: att.map((f) => f.data), thumbs: att.map((f) => f.thumb) }); const m = K.chat[K.chat.length - 1];
        if (m?.role === 'assistant') { m.model = '빠른 답 · 로컬 LLM'; K.updateMsg(K.chat.length - 1);
          // 빠른 답은 Claude Code 작업이 아니라 서버 기록이 없다 — 대화방에 따로 남겨 다시 열 때 같이 보이게
          if (m.text && !m.err && !m.stopped) K.post('/api/agent/note', { file: location.pathname, thread: A.thread || (A.thread = A.newId()), prompt: q, slide: m.slide, text: m.text, model: '로컬 LLM' }).then(() => A.refreshThreads()).catch(() => {}); }
        return;
      }
      return A.ask(q, { att, plan, kind, noUser: o2.noUser });
    },
    // gemma 안내 카드 — [Claude Code 로 하기] · [무시하고 진행] · [취소]. 떠 있는 동안은 수정안 카드처럼 새 부탁을 막는다
    warn(q, att, kind) {
      const slide = K.cfg.current().dataset.name;
      K.chat.push({ role: 'user', text: q, slide, ...(att.length ? { thumbs: att.map((f) => f.thumb) } : {}) });
      K.chat.push({ role: 'assistant', text: '', slide, root: q, agent: { warn: true, done: true, kind, att, steps: [] }, model: `로컬 LLM · ${kind.replace(/장/g, '페이지')}` });
      K.draft = ''; K.render();
    },
    decide(i, how) {
      const m = K.chat[i]; const g = m.agent; if (g.decided) return; g.decided = how; K.updateMsg(i);
      if (how === 'cancel') { K.render(); return; }
      // 다시 판단하지 않는다(판단이 바뀌면 헷갈린다) — 이 카드의 종류 그대로 보낸다
      const plan = g.kind === '여러 장';
      if (how === 'gemma') return A.ask(m.root, { att: g.att, plan, kind: g.kind, noUser: true });
      A.engine = 'claude'; K.render();
      const go = () => A.ask(m.root, { att: g.att, plan, kind: g.kind, noUser: true, model: A.model === 'auto' ? 'sonnet' : '', effort: A.effort === 'auto' ? 'high' : '' });   // 자동이면 Sonnet · high — Opus high 는 사람이 패널에서 고를 때만(사용자 지정 2026-09-30)
      if (A.token) go(); else { A.afterLogin = go; A.login(); }
    },

    // ── 부탁 ──
    async ask(q, o = {}) {
      if (K.busy) return;
      const slide = K.cfg.current().dataset.name;
      const att = o.att || [];
      if (!o.noUser) K.chat.push({ role: 'user', text: q, slide, ...(att.length ? { thumbs: att.map((f) => f.thumb) } : {}) });
      const a = A.newMsg(slide, q, o); K.chat.push(a); const ai = K.chat.length - 1;
      K.draft = ''; K.tab = 'ai'; document.body.classList.add('kside'); K.follow = 'pin'; K.render(); K.relayout();
      K.busy = true; K.ctrl = new AbortController(); K.setSend(); const t0 = performance.now();
      try {
        // 첨부 그림을 덱 폴더(img/uploads/)에 올린다 — Claude Code 가 작업 폴더 안에서 Read 로 연다. [진행] 차례는 계획 때 올린 경로를 그대로
        let files = o.files || []; let docs = o.docs || [];
        if (att.length) { a.agent.steps.push({ t: `첨부 ${att.length}개 올리기` }); K.updateMsg(ai);
          files = []; docs = []; for (const f of att) { const j = await K.post('/api/asset', { file: location.pathname, name: f.name, data: f.data.split(',')[1] });
            if (j.kind === 'doc') docs.push({ src: j.src, name: j.name, text: j.text, pages: j.pages }); else files.push(j.src); } }
        a.agent.files = files; a.agent.docs = docs;
        const r = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: K.ctrl.signal,
          body: JSON.stringify({ file: location.pathname, thread: A.thread || (A.thread = A.newId()), engine: a.agent.engine === 'sub' ? 'claude' : 'gemma', web: !!a.agent.o.web, slide, prompt: q, files, docs, plan: !!o.plan, build: !!o.build, kind: o.kind, session: A.sess?.e === a.agent.engine ? A.sess.id : undefined, model: o.model || (A.model === 'auto' ? '' : A.model) || undefined,
            effort: (o.build ? o.effort : A.effort === 'auto' ? o.effort : A.effort) || undefined }) });   // 새로 만들기는 패널 선택과 상관없이 자기 값(Opus · high)
        await A.read(r, a, ai);
      } catch (e) {
        // 멈춤 — 연결만 끊으면 서버가 계속 돌린다(창을 닫아도 계속되게 바꿨다) → 멈춤은 서버에 따로 알린다
        // 대화방을 바꿔 떠난 것(a._gen 이 옛것)은 멈춤이 아니다 — 서버는 계속 돌리고, 그 방에 돌아오면 이어서 보인다
        if (e.name === 'AbortError') { if (a._gen !== A.gen) return; a.stopped = true; if (a.agent.rid) K.post('/api/agent/stop', { file: location.pathname, rid: a.agent.rid }).catch(() => {}); } else a.err = e.message;
      }
      A.finish(a, ai, t0, true);
    },
    // 새 답 말풍선 — o: 모델 · 노력 · 종류 · 계획 여부(대화를 다시 그릴 때는 서버 메타에서)
    newMsg(slide, q, o = {}) { const eng = o.engine ? (o.engine === 'gemma' ? 'gemma' : 'sub') : (o.build || A.engine === 'claude' ? 'sub' : 'gemma');
      const web = o.web ?? (eng === 'sub' && !o.build && A.web);
      return { _gen: A.gen, role: 'assistant', text: '', slide, streaming: true, agent: { steps: [], engine: eng, quick: !!o.quick, plan: !!o.plan, build: !!o.build, o: { model: o.model, effort: o.effort, kind: o.kind, web } }, root: q }; },
    // 서버가 흘리는 줄(NDJSON)을 읽어 말풍선에 쌓는다 — 새 부탁 · 다시 열어 따라 보기 · 지난 대화 다시 그리기가 같은 길
    async read(r, a, ai) {
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1); if (!line) continue;
          A.feed(a, JSON.parse(line)); a.agent.n = (a.agent.n || 0) + 1; if (ai >= 0 && a._gen === A.gen) K.updateMsg(ai);
        }
      }
      if (!a.text && !a.err && !a.stopped && !a.agent.done) a.err = '답을 받지 못했습니다';
    },
    feed(a, j) {
      if (j.ping) return;
      if (j.rid && !a.agent.rid) a.agent.rid = j.rid;
      if (j.session) A.sess = { e: a.agent.engine, id: j.session };
      if (j.step) a.agent.steps.push({ t: j.step });
      if (j.stepErr) a.agent.steps.push({ t: j.stepErr.replace(/<\/?tool_use_error>/g, '').slice(0, 120), bad: true });
      if (j.think) a.think = (a.think || 0) + j.think;
      if (j.d) a.text = a.text ? `${a.text}\n\n${j.d}` : j.d;
      if (j.error) a.err = j.error;
      if (j.stopped) a.stopped = true;
      if (j.done) {
        Object.assign(a.agent, { done: true, rid: j.rid, changed: j.changed, slides: j.slides || [], added: j.added || [], removed: j.removed || [], more: j.more || 0, other: j.other, sec: j.sec, turns: j.turns, models: j.models || [], via: j.via || '' });
        if (j.result) a.text = j.result;   // 마지막 답만 남긴다(중간 설명은 단계로 충분)
        // 미리보기: 두 장 이상이거나 추가 · 삭제 페이지가 낀 경우는 타일로(서버가 이름마다 이전 · 이후 그림을 짝지어 준다). 바뀐 한 장뿐이면 예전처럼 크게
        if (j.shots?.length > 1 || (j.shots?.length === 1 && j.shots[0].kind !== 'change')) a.shots = j.shots;
        if (j.changed && j.before && j.after) {
          const d = window.DeckCheck ? window.DeckCheck.diff(j.before, j.after) : { problems: [], errors: [] };
          const s0 = j.shots?.[0];
          a.state = { jpg: (s0 && s0.after) || j.after.jpg, base: s0 ? s0.before : j.before.jpg, problems: d.problems, errors: d.errors };
        }
        if (j.applied) { a.agent.applied = j.applied; a.applied = j.applied; a.edit = { file: location.pathname, sha: '', slide: a.slide }; }   // 새 덱 만들기 — 서버가 적용
        if (j.applyErr) a.agent.applyErr = `저장 못 함: ${j.applyErr}`;
      }
    },
    // 끝 — 모델 표시 · 바쁨 풀기. live = 이 창에서 지켜본 작업(새 덱이 서버에서 적용됐으면 새로고침해 완성본을 보인다)
    finish(a, ai, t0, live) {
      if (a._gen !== A.gen) { a.streaming = false; return; }   // 다른 방으로 옮긴 뒤 끝난 것 — 새 방 화면 · 바쁨 표시는 건드리지 않는다
      const o = a.agent.o || {};
      a.streaming = false; if (t0) a.ms = performance.now() - t0; const mm = o.model || (A.model === 'auto' ? '' : A.model); const NM = { opus: 'Opus 5.5', sonnet: 'Sonnet 5.5', haiku: 'Haiku 4.5' };
      const ef = o.build || A.effort === 'auto' ? o.effort : A.effort;
      // 실제 모델 ID(Claude Code 결과의 modelUsage) — 보조 호출용 작은 모델(haiku)이 같이 찍히면 둘 다
      const used = (a.agent.models || []).join(', ');
      a.model = a.agent.quick ? '빠른 답 · 로컬 LLM' : a.agent.engine === 'gemma' ? `로컬 LLM 생각 · 수정${o.kind ? ` (${String(o.kind).replace(/장/g, '페이지')})` : ''}`
        // 대체 엔진(서버 alt_llm) — Claude 사용량이 다 차서 예비 계정 · Codex · Gemini 가 대신 했을 때(사용자 지정 2026-11-02)
        : a.agent.via ? `${a.agent.via} (Claude 사용량이 다 되어 대신)${used ? ` · 실제: ${used}` : ''}`
        : `Claude Code · ${NM[mm] || '계정 기본 모델'}${ef ? ` · 노력 ${ef}` : ''}${o.kind ? ` (자동: ${String(o.kind).replace(/장/g, '페이지')})` : ''}${o.web ? ' · 웹 검색' : ''}${used ? ` · 실제: ${used}` : ''}`;
      // 구독 인증 실패 — 연결을 지우고 다시 연결하게(잘못된 토큰으로 계속 401 이 나지 않게). 지난 대화를 다시 그릴 때는 건드리지 않는다
      if (live && a.agent.engine === 'sub' && /구독 인증 실패|401|OAuth access token/i.test(a.err || '')) { A.token = ''; a.err += ' — 연결을 지웠습니다. [Claude 구독 연결]로 다시 연결해 주세요'; K.render(); }
      K.busy = false; K.ctrl = null; if (ai >= 0) K.updateMsg(ai); K.setSend();
      if (live && a.agent.applied && a.agent.build) { K.keepChat(); location.reload(); }
    },
    // 다시 열었을 때 — 이 계정이 이 덱에 한 부탁들을 서버에서 받아 대화를 다시 그리고, 아직 도는 작업은 이어서 따라 본다
    // (사용자 지정 2026-09-30 "시켜 놓고 나가도 서버가 계속 · 나중에 들어오면 대화 내용을 볼 수 있게"). 방금 적용하고 새로고침한 참이면
    // deckkit 이 되살린 대화(점검 결과 포함)를 그대로 쓴다
    async resume(force) {
      if (K.chat.length && !force) return;
      const gen = A.gen; let jobs = [];
      try {
        let j = await K.post('/api/agent/jobs', { file: location.pathname, thread: A.thread || undefined });
        if (!j.jobs.length && A.thread && !force) j = await K.post('/api/agent/jobs', { file: location.pathname });   // 기억한 방이 비었으면(지웠거나 새 방만 열고 떠남) 가장 최근 방
        jobs = j.jobs || []; if (gen !== A.gen) return; if (j.thread && jobs.length) A.thread = j.thread;
      } catch (e) { return; }
      A.refreshThreads();
      if (!jobs.length || (K.chat.length && !force)) return;
      const live = [];
      for (const g of jobs) {
        K.chat.push({ role: 'user', text: g.prompt, slide: g.slide, ...(g.files?.length ? { thumbs: g.files } : {}) });
        if (gen !== A.gen) return;
        const a = A.newMsg(g.slide, g.prompt, g.o || {}); a.agent.rid = g.rid; a.agent.files = g.files || []; K.chat.push(a);
        const st = g.state || {}; if (st.go) a.agent.go = true; if (st.cancelled) a.agent.cancelled = true; if (st.discarded) a.agent.discarded = true;
        if (st.applied) { a.agent.applied = st.applied; a.applied = st.applied; a.edit = { file: location.pathname, sha: '', slide: g.slide }; }
        if (st.undone) a.undone = true;
        if (g.running) { live.push(a); continue; }
        try { await A.read(await fetch('/api/agent/attach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: location.pathname, rid: g.rid }) }), a, -1); } catch (e) { a.err = e.message; }
        if (st.applied) { a.agent.applied = st.applied; a.applied = st.applied; }
        A.finish(a, -1, 0, false);
      }
      if (gen !== A.gen) return;
      // 패널은 **아직 도는 작업이 있을 때만** 연다 — 지난 대화가 있다고 매번 열면, 닫고 새로고침해도 다시 켜진다(사용자 지적 2026-09-30).
      // 끝난 대화는 조용히 불러 두고, [✦ AI] 를 누르면 그대로 보인다
      if (live.length) K.open('ai'); K.render(); A.swap();
      // 도는 중인 작업(보통 마지막 하나) — 이 창에서 이어서 지켜본다. 멈춤도 된다
      for (const a of live) {
        const ai = K.chat.indexOf(a); K.busy = true; K.ctrl = new AbortController(); K.setSend(); K.updateMsg(ai);
        try { await A.read(await fetch('/api/agent/attach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: K.ctrl.signal, body: JSON.stringify({ file: location.pathname, rid: a.agent.rid }) }), a, ai); }
        catch (e) { if (e.name === 'AbortError') { if (a._gen !== A.gen) return; a.stopped = true; K.post('/api/agent/stop', { file: location.pathname, rid: a.agent.rid }).catch(() => {}); } else a.err = e.message; }
        A.finish(a, ai, 0, true); A.refreshThreads();
      }
    },
    // ── 대화방 — 목록 서랍 · 바꾸기 · 새 방 · 지우기 ──
    leave() {   // 지금 방에서 떠난다 — 도는 작업은 멈추지 않고(서버가 계속) 따라 보기만 끊는다
      A.gen++; if (K.busy && K.ctrl) K.ctrl.abort(); K.busy = false; K.ctrl = null;
      A.sess = null; K.chat = []; A.files = []; A.drawFiles(); K.setSend?.();
    },
    newThread() {
      const pend = A.pendingIdx() >= 0;   // 고르지 않은 수정안은 그 방에 그대로 남는다(서버 기록) — 막지 않고 알려만 준다
      A.leave(); A.thread = A.newId(); A.closeThreads(); K.render(); A.swap(); A.toast(pend ? '새 대화 — 고르지 않은 수정안은 앞 대화에 남아 있어요' : '새 대화');
    },
    async openThread(id) {
      if (id === A.thread && K.chat.length) { A.closeThreads(); return; }
      A.leave(); A.thread = id; A.closeThreads(); K.render(); await A.resume(true);
    },
    async refreshThreads() {
      try { A.threads = (await K.post('/api/agent/threads', { file: location.pathname })).threads || []; } catch (e) { return; }
      const other = A.threads.some((t) => t.running && t.id !== A.thread);
      // 다른 방에서 작업 중이면 [대화 목록]에 점 — 패널을 다시 그리지 않고 단추만 고친다(도는 중에 다시 그리면 입력이 끊긴다)
      A.otherRunning = other; const hb = document.querySelector('#kpanel .ka-th');
      if (hb) { const d = hb.querySelector('.dot'); if (other && !d) hb.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); if (!other && d) d.remove(); }
      if (document.querySelector('#ka-th.on')) A.drawThreads();
    },
    showThreads() {
      const kp = document.querySelector('#kpanel'); if (!kp) return;
      let d = kp.querySelector('#ka-th');
      if (!d) { d = document.createElement('div'); d.id = 'ka-th'; kp.appendChild(d); }
      d.innerHTML = '<div class="hd"><h4>대화 목록</h4><button class="go" data-th="new">＋ 새 대화</button><button class="x" data-th="x" title="닫기">✕</button></div><div class="ls"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
      d.onclick = (e) => {
        const b = e.target.closest('[data-th]'); const row = e.target.closest('[data-tid]');
        if (b?.dataset.th === 'x') return A.closeThreads();
        if (b?.dataset.th === 'new') return A.newThread();
        if (b?.dataset.th === 'del' && row) { e.stopPropagation(); return A.delThread(row.dataset.tid, row); }
        if (row) A.openThread(row.dataset.tid);
      };
      requestAnimationFrame(() => d.classList.add('on'));
      A.refreshThreads().then(() => A.drawThreads());
    },
    closeThreads() { document.querySelector('#ka-th')?.classList.remove('on'); },
    drawThreads() {
      const ls2 = document.querySelector('#ka-th .ls'); if (!ls2) return;
      const ago = (t) => { const s2 = Date.now() / 1000 - t; if (s2 < 60) return '방금'; if (s2 < 3600) return `${Math.floor(s2 / 60)}분 전`; if (s2 < 86400) return `${Math.floor(s2 / 3600)}시간 전`; const d = new Date(t * 1000); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
      const ts = A.threads || [];
      ls2.innerHTML = ts.length ? ts.map((t, k) => `<div class="row${t.id === A.thread ? ' cur' : ''}" data-tid="${esc(t.id)}" style="animation-delay:${Math.min(k, 10) * 30}ms"><div class="tx"><div class="tt">${esc(t.title || '(제목 없음)')}</div>`
        + `<div class="sb">${t.running ? '<span class="run"><i></i>작업 중</span> · ' : t.pending ? '<span class="pd">수정안 대기</span> · ' : ''}부탁 ${t.n}개 · ${ago(t.t)}</div></div><button class="del" data-th="del" title="이 대화 지우기">✕</button></div>`).join('')
        : '<div class="em"><b>아직 대화가 없어요</b>AI 에게 부탁하면 대화가 여기에 모입니다. 창을 닫아도 서버가 계속 일하고, 다시 열면 이어서 보입니다.</div>';
    },
    async delThread(id, row) {
      const t = (A.threads || []).find((x) => x.id === id);
      if (!confirm(`「${(t?.title || '').slice(0, 30)}」 대화를 지울까요?${t?.running ? '\n작업 중인 부탁도 멈춥니다.' : ''}`)) return;
      row.classList.add('gone');
      try { await K.post('/api/agent/clear', { file: location.pathname, thread: id }); } catch (e) { row.classList.remove('gone'); alert(e.message); return; }
      if (id === A.thread) { A.leave(); A.thread = ''; K.render(); }
      setTimeout(() => A.refreshThreads().then(() => A.drawThreads()), 220);
    },
    swap() { const l = document.querySelector('#kpanel .kc-list'); if (!l) return; l.classList.remove('ka-swap'); void l.offsetWidth; l.classList.add('ka-swap'); setTimeout(() => l.classList.remove('ka-swap'), 700); },
    // 새로 생긴 말풍선만 살짝 올라오게 — 패널은 매번 통째로 다시 그려서, 늘어난 수만큼만 표시한다
    popNew(body) {
      const n = K.chat.length; const was = A._n ?? n; A._n = n; if (n <= was) return;
      const els = body.querySelectorAll('.kc-list > .kc-u, .kc-list > .kc-a'); [...els].slice(-(n - was)).forEach((el) => el.classList.add('ka-pop'));
    },
    toast(t) { const kp = document.querySelector('#kpanel'); if (!kp) return; kp.querySelector('.ka-toast')?.remove(); const e2 = document.createElement('div'); e2.className = 'ka-toast'; e2.textContent = t; kp.appendChild(e2); setTimeout(() => e2.remove(), 2500); },
    mark(i, state) { const m = K.chat[i]; if (m?.agent?.rid) K.post('/api/agent/mark', { file: location.pathname, rid: m.agent.rid, state }).catch(() => {}); },
    html(m, ans0) {
      const g = m.agent; const i = K.chat.indexOf(m);
      if (g.warn) {
        const what = g.kind === '여러 장' ? '여러 페이지 · 새 페이지' : '레이아웃(배치 · 그래프 모양)';
        return `<div class="kc-body"><p>로컬 LLM 로는 <b>${what}</b> 수정이 많이 부족합니다. Claude Code 로 하면 훨씬 정확합니다.</p></div>`
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
        const KIND = { add: '추가', del: '삭제' };
        const names = [...g.slides, ...(g.added || []).map((x) => `${x} (추가)`), ...(g.removed || []).map((x) => `${x} (삭제)`)];
        card = `<div class="kc-ed"><div class="h">바뀐 페이지${names.length > 1 ? ` ${names.length}개` : ''}: ${esc(names.join(' · ') || '없음')}${g.other ? ' · <span style="color:#b45309">공용 부분(스타일 · 스크립트)도 바뀜</span>' : ''}</div>`
          + (m.shots?.length
            ? `<div class="ka-shots${m.shots.length === 1 ? ' one' : ''}">${m.shots.map((s, k) => `<div class="kshot-t" data-kshot="${i}:s${k}" title="누르면 크게${s.before && s.after ? ' · 이전과 겹쳐 비교' : ''}"><img src="${s.after || s.before}">${KIND[s.kind] ? `<b class="tag ${s.kind}">${KIND[s.kind]}</b>` : ''}<span>${s.n}. ${esc(s.name)}</span></div>`).join('')}</div>${g.more ? `<div class="ka-more-shots">외 ${g.more}개 페이지는 생략했습니다 — 적용하면 모두 저장됩니다</div>` : ''}`
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
        const j = await K.post('/api/agent/apply', { file: location.pathname, rid: m.agent.rid }); m.agent.applied = j.backup; m.applied = j.backup; m.edit = { file: location.pathname, sha: '', slide: m.slide }; K.keepChat(); location.reload(); }   // m.edit — [되돌리기](K.undoEdit)가 m.edit.file 을 본다
      catch (e) { m.agent.applyErr = `저장 못 함: ${e.message}`; btn.disabled = false; K.updateMsg(i); }
    },
    discard(i) { const m = K.chat[i]; if (!m?.agent) { if (m) m.cancelled = true; return; } m.agent.discarded = true; if (m.agent.rid) K.post('/api/agent/discard', { file: location.pathname, rid: m.agent.rid }).catch(() => {}); },

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
