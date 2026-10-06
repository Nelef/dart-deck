// 덱 공용 부품 — 옆 패널(코드 경로 · AI 에게 묻기)과 누르면 뜨는 세부 카드.
// v2·v1 파이프라인 덱이 함께 쓴다. 코드 발췌는 data/codemap.json(파일:줄·함수·주석 원문, 생성 시점 커밋 고정)에서,
// AI 답은 serve.py 의 POST /api/ask(로컬 gemma-4-26b 중계)에서 온다. 문맥은 지금 장의 글 + 실행 기록 + 그 단계 코드 발췌다.
(() => {
  // 고치기를 적용하고 막 새로고침한 참이면 오류를 모아 둔다 — 장 그리기(INIT)는 이 파일 다음에 도는 deck.js 가 부르고 실패를 console.error 로만 남긴다.
  // 모은 오류는 대화를 되살릴 때 그 수정안 밑에 띄워 [되돌리기]를 권한다(큰 레이아웃 수정 허용과 함께, 2026-09-29).
  try { if (sessionStorage.getItem(`deckkit.chat:${location.pathname}`)) {
    const errs = window.__deckEditErrs = []; const ce = console.error.bind(console);
    console.error = (...a) => { errs.push(a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 300)); ce(...a); };
    addEventListener('error', (e) => errs.push(String(e.message).slice(0, 300)));
  } } catch (e) { /* 저장소 없음 */ }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = `
  /* 패널 폭 — 600px 고정이면 1500px 창에서 무대가 59% 로 줄어 "왼쪽이 너무 작다"는 지적(2026-09-28).
     창 폭의 27%(380~520px)로 두고, 왼쪽 가장자리를 끌어 사람이 직접 넓히고 좁힐 수 있게 한다(폭은 이 브라우저에만 기억). */
  :root { --kw: clamp(380px, 27vw, 520px); }
  #bar { transition: right .3s cubic-bezier(.2,.8,.2,1); }
  body.kside #bar { right: var(--kw); }
  body.kgrab #bar { transition: none; }
  #kpanel .kgrip { position: absolute; left: -7px; top: 0; bottom: 0; width: 14px; cursor: col-resize; z-index: 2; }
  #kpanel .kgrip::after { content: ''; position: absolute; left: 5px; top: 50%; width: 4px; height: 56px; margin-top: -28px; border-radius: 99px; background: #c3c8cf; opacity: 0; transition: opacity .15s; }
  #kpanel .kgrip:hover::after, body.kgrab #kpanel .kgrip::after { opacity: 1; }
  body.kgrab, body.kgrab * { cursor: col-resize !important; user-select: none; }
  /* 누른 것 표시 — 세부가 열린 동안 무대에서 무엇을 눌렀는지 보이게: 누른 요소는 굵은 테두리, 같은 장의 다른 막대·띠는 흐리게 */
  .ksel:not(rect):not(g) { outline: 3px solid #16181d; outline-offset: 3px; }
  rect.ksel, circle.ksel, line.ksel { stroke: #16181d; stroke-width: 3px; paint-order: stroke; }
  g.ksel > rect { stroke: #16181d; stroke-width: 3px; opacity: .45 !important; }
  .kdim .gbar:not(.ksel), .kdim .gband:not(.ksel), .kdim [data-ksel]:not(.ksel) { opacity: .28 !important; transition: opacity .2s; }
  #kpanel .kpick { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 800; color: #16181d; background: #fff; border: 2px solid #16181d; border-radius: 99px; padding: 2px 10px; margin-bottom: 6px; }
  #kpanel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--kw); background: #f7f8fa; transform: translateX(100%); transition: transform .3s cubic-bezier(.2,.8,.2,1); z-index: 50; display: flex; flex-direction: column; font-family: 'Noto Sans KR', sans-serif; color: #16181d; }
  body.kside #kpanel { transform: none; }
  #kpanel .khead { display: flex; gap: 6px; align-items: center; padding: 12px 14px; background: #fff; border-bottom: 1px solid #e6e8ec; }
  #kpanel .khead button { padding: 8px 14px; border-radius: 99px; font-size: 14px; font-weight: 800; color: #545b66; background: #f2f3f6; border: 0; cursor: pointer; }
  #kpanel .khead button.on { background: #16181d; color: #fff; }
  #kpanel .khead .kx { margin-left: auto; background: none; font-size: 18px; }
  #kpanel .kstage { font-size: 13px; color: #9aa1ab; font-weight: 800; padding: 10px 16px 0; }
  #kpanel .kbody { flex: 1; overflow-y: auto; padding: 10px 16px 16px; }
  .knode { background: #fff; border-radius: 12px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 2px 10px rgba(20,24,40,.06); border-left: 5px solid #334155; }
  .knode.llm { border-left-color: #c026d3; }
  .knode .kfn { font-weight: 900; font-size: 15px; }
  .knode .kpath { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #7a828e; margin-top: 2px; word-break: break-all; }
  .knode .krole { font-size: 14px; color: #545b66; margin-top: 6px; line-height: 1.5; }
  .knode .ktag { display: inline-block; font-size: 11.5px; font-weight: 800; color: #fff; background: #c026d3; border-radius: 99px; padding: 1px 8px; margin-left: 6px; vertical-align: 2px; }
  .knode details { margin-top: 8px; }
  .knode summary { font-size: 13px; font-weight: 800; color: #0284c7; cursor: pointer; }
  .knode pre { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.5; background: #15171c; color: #d8dee8; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; }
  .knode pre .cm { color: #8b95a3; } .knode pre .hl { background: rgba(234,88,12,.25); }
  .karrow { text-align: center; color: #c3c8cf; font-size: 16px; margin: -4px 0; }
  .kchips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
  .kchips button { font-size: 13px; font-weight: 700; padding: 6px 11px; border-radius: 99px; border: 1px solid #e6e8ec; background: #fff; color: #545b66; cursor: pointer; }
  .kchips button:hover { background: #f2f3f6; }
  .kask { display: flex; gap: 8px; }
  .kask textarea { flex: 1; height: 64px; resize: none; border-radius: 12px; border: 1px solid #d5d9df; padding: 10px 12px; font: 14px 'Noto Sans KR', sans-serif; }
  .kask button { width: 64px; border-radius: 12px; border: 0; background: #c026d3; color: #fff; font-weight: 900; font-size: 15px; cursor: pointer; }
  .kqa { margin: 12px 0; }
  .kqa .q { font-weight: 800; font-size: 14px; background: #fff; border-radius: 12px; padding: 9px 12px; }
  .kqa .a { font-size: 14.5px; line-height: 1.65; color: #2b3038; padding: 10px 4px 0; }
  .kqa .a code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; background: #eceff3; padding: 1px 5px; border-radius: 5px; }
  .kqa .a ul { padding-left: 20px; margin: 6px 0; }
  .kqa .meta { font-size: 12px; color: #9aa1ab; margin-top: 6px; }
  .kwait { color: #c026d3; font-weight: 800; animation: kpulse 1.2s ease-in-out infinite; }
  @keyframes kpulse { 50% { opacity: .35; } }
  /* AI 에게 묻기 — ChatGPT 식 대화(2026-09-28 사용자 지정): 내 질문은 오른쪽 말풍선, 답은 전체 폭에 실시간으로, 입력창은 아래 고정 */
  body.kchatmode #kpanel .kbody { padding: 0; overflow: hidden; display: flex; flex-direction: column; background: #fff; }
  .kc-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #eceef1; font-size: 12.5px; color: #7a828e; }
  .kc-top button { border: 1px solid #e3e6ea; background: #fff; border-radius: 99px; padding: 5px 12px; font: 800 12.5px 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; flex: none; }
  .kc-top button:hover { background-color: #f4f5f7; }
  .kc-wrap { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }
  .kc-list { flex: 1; overflow-y: auto; overflow-anchor: none; padding: 14px 18px 8px; }
  /* 아래에 글이 더 있다는 표시 — 누르면 맨 밑으로 가고 자동 스크롤을 다시 켠다 */
  .kc-down { position: absolute; left: 50%; bottom: 10px; width: 34px; height: 34px; border-radius: 99px; border: 1px solid #e3e6ea; background: #fff; color: #2b3038; font-size: 17px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 14px rgba(20,24,40,.12); opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(6px); transition: opacity .15s ease, transform .15s ease; }
  .kc-down.on { opacity: 1; pointer-events: auto; transform: translateX(-50%); }
  .kc-down:active { transform: translateX(-50%) scale(.94); }
  .kc-empty { text-align: center; padding: 36px 6px 8px; }
  .kc-empty .kc-logo { width: 44px; height: 44px; border-radius: 99px; margin: 0 auto 12px; background: linear-gradient(135deg, #e879f9, #a21caf); color: #fff; font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .kc-empty h3 { font-size: 20px; font-weight: 900; margin: 0 0 6px; color: #16181d; }
  .kc-empty p { font-size: 13px; color: #7a828e; margin: 0 0 18px; line-height: 1.6; }
  .kc-sug { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left; }
  .kc-sug button { border: 1px solid #e3e6ea; background: #fff; border-radius: 14px; padding: 11px 13px; font: 700 13px/1.45 'Noto Sans KR', sans-serif; color: #2b3038; cursor: pointer; }
  .kc-sug button:hover { background-color: #f4f5f7; }
  .kc-sep { display: flex; align-items: center; gap: 10px; font-size: 11.5px; font-weight: 800; color: #9aa1ab; margin: 18px 0 6px; }
  .kc-sep::before, .kc-sep::after { content: ''; flex: 1; height: 1px; background: #eceef1; }
  .kc-u { display: flex; justify-content: flex-end; margin: 14px 0; }
  .kc-u > div { background: #eceef1; border-radius: 20px 20px 6px 20px; padding: 10px 15px; max-width: 86%; font-size: 14.5px; line-height: 1.6; color: #16181d; white-space: pre-wrap; word-break: break-word; }
  .kc-a { display: flex; gap: 10px; margin: 14px 0 18px; }
  .kc-av { width: 28px; height: 28px; border-radius: 99px; background: linear-gradient(135deg, #e879f9, #a21caf); color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 2px; }
  .kc-main { flex: 1; min-width: 0; }
  .kc-body { font-size: 14.5px; line-height: 1.72; color: #1f2328; word-break: break-word; }
  .kc-body code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; background: #f1f2f4; padding: 1px 5px; border-radius: 5px; }
  .kc-body ul { padding-left: 20px; margin: 6px 0; }
  .kc-cur { color: #a21caf; animation: kpulse 1s steps(2) infinite; margin-left: 1px; }
  .kc-wait span { display: inline-block; width: 7px; height: 7px; border-radius: 99px; background: #c3c8cf; margin-right: 4px; animation: kpulse 1.2s ease-in-out infinite; }
  .kc-wait span:nth-child(2) { animation-delay: .2s; } .kc-wait span:nth-child(3) { animation-delay: .4s; }
  .kc-meta { display: flex; gap: 12px; align-items: center; font-size: 12px; color: #9aa1ab; margin-top: 6px; }
  .kc-meta button { border: 0; background: none; color: #7a828e; font: 700 12px 'Noto Sans KR', sans-serif; cursor: pointer; padding: 0; }
  .kc-err { color: #dc2626; font-size: 13.5px; }
  .kc-row { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 6px 14px 0; }
  .kc-row button { flex: none; font: 700 12.5px 'Noto Sans KR', sans-serif; padding: 6px 11px; border-radius: 99px; border: 1px solid #e3e6ea; background: #fff; color: #545b66; cursor: pointer; white-space: nowrap; }
  .kc-comp { padding: 8px 14px 12px; }
  .kc-box { display: flex; align-items: flex-end; gap: 8px; background: #fff; border: 1px solid #d9dde3; border-radius: 24px; padding: 7px 7px 7px 16px; box-shadow: 0 2px 12px rgba(20,24,40,.06); }
  .kc-box:focus-within { border-color: #a21caf; }
  .kc-box textarea { flex: 1; border: 0; outline: 0; resize: none; font: 14.5px/1.5 'Noto Sans KR', sans-serif; max-height: 160px; min-height: 24px; padding: 6px 0; background: transparent; color: #16181d; }
  .kc-send { width: 36px; height: 36px; border-radius: 99px; border: 0; background: #16181d; color: #fff; font-size: 17px; font-weight: 900; cursor: pointer; flex: none; }
  .kc-send:disabled { background: #d5d9df; cursor: default; }
  .kc-hint { font-size: 11.5px; color: #9aa1ab; text-align: center; margin-top: 6px; }
  #kpop { position: absolute; z-index: 45; width: 520px; max-height: 620px; overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.25); padding: 18px 20px; display: none; }
  #kpop.on { display: block; animation: kpop .18s ease; }
  @keyframes kpop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  #kpop h4 { margin: 0 32px 4px 0; font-size: 19px; font-weight: 900; }
  #kpop .sub { font-size: 13px; color: #9aa1ab; font-weight: 700; }
  #kpop .kpx { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 99px; background: #f2f3f6; border: 0; cursor: pointer; font-size: 15px; }
  #kpop .blk, .kdet .blk { margin-top: 12px; }
  .kdet .blk b { font-size: 13px; color: #545b66; }
  .kdet pre { font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.55; background: #15171c; color: #d8dee8; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; margin: 4px 0 0; max-height: 300px; overflow: auto; }
  .knode pre { max-height: 360px; overflow: auto; }
  #kbig { position: fixed; z-index: 60; display: none; padding: 6px 12px; border-radius: 99px; border: 0; background: #fff; color: #16181d; font: 800 13px 'Noto Sans KR', sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.35); cursor: pointer; }
  #kbig.on { display: block; }
  .kgd { margin: 8px 0; background: #fff; border-radius: 12px; padding: 4px 14px; box-shadow: 0 2px 10px rgba(20,24,40,.05); }
  .kgd > summary { cursor: pointer; font-size: 14.5px; font-weight: 800; padding: 9px 0; color: #16181d; }
  .kgd > summary span { font-size: 12px; color: #9aa1ab; font-weight: 700; margin-left: 6px; }
  .kgd[open] > summary { color: #c026d3; }
  .kgd .blk { padding-bottom: 8px; }
  .kgrp { margin-top: 20px; font-size: 16px; font-weight: 900; color: #c026d3; border-bottom: 2px solid #fbe9fd; padding-bottom: 3px; }
  #kpop .blk b { font-size: 13px; color: #545b66; }
  #kpop pre { font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.55; background: #15171c; color: #d8dee8; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; margin: 4px 0 0; }
  #kpop .acts { position: sticky; bottom: -18px; background: #fff; padding: 10px 0 4px; }
  #kfull { position: fixed; inset: 24px; z-index: 70; background: #fff; border-radius: 18px; box-shadow: 0 30px 90px rgba(0,0,0,.35); display: none; flex-direction: column; }
  #kfull.on { display: flex; }
  #kfull .fh { display: flex; gap: 10px; align-items: center; padding: 18px 24px; border-bottom: 1px solid #e6e8ec; }
  #kfull .fh h4 { margin: 0; font-size: 24px; font-weight: 900; }
  #kfull .fh .sub { font-size: 14px; color: #9aa1ab; font-weight: 700; }
  #kfull .fh button { margin-left: auto; padding: 9px 16px; border-radius: 99px; border: 0; background: #f2f3f6; font-weight: 800; font-size: 14px; cursor: pointer; }
  #kfull .fh button + button { margin-left: 0; }
  #kfull .fnav { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 24px; border-bottom: 1px solid #f0f1f4; }
  #kfull .fnav a { font-size: 13px; font-weight: 800; color: #545b66; background: #f2f3f6; border-radius: 99px; padding: 5px 11px; text-decoration: none; cursor: pointer; }
  #kfull .fb { flex: 1; overflow-y: auto; padding: 8px 24px 30px; }
  #kfull .fs { margin-top: 18px; }
  #kfull .fs .fl { display: flex; gap: 10px; align-items: baseline; font-size: 15px; font-weight: 900; color: #16181d; }
  #kfull .fs .fl span { font-size: 12.5px; color: #9aa1ab; font-weight: 700; }
  #kfull .fs pre { font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.6; background: #15171c; color: #d8dee8; border-radius: 12px; padding: 14px 16px; white-space: pre-wrap; word-break: break-all; margin: 6px 0 0; }
  #kpop .acts { display: flex; gap: 8px; margin-top: 14px; }
  #kpop .acts button { padding: 9px 16px; border-radius: 99px; border: 0; font-weight: 800; font-size: 14px; cursor: pointer; background: #f2f3f6; }
  #kpop .acts .go { background: #16181d; color: #fff; }
  #kpop .acts .ai { background: #fbe9fd; color: #a21caf; }
  .kc-go { display: inline-block; font-size: 12.5px; font-weight: 800; color: #1e3a8a; background: #e8eefd; border-radius: 99px; padding: 1px 9px; margin: 0 2px; cursor: pointer; text-decoration: none; white-space: nowrap; }
  .kc-go:hover { background: #d3defb; }
  .kc-ed { border: 1px solid #e3e6ea; border-radius: 12px; margin: 10px 0; overflow: hidden; background: #fff; }
  .kc-ed .h { font-size: 12.5px; font-weight: 800; color: #545b66; background: #f4f5f7; padding: 6px 10px; }
  .kc-ed pre { margin: 0; padding: 6px 10px; font: 12px/1.5 'JetBrains Mono', monospace; white-space: pre-wrap; word-break: break-all; }
  .kc-ed .del { background: #fee2e2; color: #991b1b; } .kc-ed .ins { background: #e8eefd; color: #1e3a8a; }
  .kc-ed .bad { font-size: 12.5px; color: #b91c1c; font-weight: 800; padding: 6px 10px; }
  .kc-eda { display: flex; gap: 8px; align-items: center; margin: 6px 0 2px; font-size: 13px; color: #545b66; }
  .kc-eda button { white-space: nowrap; flex: none; border: 0; border-radius: 99px; padding: 6px 14px; font: 800 13px 'Noto Sans KR', sans-serif; cursor: pointer; background: #f2f3f6; color: #2b3038; }
  .kc-eda button.go { background: #1e3a8a; color: #fff; } .kc-eda button:disabled { opacity: .4; cursor: default; }
  /* ═══ 폰(사용자 지정 2026-09-29 "모바일 UI 도") ═══
     세로 폰: 오른쪽 패널(380px)이 390px 화면을 다 덮어 묻는 장이 안 보였다 → 아래에서 올라오는 판으로. 무대는 남은 위쪽에 맞춘다(deck.js fit).
     위 손잡이를 끌면 높이가 바뀌고(이 브라우저에 기억), 누르면 반 · 거의 전체를 오간다. 글을 치는 동안은 자판 위 전체를 쓴다(visualViewport). */
  #kpanel .kgrabh { display: none; }
  /* 미리보기 누르기 · 크게 보기(shotView) */
  .kshot-t { position: relative; cursor: zoom-in; }
  .kshot-t span { position: absolute; right: 8px; bottom: 8px; background: rgba(22,24,29,.78); color: #fff; font: 800 12px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; padding: 4px 9px; border-radius: 99px; }
  #kshotv { position: fixed; inset: 0; z-index: 97; background: rgba(10,12,16,.96); display: none; flex-direction: column; }
  #kshotv.on { display: flex; }
  #kshotv .kv-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; color: #fff; font: 600 14px 'Noto Sans KR', 'Noto Sans Symbols 2', sans-serif; }
  #kshotv .kv-q { color: #9aa1ab; font-size: 13px; flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #kshotv .kv-tabs { display: inline-flex; gap: 4px; background: rgba(255,255,255,.08); border-radius: 99px; padding: 3px; position: relative; }
  #kshotv .kv-tabs button { border: 0; background: transparent; color: #cfd3da; font: 800 13px 'Noto Sans KR', sans-serif; padding: 7px 14px; border-radius: 99px; cursor: pointer; }
  #kshotv .kv-tabs button.on { background: #fff; color: #16181d; }
  #kshotv .kv-mix { position: absolute; top: calc(100% + 6px); z-index: 2; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 12.5px; color: #cfd3da; background: rgba(22,24,29,.96); border: 1px solid rgba(255,255,255,.12); border-radius: 99px; padding: 6px 12px; } #kshotv .kv-mix input { width: 160px; }
  #kshotv .kx2 { border: 0; background: rgba(255,255,255,.12); color: #fff; width: 38px; height: 38px; border-radius: 99px; font-size: 16px; cursor: pointer; margin-left: auto; }
  #kshotv .kv-b { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  #kshotv .kv-box { position: relative; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  #kshotv .kv-box img, #kshotv .kv-box canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
  #kshotv .kv-f { text-align: center; color: #cfd3da; font: 600 13.5px 'Noto Sans KR', sans-serif; padding: 10px 16px 16px; }
  @media (max-width: 640px) and (orientation: portrait) {
    #kpanel { top: auto; left: 0; width: 100%; height: var(--kh, 58dvh); max-height: calc(100dvh - 60px); border-radius: 18px 18px 0 0; transform: translateY(100%); box-shadow: 0 -12px 40px rgba(0,0,0,.35); overflow: hidden; }
    body.kside #kpanel { transform: none; }
    body.kside #bar { right: 0; visibility: hidden; }
    body.kgrabv #kpanel, body.kgrabv #stage { transition: none; }
    #kpanel .kgrip { display: none; }
    #kpanel .kgrabh { display: block; position: absolute; left: 0; right: 0; top: 0; height: 22px; z-index: 3; touch-action: none; cursor: ns-resize; }
    #kpanel .kgrabh::after { content: ''; position: absolute; left: 50%; top: 7px; width: 40px; height: 5px; margin-left: -20px; border-radius: 99px; background: #d5d9df; }
    #kpanel .khead { padding: 18px 12px 8px; }
    #kpanel .kstage { display: none; }
  }
  /* 좁거나 낮은 화면 — 머리 줄 · 안내 글을 줄여 대화 칸을 넓힌다 */
  @media (max-width: 640px), (max-height: 500px) {
    #kpanel .khead { gap: 4px; } #kpanel .khead button { padding: 6px 12px; font-size: 13px; }
    .kc-top { padding: 6px 12px; font-size: 11.5px; } .kc-top span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kc-list { padding: 10px 14px 6px; }
    .kc-empty { padding: 14px 4px 4px; } .kc-empty .kc-logo { display: none; } .kc-empty h3 { font-size: 17px; } .kc-empty p { font-size: 12.5px; margin-bottom: 12px; }
    .kc-sug { grid-template-columns: 1fr; }
    .kc-comp { padding: 6px 10px max(8px, env(safe-area-inset-bottom)); }
    .kc-box textarea { font-size: 16px; }   /* 16px 미만이면 아이폰이 입력칸을 누를 때 화면을 확대해 버린다 */
    .kc-send { width: 40px; height: 40px; }
  }
  @media (max-height: 500px) { #kpanel .khead { padding: 6px 10px; } #kpanel .kstage { display: none; } .kc-empty p { display: none; } }
  @media (pointer: coarse) { .kc-hint { display: none; } }
  .kc-tb { border-collapse: collapse; margin: 8px 0; font-size: .95em; width: 100%; }
  .kc-tb th, .kc-tb td { padding: 6px 10px; border-bottom: 1px solid #e6e8ec; text-align: left; vertical-align: top; }
  .kc-tb th { font-weight: 800; color: #6b7280; border-bottom-width: 2px; white-space: nowrap; }
  `;
  // 간단한 마크다운 → HTML (굵게 · 목록 · 코드 · 줄바꿈 · 표)
  // 표: `| a | b |` 줄이 이어지면 표 하나 — 둘째 줄 `|---|---|` 는 머리글 구분선. 없던 때는 `|` 가 글자 그대로 찍혀 읽기 어려웠다(사용자 지적 2026-09-30)
  const cellsOf = (ln) => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isSep = (ln) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ln);
  const tableHtml = (rows) => { const head = rows.length > 1 && isSep(rows[1]) ? cellsOf(rows[0]) : null; const body = (head ? rows.slice(2) : rows).filter((r) => !isSep(r)).map(cellsOf);
    return `<table class="kc-tb">${head ? `<thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` : ''}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`; };
  const md = (s) => {
    const lines = esc(s).split('\n'); let out = ''; let inList = false; let tb = [];
    const flushTb = () => { if (tb.length) { out += tableHtml(tb); tb = []; } };
    for (const ln of lines) {
      if (/^\s*\|.*\|\s*$/.test(ln)) { if (inList) { out += '</ul>'; inList = false; } tb.push(ln); continue; }
      flushTb();
      const hd = ln.match(/^\s*#{1,6}\s+(.*)$/);
      if (hd) { if (inList) { out += '</ul>'; inList = false; } out += `<p style="margin:10px 0 4px;font-weight:900">${hd[1]}</p>`; continue; }
      const li = ln.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${li[1]}</li>`; continue; }
      if (inList) { out += '</ul>'; inList = false; }
      out += ln.trim() ? `<p style="margin:6px 0">${ln}</p>` : '';
    }
    flushTb(); if (inList) out += '</ul>';
    // 근거 링크 `[장 이름](#번호)` → 누르면 그 장으로 가는 칩(wholeDeck 덱, 2026-09-29). 번호는 주소 #n 과 같은 1부터
    return out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]\n]{1,60})\]\(#(\d{1,3})\)/g, (m, t, n) => `<a class="kc-go" data-goto="${Number(n) - 1}" title="${n}페이지로 이동">↗ ${t}</a>`);
  };
  // 코드 발췌 — 주석 줄은 흐리게, 기준 줄은 강조
  const codeHtml = (n) => esc(n.code).split('\n').map((l) => {
    const num = Number(l.slice(0, 5));
    const cls = /^\s*\d+\s+\s*(\/\/|\*|\/\*\*)/.test(l) ? 'cm' : '';
    return `<span class="${cls}${num === n.line ? ' hl' : ''}">${l}</span>`;
  }).join('\n');

  // ═══ 덱 고치기(cfg.editable, 2026-09-29) — AI 가 낸 ```edit [{find, replace}]``` 블록을 사람이 보고 [적용] 하면 serve.py /api/edit 가 저장 ═══
  // 수정 요청으로 보이는 질문에만 덱 원본을 싣는다(늘 실으면 문맥이 4배가 된다). 찾을 글은 원본에 **정확히 한 번** 있어야 한다 — 서버도 다시 센다.
  // 형식은 JSON 이 아니라 "찾기/바꾸기" 블록 — JSON 안에 HTML 을 넣게 하니 gemma 가 이스케이프를 틀려(\> 등) 읽지 못했다(2026-09-29 실측).
  const EDIT_HOW = '- 고쳐 달라는 요청인지는 네가 판단한다. 설명 · 질문이면 블록 없이 답만 한다. 앞 답에서 제안한 수정을 하라는 말(「그래」「그렇게 해줘」「적용해」)이면 그 수정을 블록으로 낸다.\n'
    + '- 사용자가 덱을 고쳐 달라고 하면: 무엇을 바꾸는지 한두 줄로 말하고, **맨 끝에** 블록을 낸다. 블록은 두 종류다.\n'
    + '- ① 작은 수정(문구 · 제목 · 숫자 표기 등, 어느 장이든) — 바꿀 곳마다:\n<<<<<<< 찾기\n원본에 있는 줄 그대로\n=======\n바꾼 줄\n>>>>>>> 바꾸기\n'
    + '  찾기에는 **바꿀 줄만** 원본에서 글자 하나 다르지 않게 복사한다(이스케이프하지 않는다). 두 번 이상 나오는 줄이면 앞뒤 한 줄을 더 붙인다. 800자를 넘기지 않는다.\n'
    + '- ② 레이아웃을 크게 바꾸기(배치 · 카드 · 표 모양 · 그림 구성) — **지금 보고 있는 장에서만** 된다. 지금 장을 통째로 새로 써서 **코드 칸**에 넣는다(원본은 다시 적지 않는다):\n'
    + '```html\n<section class="slide" data-name="(지금 장 이름 그대로)" ...> … </section>\n```\n'
    + '```js\nINIT[\'(지금 장 이름 그대로)\'] = () => { … };\n```\n'
    + '  둘 중 필요한 것만 낸다. 아래 「지금 장의 마크업」·「지금 장을 그리는 스크립트」를 **요청대로 구조를 실제로 바꿔** 새로 쓴 완성본을 넣는다 — 원본을 그대로 내면 안 된다(… 로 줄이지도 않는다).\n'
    + '  예: 표를 카드로 바꾸라면 <table> 을 만드는 코드를 지우고 카드 <div> 들을 만드는 코드로 바꾼다. data-name 과 INIT 이름은 바꾸지 않는다.\n'
    + '- 「장 제목」·「제목」은 화면에 크게 보이는 <h2> 글이다. 장 이름(data-name · INIT[\'…\'] · 목차 단추)과 다르다 — 장 이름은 목차와 스크립트를 잇는 열쇠라 어떤 요청에도 바꾸지 않는다.\n'
    + '  마크업이 쓰는 id 는 스크립트와 맞춘다. 색은 var(--c-brand) 같은 --c-* 변수, 글자 크기는 --fs-* 변수만 쓴다. 무대는 1600×900 이고 넘치면 안 된다.\n'
    + '- ③ 덩어리 옮기기(장 통째 다시 쓰지 않고) — 격자 칸 · 표처럼 반복 요소가 많은 장에서 덩어리 자리를 바꾸거나 지울 때. 통째로 다시 쓰면 길이 제한에 잘린다:\n'
    + '<<<<<<< 조작\n맞바꾸기 | 선택자A | 선택자B\n앞에 | 옮길 선택자 | 기준 선택자\n뒤에 | 옮길 선택자 | 기준 선택자\n지우기 | 선택자\n>>>>>>> 끝\n'
    + '  선택자는 지금 장 <section> 안에서 요소 하나만 가리키는 CSS 선택자(#s1viz > div:nth-child(1) · h2 · .foot). 스크립트가 그린 요소에는 못 쓴다.\n'
    + '- 장 마크업 안에 <style> 을 넣지 않는다 — .part · .card 같은 규칙은 다른 장까지 바꾼다. 모양은 요소의 style 속성으로.\n'
    + '- 다른 장 · 공용 <style> · 데이터 파일을 크게 바꾸는 일, 새 장 만들기는 블록을 내지 말고 "Claude Code 에 맡겨 주세요"라고 답한다.';
  // 암호 API 가 없는 주소(폰에서 http://100.x 로 열 때)는 deckcheck.js 의 순수 JS 구현으로
  // ═══ 도구 방식(cfg.tools) — PPTArena 1위 PPTPilot 의 설계를 우리 덱에(2026-09-29 하네스 비교의 3번 구성) ═══
  // 자유롭게 장을 다시 쓰는 대신 **정해진 조작**(옮기기 · 크기 · 글 · 스타일 · 지우기)을 고르게 하고, 실제 수정은 코드가 한다.
  // 스크립트가 만든 글 · 그림은 조작으로 못 닿으니 찾기/바꾸기(세밀한 조작)와 섞어 쓴다 — PPTPilot 도 둘을 섞은 쪽이 가장 좋았다(XML만 0.95 · 코드만 2.06 · 섞음 2.36).
  const TOOLS_HOW = '- ③ 도구 조작(권장 — 지금 장에 **그대로 적힌 요소**는 이것으로. 장 통째 새로 쓰기보다 먼저 쓴다):\n'
    + '<<<<<<< 조작\n옮기기 | 선택자 | dx dy\n크기 | 선택자 | 너비 높이\n글 | 선택자 | 새 글\n스타일 | 선택자 | 속성: 값\n지우기 | 선택자\n>>>>>>> 끝\n'
    + '  한 줄에 조작 하나. 선택자는 지금 장 <section> 안에서 **요소 하나만** 가리키는 CSS 선택자(#s4bar · h2 · ul.pts li:nth-child(1) · .foot 등). dx dy · 너비 높이는 무대 px(오른쪽 · 아래가 +, 안 바꾸면 -).\n'
    + '  스크립트(INIT)가 만든 글 · 그림 · 표 안쪽은 조작으로 못 바꾼다 — 그건 ① 찾기/바꾸기로 스크립트 줄을 고친다.\n';
  const OPS_RE = /<{5,}\s*조작[^\n]*\n([\s\S]*?)\n?>{5,}[^\n]*/g;
  // 조작을 지금 장 마크업(틀)에 차례로 적용해 새 마크업을 돌려준다. 선택자가 0개 · 2개 이상이면 그 조작은 오류
  const applyOps = (sec, body) => {
    const t = document.createElement('template'); t.innerHTML = sec; const root = t.content.firstElementChild; const errs = [];
    const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    for (const raw of body.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [op, sel, ...rest] = raw.split('|').map((x) => x.trim()); const arg = rest.join('|').trim();
      let els; try { els = root.querySelectorAll(sel); } catch (e) { errs.push(`선택자 오류 「${sel}」`); continue; }
      if (!els.length && document.querySelector(`.slide[data-name="${root.dataset.name}"]`)?.querySelector(sel)) { errs.push(`「${sel}」 는 스크립트가 그린 요소라 파일 마크업에 없습니다 — 조작 말고 그 페이지를 그리는 스크립트(INIT) 줄을 ① 찾기/바꾸기로 고치세요(예: 표 행이면 데이터를 거르는 줄)`); continue; }
      if (els.length !== 1) { errs.push(`「${sel}」 가 ${els.length}개를 가리킴(하나여야 함)`); continue; }
      const el = els[0]; const st = el.style;
      if (op === '옮기기') { const [dx, dy] = arg.split(/\s+/).map((v) => (v === '-' ? 0 : Number(v) || 0));
        // 좌표가 적혀 있으면 그 값을, 없으면 translate 로 — 어떤 배치 방식이든 깨지지 않게
        const L = px(st.left); const T = px(st.top); const R = px(st.right); const B = px(st.bottom);
        if (L != null || R != null || T != null || B != null) {
          if (dx) { if (L != null) st.left = `${L + dx}px`; if (R != null) st.right = `${R - dx}px`; if (L == null && R == null) st.transform = `${st.transform || ''} translateX(${dx}px)`.trim(); }
          if (dy) { if (T != null) st.top = `${T + dy}px`; if (B != null) st.bottom = `${B - dy}px`; if (T == null && B == null) st.transform = `${st.transform || ''} translateY(${dy}px)`.trim(); }
        } else st.transform = `${st.transform || ''} translate(${dx}px, ${dy}px)`.trim();
      } else if (op === '크기') { const [w, h] = arg.split(/\s+/); if (w && w !== '-') st.width = `${parseFloat(w)}px`; if (h && h !== '-') st.height = `${parseFloat(h)}px`; }
      else if (op === '글') el.textContent = arg;
      else if (op === '스타일') { const k = arg.indexOf(':'); if (k < 0) { errs.push(`스타일 「${arg}」 에 : 가 없음`); continue; } st.setProperty(arg.slice(0, k).trim(), arg.slice(k + 1).trim().replace(/;$/, '')); }
      else if (op === '지우기') el.remove();
      else if (op === '맞바꾸기' || op === '앞에' || op === '뒤에') {   // 덩어리 순서 — 반복 요소가 많은 장을 통째로 다시 쓰지 않게(bench/ui_run E12: 격자 200칸을 다시 쓰다 반복에 빠져 잘림)
        let o; try { o = root.querySelectorAll(arg); } catch (e) { errs.push(`선택자 오류 「${arg}」`); continue; }
        if (o.length !== 1) { errs.push(`「${arg}」 가 ${o.length}개를 가리킴(하나여야 함)`); continue; }
        const b2 = o[0]; if (b2 === el || el.contains(b2) || b2.contains(el)) { errs.push(`「${sel}」 와 「${arg}」 가 서로 안에 있음`); continue; }
        if (op === '앞에') b2.before(el); else if (op === '뒤에') b2.after(el);
        else { const mk = document.createComment('swap'); el.before(mk); b2.before(el); mk.replaceWith(b2); }
      }
      else errs.push(`모르는 조작 「${op}」`);
    }
    return { html: t.innerHTML, errs };
  };
  const sha256 = async (t) => (window.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('') : window.DeckCheck.sha256js(t));
  const BLOCK_RE = /<{5,}\s*찾기[^\n]*\n([\s\S]*?)\n={5,}[^\n]*\n([\s\S]*?)\n?>{5,}[^\n]*/g;
  const WHOLE_RE = /<{5,}\s*이 장 (마크업|스크립트) 전체[^\n]*\n([\s\S]*?)\n?>{5,}[^\n]*/g;
  const same = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim(); // 띄어쓰기·줄바꿈만 다르면 같은 글
  const SMALL_MAX = 800;   // 찾기 상한(serve.py 와 같게 — 예전엔 여기 400 · 서버 600 으로 달라 500자짜리 템플릿 한 줄 수정이 여기서만 막혔다) — 더 긴 건 '작은 수정'이 아니다. 장을 크게 바꾸려면 통째 블록으로(지금 장만)
  // 찾을 글의 실제 자리 — 그대로 있으면 그것, 없으면 줄마다 앞뒤 공백만 무시하고 맞춰 본다(LLM 이 들여쓰기를 자주 빼먹는다).
  // 어느 쪽이든 **정확히 한 곳**일 때만 원본의 실제 글을 돌려준다 — 서버는 그 글로 다시 센다.
  const locate = (src, f) => {
    const n = f ? src.split(f).length - 1 : 0; if (n) return { at: f, n };
    const lines = f.split('\n').map((l) => l.trim()).filter(Boolean); if (!lines.length) return { at: f, n: 0 };
    const re = new RegExp(lines.map((l) => `[ \t]*${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*`).join('\n'), 'g');
    const hits = src.match(re) || []; if (hits.length) return { at: hits.length === 1 ? hits[0] : f, n: hits.length };
    // 태그 사이 공백 차이 — 한 줄로 붙은 마크업(굳힌 장)을 AI 가 줄바꿈 · '</div >' 로 풀어 적었다(bench/ui_run r2 E4: 글은 맞는데 0번 → 3번 다 실패).
    // 글자는 그대로 두고 태그 경계(> <)와 '>' 앞 공백만 있어도 없어도 되게, 글 안의 공백은 여러 칸을 한 칸으로 본다
    const pat = f.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+').replace(/(\\s\+)?>/g, '\\s*>').replace(/>(\\s\+)?</g, '>\\s*<');
    let loose = []; try { loose = src.match(new RegExp(pat, 'g')) || []; } catch (e) { /* 이상한 글 */ }
    return { at: loose.length === 1 ? loose[0] : f, n: loose.length };
  };
  // 답에서 수정안을 꺼내 원본에 차례로 대 보며 센다 — 0번이면 없는 글, 2번 이상이면 어디를 바꿀지 모름.
  // 통째 블록은 찾을 글을 LLM 에게 받지 않는다 — 패널이 원본에서 잘라 둔 지금 장(scope.sec · scope.ini)이 곧 찾을 글이다(긴 원문 베끼기 실수를 없앤다).
  const parseEdits = (text, src, scope = {}) => {
    const T = String(text); const small = [...T.matchAll(BLOCK_RE)];
    // 통째 바꾸기 — gemma 는 약속한 블록에 **원본**을 넣고 새 완성본을 뒤따르는 ```html/```js 코드 칸에 넣었다(2026-09-29 실측, 세 번 다).
    // 그래서 코드 칸을 1차로 받는다: html 칸에 지금 장의 <section> 이 있으면 마크업, js 칸이 INIT['지금 장'] 로 시작하면 스크립트.
    // 약속한 블록은 내용이 원본과 다를 때만 새 내용으로 친다. 같은 종류가 여럿이면 마지막 것.
    const nm0 = scope.slide || ''; const pick = {};
    for (const [, kindKo, body] of T.matchAll(WHOLE_RE)) { const kind = kindKo === '마크업' ? 'slide' : 'script'; const at = kind === 'slide' ? scope.sec : scope.ini; if (!same(body, at)) pick[kind] = body; }
    let renamed = '';
    for (const [, lang, body] of T.matchAll(/```(html|js|javascript)[^\n]*\n([\s\S]*?)```/g)) {
      const b = body.trim();
      // 장 이름을 바꾼 완성본 — '장 제목을 바꿔줘'를 data-name 으로 알아들은 실측(2026-09-29). 조용히 버리면 "바뀐 곳이 없습니다"로 엉뚱하게 보였다
      const dn = lang === 'html' ? (b.match(/^<section[^>]*data-name="([^"]*)"/) || [])[1] : (b.match(/^INIT\['([^']*)'\]/) || [])[1];
      if (dn != null && dn !== nm0) { renamed = dn; continue; }
      // 원본과 똑같은 칸은 버린다 — 스크립트만 고치면서 마크업을 그대로 곁들여 내는 일이 잦고, 그걸 오류로 치면 수정안 전체가 막혔다(사용자 실패 신고 2026-09-29)
      if (lang === 'html' && b.includes(`data-name="${nm0}"`) && /^<section/.test(b)) { if (!same(b, scope.sec)) pick.slide = b; }
      else if (lang !== 'html' && b.startsWith(`INIT['${nm0}']`)) { if (!same(b, scope.ini)) pick.script = b; }
    }
    let opsErr = '';
    for (const [, body] of T.matchAll(OPS_RE)) { if (!scope.sec) { opsErr = '지금 페이지의 원본을 찾지 못했습니다'; break; }
      const r = applyOps(pick.slide || scope.sec, body); if (r.errs.length) { opsErr = r.errs.join(' / '); break; } pick.slide = r.html; }
    if (opsErr) return { err: `조작을 적용하지 못했습니다: ${opsErr}` };
    const whole = Object.entries(pick).map(([kind, body]) => [null, kind === 'slide' ? '마크업' : '스크립트', body]);
    if (!small.length && !whole.length) {
      if (renamed) return { err: `페이지 이름(data-name)을 「${nm0}」→「${renamed}」로 바꿨습니다 — 페이지 이름은 목차 · 스크립트를 잇는 열쇠라 바꿀 수 없습니다. 화면 제목(<h2> 글)만 바꿔야 합니다` };
      return /<{5,}\s*(찾기|이 장|조작)|```(html|js)/.test(T) && scope.slide ? { err: '바뀐 곳이 없습니다 — 원본과 똑같거나 블록 모양이 깨졌습니다' } : null;
    }
    let cur = src ?? ''; const items = [];
    const indent = (at, r) => { const w = (at.match(/^[ \t]*/) || [''])[0]; return w + r.replace(/^[ \t]+/, ''); };
    for (const [, kindKo, body] of whole) {
      const kind = kindKo === '마크업' ? 'slide' : 'script'; const at = kind === 'slide' ? scope.sec : scope.ini; let r = body.trim();
      if (kind === 'script') r = r.replace(/(\};)(\s*\/\/[^\n]*)+\s*$/, '$1');   // 끝에 붙인 '// ... (이하 생략)' 같은 주석 줄(bench/ui_run r3 E8: 꼴 검사에 걸림)
      // 그리는 스크립트가 없는 장(굳힌 장 · 마크업만인 장)에 스크립트 블록이 같이 왔다 — 마크업 블록이 있으면 스크립트는 버린다
      // (실측 2026-09-30: 굳힌 간지 정리 요청에 AI 가 마크업 + 새 INIT 을 내 '원본을 찾지 못했습니다'로 3번 다 막혔다)
      if (kind === 'script' && !at && whole.some((w) => w[1] === '마크업')) continue;
      // 굳힌 장 표시(data-frozen)는 AI 가 빠뜨려도 지킨다 — 빠지면 불러올 때 스크립트가 다시 그려 수정이 덮인다
      if (kind === 'slide' && at) { const fz = (at.match(/^<section[^>]*\sdata-frozen="([^"]*)"/) || [])[1] || (scope.autoFreeze ? new Date().toLocaleDateString('sv') : ''); if (fz && !/^<section[^>]*\sdata-frozen=/.test(r)) r = r.replace(/^<section/, `<section data-frozen="${fz}"`); }
      const nm = scope.slide || ''; let bad = '';
      if (!at && kind === 'slide') bad = '지금 페이지의 원본을 찾지 못했습니다';
      else if (same(r, at)) bad = '원본과 똑같습니다 — 바뀐 곳이 없습니다(다시 부탁해 보세요)'; // 실측: 레이아웃 요청에 원본을 그대로 돌려줬다
      else if (kind === 'slide' && !(new RegExp(`^<section[^>]*data-name="${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*</section>$`).test(r))) bad = `<section data-name="${nm}"> … </section> 꼴이 아닙니다(장 이름을 바꾸면 안 됨)`;
      else if (kind === 'slide' && /<script/i.test(r)) bad = '마크업 안에 <script> 는 넣을 수 없습니다';
      else if (kind === 'slide' && /<style/i.test(r) && !/<style/i.test(at)) bad = '페이지 마크업 안에 <style> 을 넣으면 다른 페이지까지 바뀝니다(.part · .card 같은 규칙) — 요소의 style 속성으로 고쳐 주세요';
      else if (kind === 'script' && !at) bad = '이 페이지는 그리는 스크립트가 없습니다(고정된 페이지) — 스크립트 말고 마크업(```html <section …>)으로 고쳐야 합니다';
      else if (kind === 'script' && !(r.startsWith(`INIT['${nm}'] = `) && r.endsWith('};'))) bad = `INIT['${nm}'] = … }; 꼴이 아닙니다`;
      const n = at ? cur.split(at).length - 1 : 0;
      if (!bad && n === 1) cur = cur.replace(at, () => r);
      items.push({ kind, find: at || '', replace: r, n: bad ? 0 : n, bad });
    }
    for (const [, f, r] of small) {
      if (f.length > SMALL_MAX) { items.push({ kind: 'small', find: f, replace: r, n: 0, bad: `찾기가 ${f.length}자 — 작은 수정이 아닙니다(페이지를 크게 바꾸려면 지금 페이지에서 통째로)` }); continue; }
      const hit = locate(cur, f); const rr = indent(hit.at, r); if (hit.n === 1) cur = cur.replace(hit.at, () => rr);
      items.push({ kind: 'small', find: hit.at, replace: rr, n: hit.n, bad: '' });
    }
    return { items, ok: src != null && items.every((x) => x.n === 1 && !x.bad), text: cur };   // text = 모두 적용한 뒤의 원본(미리 그려 점검용)
  };
  // 보여 줄 글에서 수정안(블록 · 코드 칸)을 뺀다 — 카드로 따로 그린다. 받는 중에 덜 닫힌 코드 칸도 숨긴다
  const stripEdit = (t) => String(t).replace(/<{5,}\s*(찾기|이 장|조작)[\s\S]*?>{5,}[^\n]*/g, '').replace(/```(html|js|javascript)[\s\S]*?(```|$)/g, '').replace(/<{5,}\s*(찾기|이 장|조작)[\s\S]*$/, '').trim();

  const K = {
    cfg: null, tab: 'code', chat: [], draft: '', busy: false, ctrl: null,
    init(cfg) {
      // 읽기 모드(공유 주소) — 세부 카드(popover)는 그대로, 고치기 · AI · 코드 탭은 끈다(서버도 로그인 없으면 거절한다)
      if (window.DECK_VIEW) { cfg = { ...cfg, editable: false }; const open0 = K.open; K.open = (tab) => { if (tab === 'detail') open0(tab); }; }
      K.cfg = cfg;
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      const p = document.createElement('div'); p.id = 'kpanel';
      p.innerHTML = '<div class="khead"><button data-kt="detail" style="display:none">세부</button><button data-kt="code">코드 경로</button><button data-kt="ai">AI 에게 묻기</button><button class="kx" title="닫기">✕</button></div><div class="kstage"></div><div class="kbody"></div>';
      document.body.appendChild(p);
      // 폭 조절 손잡이 — 끄는 동안 무대 맞춤(resize)을 한 프레임에 한 번만
      try { const w = Number(localStorage.getItem('deckkit.kw')); if (w >= 320) document.documentElement.style.setProperty('--kw', `${w}px`); } catch (e) { /* 저장소 없음 */ }
      const grip = document.createElement('div'); grip.className = 'kgrip'; grip.title = '끌어서 패널 폭 조절'; p.appendChild(grip);
      K.sheetGrip(p);
      let raf = 0;
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('kgrab');
        const mv = (ev) => {
          const w = Math.round(Math.max(320, Math.min(innerWidth * 0.6, innerWidth - ev.clientX)));
          document.documentElement.style.setProperty('--kw', `${w}px`);
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; dispatchEvent(new Event('resize')); });
        };
        const upg = () => {
          grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', upg); document.body.classList.remove('kgrab');
          try { localStorage.setItem('deckkit.kw', String(parseInt(getComputedStyle(p).width, 10))); } catch (e2) { /* 저장소 없음 */ }
          dispatchEvent(new Event('resize'));
        };
        grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', upg);
      });
      // 무엇을 눌렀는지 기억 — popover() 가 그 요소에 표시를 단다(덱마다 따로 넘기지 않아도 되게)
      document.addEventListener('click', (e) => { if (e.target.closest?.('#stage')) K.lastEl = e.target; }, true);
      p.querySelector('.kx').onclick = () => K.close();
      p.querySelectorAll('[data-kt]').forEach((b) => { b.onclick = () => K.open(b.dataset.kt); });
      const pop = document.createElement('div'); pop.id = 'kpop'; document.querySelector('#stage').appendChild(pop);
      // 조작줄에 두 버튼 — 코드(C) · AI(A)
      const bar = document.querySelector('#bar');
      const mk = (t, k, title) => { const b = document.createElement('button'); b.className = 'nb'; b.id = `k-${k}`; b.style.width = 'auto'; b.style.padding = '0 14px'; b.style.fontSize = '13px'; b.style.fontWeight = '800'; b.textContent = t; b.title = title; b.onclick = () => (document.body.classList.contains('kside') && K.tab === k ? K.close() : K.open(k)); bar.insertBefore(b, bar.querySelector('#fs')); };
      // noCode — 코드를 보여 줄 일이 없는 덱(일반 사용자용 v1·v2 한눈에, 2026-09-29)은 코드 버튼·탭·C 키를 뺀다. 기본은 예전 그대로
      if (!cfg.noCode) mk('〈/〉 코드', 'code', '이 페이지의 코드 경로 (C)'); mk('✦ AI', 'ai', '이 페이지에 대해 AI 에게 묻기 (A)');
      if (cfg.noCode) p.querySelector('[data-kt="code"]').style.display = 'none';
      addEventListener('keydown', (e) => {
        if (e.key === 'Escape') K.hidePop();
        if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName)) return;
        if ((e.key === 'c' || e.key === 'C') && !cfg.noCode) K.open('code');
        if (e.key === 'a' || e.key === 'A') K.open('ai');
      });
      // 슬라이드 쪽 버튼: data-kcode / data-kask="질문"
      document.addEventListener('click', (e) => {
        const c = e.target.closest('[data-kcode]'); if (c) { K.open('code'); return; }
        const fu = e.target.closest('[data-kfull]'); if (fu && K.cfg.fullOf) { const a = K.cfg.fullOf(K.cfg.current()); if (a) K.full(a); return; }
        const a = e.target.closest('[data-kask]'); if (a) { K.open('ai'); K.ask(a.dataset.kask); }
        const g = e.target.closest('.kc-go'); if (g) { e.preventDefault(); K.cfg.goto(Number(g.dataset.goto)); }
      });
      if (cfg.editable && K.restoreChat()) setTimeout(() => { K.checkAfterEdit(); K.open('ai'); }, 600);
      // Claude Code 엔진(js/deckagent.js · 서버 research/deckagent.py) — 고칠 수 있는 덱에서만(2026-09-30 사용자 지정 "클로드 코드 도구 연결 · 구독 계정으로")
      if (cfg.editable && !window.DeckAgent) { const sc = document.createElement('script'); sc.src = 'js/deckagent.js'; document.head.appendChild(sc); } // 고치고 새로고침한 뒤 — 점검하고 대화를 이어서 연다
    },
    // 폰 세로의 아래 판 — 위 손잡이를 끌면 높이, 짧게 누르면 반(58%) ↔ 거의 전체(88%). 자판이 뜨면 자판 위를 다 쓴다
    sheetGrip(p) {
      const h = document.createElement('div'); h.className = 'kgrabh'; h.title = '끌어서 높이 조절 · 누르면 크게/작게'; p.appendChild(h);
      try { const v = Number(localStorage.getItem('deckkit.kh')); if (v >= 20 && v <= 92) document.documentElement.style.setProperty('--kh', `${v}dvh`); } catch (e) { /* 저장소 없음 */ }
      const setH = (pct) => { document.documentElement.style.setProperty('--kh', `${pct}dvh`); try { localStorage.setItem('deckkit.kh', String(Math.round(pct))); } catch (e) { /* 저장소 없음 */ } };
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); const y0 = e.clientY; const h0 = p.getBoundingClientRect().height; let moved = false; let raf = 0;
        document.body.classList.add('kgrabv');
        const mv = (ev) => { if (Math.abs(ev.clientY - y0) > 6) moved = true; if (!moved) return;
          setH(Math.max(25, Math.min(90, ((h0 + y0 - ev.clientY) / innerHeight) * 100)));
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; K.relayout(); }); };
        const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); document.body.classList.remove('kgrabv');
          if (!moved) setH(h0 / innerHeight > 0.7 ? 58 : 88); K.relayout(); };
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
      });
      // 자판 — iOS · 안드로이드 Chrome 은 자판이 떠도 창(innerHeight)을 줄이지 않고 보이는 칸(visualViewport)만 줄인다.
      // 그대로 두면 입력칸이 자판 밑에 깔린다 → 자판이 뜬 동안 패널을 보이는 칸에 딱 맞춘다
      const vv = window.visualViewport; if (!vv) return;
      const onVV = () => {
        const kb = document.body.classList.contains('kside') && innerHeight - vv.height > 120 && p.contains(document.activeElement);
        if (kb) Object.assign(p.style, { top: `${vv.offsetTop}px`, height: `${vv.height}px`, bottom: 'auto', maxHeight: 'none' });
        else { p.style.top = ''; p.style.height = ''; p.style.bottom = ''; p.style.maxHeight = ''; }
      };
      vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV); p.addEventListener('focusout', () => setTimeout(onVV, 50));
    },
    stage() { return K.cfg.stageOf(K.cfg.current()); },
    nodes() { const s = K.stage(); return (K.cfg.codemap?.[K.cfg.deck] || {})[s] || []; },
    // 패널을 열고 닫을 때 무대 맞춤을 곧바로 부른다 — 무대가 패널과 같은 0.3초로 함께 움직인다(예전엔 0.32초 뒤에 툭 줄었다)
    relayout() { if (window.DeckFit) window.DeckFit(); else dispatchEvent(new Event('resize')); },
    open(tab) { if (tab === 'code' && K.cfg.noCode) tab = 'ai'; K.tab = tab; document.body.classList.add('kside'); K.render(); K.relayout(); K.prefetchShot(); },
    close() { K.unmark(); document.body.classList.remove('kside'); K.relayout(); },
    refresh() { if (document.body.classList.contains('kside')) { K.render(); K.prefetchShot(1500); } },
    // ═══ 지금 장의 화면을 AI 에게 그림으로(사용자 질문 2026-09-30 "이미지도 같이 전달하나?") ═══
    // 예전엔 첫 질문에 글(마크업 · 스크립트)만 보냈고 그림은 자가검증 차례에만 붙었다 — AI 가 지금 화면을 못 보고 코드만 보고 고쳤다.
    // 캡처(serve.py /api/shot, 실측 5.3초)는 파일 내용(sha) · 장마다 한 번 찍어 두고, 수정 요청의 자가검증 '이전' 그림(baseShot)과 같이 쓴다.
    // 기다리지 않게 AI 패널을 열 때 · 장을 넘기고 1.5초 머물 때 미리 찍는다. 캡처가 막힌 곳(localhost · Tailscale 밖)은 그림 없이 간다
    async curShot(slide) {
      if (!K.cfg.editable) return null;
      K.srcP ||= fetch(location.pathname, { cache: 'no-store' }).then((r) => r.text()).then(async (src) => ({ src, sha: await sha256(src) }));
      const { src, sha } = await K.srcP; const key = `${sha}:${slide}`;
      return (K.baseCache[key] ||= K.post('/api/shot', { file: location.pathname, html: src, slide: K.slideNo(slide) }).catch((e) => { delete K.baseCache[key]; throw e; }));
    },
    prefetchShot(ms = 0) {
      clearTimeout(K.pfT); if (!K.cfg.editable || K.tab !== 'ai') return;
      K.pfT = setTimeout(() => { if (document.body.classList.contains('kside')) K.curShot(K.cfg.current().dataset.name).catch(() => {}); }, ms);
    },
    render() {
      const p = document.querySelector('#kpanel');
      p.querySelectorAll('[data-kt]').forEach((b) => b.classList.toggle('on', b.dataset.kt === K.tab));
      const s = K.stage(); const nodes = K.nodes();
      p.querySelector('.kstage').textContent = K.cfg.noCode ? `${K.cfg.deck} · ${K.cfg.current().dataset.name}` : `${K.cfg.deck.toUpperCase()} · ${K.cfg.current().dataset.name}${s && s !== K.cfg.current().dataset.name ? ` → 코드 단계「${s}」` : ''} · 커밋 ${K.cfg.codemap?.commit || ''}`;
      const body = p.querySelector('.kbody');
      document.body.classList.remove('kchatmode');
      const dt = p.querySelector('[data-kt="detail"]'); dt.style.display = K.detail ? '' : 'none';
      if (K.tab === 'detail' && K.detail) {
        const d = K.detail;
        body.innerHTML = `<div class="kdet">${K.selEl ? '<div class="kpick">◉ 무대에서 누른 것</div>' : ''}<h4 style="margin:6px 0 2px;font-size:21px;font-weight:900">${esc(d.title)}</h4><div style="font-size:13px;color:#9aa1ab;font-weight:700">${esc(d.sub)}</div>
          <div class="kchips" style="margin:12px 0 4px">${d.goto ? `<button class="go" style="background:#16181d;color:#fff;border-color:#16181d">「${esc(d.goto.label)}」 페이지로 가기 →</button>` : ''}${d.askQ ? '<button class="ai" style="background:#fbe9fd;color:#a21caf;border-color:#fbe9fd">✦ AI 에게 자세히</button>' : ''}</div>${d.html}</div>`;
        if (d.goto) body.querySelector('.go').onclick = () => { K.detail = null; K.tab = 'code'; K.cfg.goto(d.goto.idx); };
        if (d.askQ) body.querySelector('.ai').onclick = () => { K.open('ai'); K.ask(d.askQ); };
        body.scrollTop = 0;
        return;
      }
      if (K.tab === 'detail') K.tab = 'code';
      if (K.tab === 'code') {
        body.innerHTML = nodes.length
          ? `<div style="font-size:13px;color:#7a828e;margin:4px 0 2px">위에서 아래로 실행 순서입니다. 「코드 보기」는 함수 위 설계 주석부터 함수 끝까지 원문 전부입니다(호출 자리는 앞뒤 40줄).</div>` + nodes.map((n, i) => `${i ? '<div class="karrow">↓</div>' : ''}<div class="knode${n.llm ? ' llm' : ''}"><div class="kfn">${esc(n.fn)}${n.llm ? `<span class="ktag">LLM · ${esc(n.llm)}</span>` : ''}</div><div class="kpath">${esc(n.path)}:${n.line}</div><div class="krole">${esc(n.role)}</div><details><summary>코드 보기 — ${n.from}~${n.to}줄 전부 (${n.to - n.from + 1}줄)</summary><pre>${codeHtml(n)}</pre></details><div class="kchips" style="margin:8px 0 0"><button data-kaskfn="${i}">이 코드가 하는 일을 설명해줘</button></div></div>`).join('')
          : '<div style="font-size:15px;color:#7a828e;padding:20px 0">이 페이지는 특정 코드 단계가 아닙니다. 번호가 붙은 페이지(① ~ )로 가면 그 단계의 코드가 나옵니다.</div>';
        body.querySelectorAll('[data-kaskfn]').forEach((b) => { b.onclick = () => { const n = nodes[Number(b.dataset.kaskfn)]; K.open('ai'); K.ask(`${n.path}:${n.line} 의 ${n.fn} 이 이 파이프라인에서 하는 일과, 주석에 적힌 설계 이유를 설명해줘`); }; });
      } else {
        K.renderChat(body);
      }
    },
    // ═══ AI 에게 묻기 — 한 페이지에서 대화 하나를 이어 간다(새로고침하면 지워진다 · 사용자 지정 2026-09-28) ═══
    suggestions() {
      const base = K.cfg.noCode ? ['이 페이지를 처음 보는 사람에게 쉽게 설명해줘'] : ['이 페이지를 처음 보는 사람에게 쉽게 설명해줘', '왜 이렇게 설계했어? 다른 방법은 왜 안 썼어?', '이 단계의 코드 흐름을 순서대로 짚어줘'];
      return [...base, ...(K.cfg.suggest?.(K.cfg.current()) || [])];
    },
    // 답 한 개의 본문 — 받는 중이면 끝에 커서, 아직 한 글자도 없으면 점 셋
    ansHtml(m) {
      if (m.err) return `${m.text ? md(m.text) : ''}<div class="kc-err">실패: ${esc(m.err)}</div>`;
      if (!m.text) return m.streaming ? (m.think ? `<span class="kwait">생각 중… ${m.think.toLocaleString()}자</span>` : '<span class="kc-wait"><span></span><span></span><span></span></span>') : '';
      // 받는 중에는 짝이 안 맞은 ** · ` 를 잠시 닫아 그린다 — 안 그러면 굵게가 끝날 때까지 별표가 날것으로 보인다
      let t = m.edit ? stripEdit(m.text) : m.text;
      if (m.streaming) { if ((t.match(/\*\*/g) || []).length % 2) t += '**'; if ((t.match(/`/g) || []).length % 2) t += '`'; }
      const h = md(t);
      // 수정안(코드 칸 · 블록)은 받는 동안 숨기므로 그동안 화면이 멈춘 것처럼 보였다(사용자 지적 2026-09-29) — 숨긴 글자 수를 늘려 보여 준다
      const hidden = m.edit ? String(m.text).length - t.length : 0;
      if (m.streaming && hidden > 20) return `${h}<div class="kc-eda"><span class="kwait">✎ 수정안을 쓰는 중… ${hidden.toLocaleString()}자</span></div>`;
      return m.streaming ? h.replace(/(<\/(?:p|li)>)(<\/ul>)?$/, '<span class="kc-cur">▍</span>$1$2') : h + K.editHtml(m);
    },
    // 수정안 카드 — 찾을 글(빨강) → 바꿀 글(파랑), 모두 정확히 한 번이면 [적용]. 적용 뒤엔 [되돌리기]
    editHtml(m) {
      const i = K.chat.indexOf(m);
      const shotHtml = (st, title, key) => `<div class="kc-ed"><div class="h">${title}</div>${st.jpg ? `<div class="kshot-t" data-kshot="${i}:${key}" title="누르면 크게 · 이전과 겹쳐 비교"><img src="${st.jpg}" style="width:100%;display:block"><span>⤢ 크게 · 이전과 비교</span></div>` : ''}${st.problems?.length || st.errors?.length ? `<pre class="del">${esc([...(st.errors || []).map((e) => `스크립트 오류: ${e}`), ...(st.problems || []).slice(0, 6).map((p) => `${p.slide}페이지 ${p.text}`)].join('\n'))}</pre>` : ''}</div>`;
      const applied = () => `<div class="kc-eda"><span title="백업 ${esc(m.applied)}">✓ 파일에 저장됨${m.checked ? ' · 점검 통과' : ''} · 커밋은 직접</span>${m.undone ? ' · 되돌림' : ` <button data-kundo="${i}">되돌리기</button>`}</div>`;
      // [다시 요청] — 쓸 수 없는 수정안 · 롤백 뒤에 사람이 눌러 이유를 알려 다시 부탁한다(사용자 지정 2026-09-29: "버튼 누르기로 다시 요청").
      // 자동 되묻기(reask)는 자가검증 3번 안에서만 돈다 — 그 뒤나 첫 답이 틀 자체가 어긋난 경우 사람이 한 번 더 밀 수 있게
      const again = () => (m.manualAgain ? '<div class="kc-eda">↻ 이유를 알려 다시 요청했습니다 — 아래</div>' : `<div class="kc-eda"><button class="go" data-kreask="${i}">↻ 이유 알려 다시 요청</button></div>`);
      const rollback = `<div class="kc-ed"><div class="bad">3번 자가검증해도 통과하지 못해 롤백했습니다 — 원본 파일은 그대로입니다. 다시 요청하거나, 요청을 더 작게 나눠 보세요.</div></div>${again()}`;
      // 자가검증 통과 — 그 상태(그림)와 [적용]
      if (m.passState) return shotHtml(m.passState, `✓ 자가검증 ${m.verify}/3 통과${m.implicitPass ? '(지금 상태를 그대로 다시 냄)' : ''} — 적용하면 이 화면이 됩니다`, 'pass')
        + (m.applied ? applied() : m.cancelled ? '<div class="kc-eda">취소함</div>' : `<div class="kc-eda"><button class="go" data-kapply="${i}">적용 — 파일에 저장</button><button data-kcancel="${i}">취소</button></div>`)
        + (m.editErr ? `<div class="kc-ed"><div class="bad">${esc(m.editErr)}</div></div>` : '');
      const E = m.edits; if (!E) return m.rollback ? rollback : '';
      if (E.err) return `<div class="kc-ed"><div class="bad">${esc(E.err)}</div></div>${m.handedOff || m.streaming ? '' : again()}`;
      const lines = (t) => String(t).split('\n').length;
      const cards = E.items.map((x, k) => `<div class="kc-ed"><div class="h">${k + 1}. ${x.kind === 'small' ? esc(m.edit?.file || '') : `「${esc(m.edit?.slide || '')}」 페이지 ${x.kind === 'slide' ? '마크업' : '스크립트'} 전체 바꾸기 — ${lines(x.find)}줄 → ${lines(x.replace)}줄`}</div>`
        + (x.kind === 'small' ? `<pre class="del">- ${esc(x.find)}</pre><pre class="ins">+ ${esc(x.replace)}</pre>` : `<details><summary style="font-size:12.5px;padding:6px 10px;cursor:pointer">새로 쓴 내용 보기</summary><pre class="ins">${esc(x.replace)}</pre></details>`)
        + (x.bad ? `<div class="bad">${esc(x.bad)}</div>` : x.n === 1 ? '' : `<div class="bad">찾을 글이 파일에 ${x.n}번 — 이대로는 못 바꿉니다</div>`) + '</div>').join('');
      const act = m.applied
        ? `<div class="kc-eda"><span title="백업 ${esc(m.applied)}">✓ 파일에 저장됨${m.checked ? ' · 점검 통과' : ''} · 커밋은 직접</span>${m.undone ? ' · 되돌림' : ` <button data-kundo="${i}">되돌리기</button>`}</div>`
        : m.cancelled ? '<div class="kc-eda">취소함</div>'
        : m.rollback ? rollback
        : !E.ok && m.reasked ? `<div class="kc-eda">↻ 쓸 수 없는 수정안 — 이유를 알려 다시 부탁했습니다(${(m.verify || 0) + 1}/3)</div>`
        : !E.ok ? (m.verify ? '<div class="kc-eda">이 수정안은 쓸 수 없어 다음 자가검증으로 넘깁니다</div>' : (m.manualAgain ? again() : `<div class="kc-eda"><button class="go" data-kreask="${i}">↻ 이유 알려 다시 요청</button><button data-kcancel="${i}">취소</button><span>고칠 수 없는 곳이 있어 적용 못 함</span></div>`))
        : m.shooting ? '<div class="kc-eda"><span class="kwait">미리보기 사본에 적용해 캡처 · 점검 중… (원본은 그대로)</span></div>'
        : m.shotErr ? `<div class="kc-ed"><div class="bad">캡처 실패(${esc(m.shotErr)}) — 자가검증 없이 직접 보고 판단하세요</div></div><div class="kc-eda"><button class="go" data-kapply="${i}">적용 — 파일에 저장</button><button data-kcancel="${i}">취소</button></div>`
        : m.state ? shotHtml(m.state, `미리보기 — ${m.state.problems.length + m.state.errors.length ? `원래 없던 문제 ${m.state.problems.length + m.state.errors.length}개` : '자동 점검 문제 없음'}`, 'state')
          + (m.handedOff ? `<div class="kc-eda">▶ 이 화면을 AI 에게 보여 자가검증 ${(m.verify || 0) + 1}/3 — 아래</div>` : '')
        : '';
      return cards + act + (m.editErr ? `<div class="kc-ed"><div class="bad">${esc(m.editErr)}</div></div>` : '');
    },
    metaHtml(m, i) {
      if (m.streaming) return '';
      const bits = [m.model || '', m.ms ? `${(m.ms / 1000).toFixed(1)}초` : '', m.ctx ? `문맥 ${Math.round(m.ctx / 1000)}천 자` : '', m.sawShot ? '화면 그림 1장' : '', m.stopped ? '멈춤' : ''].filter(Boolean).join(' · ');
      return `<span>${esc(bits)}</span>${m.text ? `<button data-kcopy="${i}">복사</button>` : ''}${m.err || m.stopped ? `<button data-kretry="${i}">다시 묻기</button>` : ''}`;
    },
    chatHtml() {
      let last = null;
      return K.chat.map((m, i) => {
        let sep = '';
        if (m.role === 'user' && m.slide !== last) { sep = `<div class="kc-sep">「${esc(m.slide)}」 페이지에서</div>`; last = m.slide; }
        if (m.role === 'user' && m.auto) return `${sep}<div class="kc-u"><div style="background:#f4f5f7;color:#545b66" title="${esc(m.text)}">▶ 자가검증 ${m.auto}/3 — 캡처 그림 보고 확인${m.autoN ? ` · 자동 점검 문제 ${m.autoN}개` : ''}</div></div>`;
        if (m.role === 'user') return `${sep}<div class="kc-u"><div>${esc(m.text)}</div></div>`;
        return `<div class="kc-a" data-mi="${i}"><div class="kc-av">✦</div><div class="kc-main"><div class="kc-body">${K.ansHtml(m)}</div><div class="kc-meta">${K.metaHtml(m, i)}</div></div></div>`;
      }).join('');
    },
    renderChat(body) {
      document.body.classList.add('kchatmode');
      const sug = K.suggestions(); const turns = K.chat.filter((m) => m.role === 'user').length;
      body.innerHTML = `<div class="kc-top"><span></span><button class="kc-new" ${turns ? '' : 'disabled style="opacity:.4"'}>＋ 새 대화</button></div>
        <div class="kc-wrap"><div class="kc-list">${turns ? K.chatHtml() : `<div class="kc-empty"><div class="kc-logo">✦</div><h3>이 페이지에 대해 무엇이든 물어보세요</h3><div class="kc-sug">${sug.slice(0, 6).map((q) => `<button data-kq="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`}</div><button class="kc-down" title="맨 아래로">↓</button></div>
        ${turns ? `<div class="kc-row">${sug.map((q) => `<button data-kq="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        <div class="kc-comp"><div class="kc-box"><textarea rows="1" placeholder="${turns ? '이어서 물어보세요' : '질문을 적어 보세요'}">${esc(K.draft)}</textarea><button class="kc-send" title="보내기 (Enter)">↑</button></div><div class="kc-hint">Enter 보내기 · Shift+Enter 줄바꿈</div></div>`;
      const ta = body.querySelector('textarea'); const list = body.querySelector('.kc-list');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(160, ta.scrollHeight)}px`; };
      const send = () => { const q = ta.value.trim(); if (q && !K.busy) K.ask(q); };
      ta.oninput = () => { K.draft = ta.value; grow(); K.setSend(); };
      // 엔터 = 보내기, Shift+엔터 = 줄바꿈. 한글 조합 중 엔터는 keydown 이 isComposing 이라 건너뛰는데, 브라우저 · 입력기에 따라 그 엔터가 조합을 끝내며
      // **줄바꿈을 넣고 끝나** Shift+엔터처럼 줄만 바뀌었다(사용자 지적 2026-09-30 "엔터만 쳤는데 줄바꿈이 될 때가 많다").
      // 그래서 실제로 줄바꿈이 들어가려는 순간(beforeinput insertLineBreak · insertParagraph)을 한 번 더 잡는다. 두 길이 겹쳐도 한 번만 보낸다
      let shiftDown = false; let sentAt = 0;
      const sendOnce = () => { if (Date.now() - sentAt < 300) return; sentAt = Date.now(); send(); };
      ta.onkeydown = (e) => { shiftDown = e.shiftKey; if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendOnce(); } };
      ta.onkeyup = (e) => { shiftDown = e.shiftKey; };
      ta.addEventListener('beforeinput', (e) => { if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !shiftDown) { e.preventDefault(); sendOnce(); } });
      body.querySelector('.kc-send').onclick = () => { if (K.busy) K.ctrl?.abort(); else send(); };
      body.querySelector('.kc-new').onclick = () => { if (K.busy) K.ctrl?.abort(); K.chat = []; K.draft = ''; K.render(); };
      body.querySelectorAll('[data-kq]').forEach((b) => { b.onclick = () => { if (!K.busy) K.ask(b.dataset.kq); }; });
      list.onclick = (e) => {
        const c = e.target.closest('[data-kcopy]'); if (c) { navigator.clipboard?.writeText(K.chat[Number(c.dataset.kcopy)].text); c.textContent = '복사됨'; return; }
        const r = e.target.closest('[data-kretry]'); if (r && !K.busy) { const i = Number(r.dataset.kretry); const q = K.chat[i - 1]?.text; K.chat.splice(i - 1, 2); if (q) K.ask(q); }
        const ap = e.target.closest('[data-kapply]'); if (ap) { K.applyEdit(Number(ap.dataset.kapply), ap); return; }
        const sv = e.target.closest('[data-kshot]'); if (sv) { const [mi, key] = sv.dataset.kshot.split(':'); const m = K.chat[Number(mi)]; const sh = key[0] === 's' && m?.shots?.[Number(key.slice(1))]; const st = sh ? { jpg: sh.after || sh.before, base: sh.after ? sh.before : '', label: sh.kind === 'del' ? '이전' : '', note: sh.kind === 'add' ? '새로 추가된 페이지입니다 — 비교할 이전 그림이 없어 이후만 보여 줍니다' : sh.kind === 'del' ? '삭제된 페이지입니다 — 적용하면 이 페이지가 없어집니다(이전 그림을 보여 줍니다)' : '' } : key === 'pass' ? m?.passState : m?.state; if (st) K.shotView(st, sh ? `${m.root || ''} — ${sh.name}` : m.root || ''); return; }
        const ra = e.target.closest('[data-kreask]'); if (ra && !K.busy) { K.againEdit(Number(ra.dataset.kreask)); return; }
        const ca = e.target.closest('[data-kcancel]'); if (ca) { K.chat[Number(ca.dataset.kcancel)].cancelled = true; K.updateMsg(Number(ca.dataset.kcancel)); return; }
        const un = e.target.closest('[data-kundo]'); if (un) { K.undoEdit(Number(un.dataset.kundo), un); }
      };
      // 입력창에 저절로 포커스를 주지 않는다 — 주면 ←/→ 가 장 넘기기 대신 입력창 커서로 먹힌다. 보낸 직후에만 되돌려 준다
      // 사람이 직접 굴린 스크롤만 본다(코드가 옮긴 자리 K.setTop 과 같으면 무시) — 맨 밑에 닿으면 자동 스크롤 재개, 위로 올리면 멈춤
      list.onscroll = () => { K.userMoved(list); K.downBtn(list); };
      body.querySelector('.kc-down').onclick = () => {
        K.follow = 'end'; K.jumping = true; list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        setTimeout(() => { K.jumping = false; K.scrollTo(list, list.scrollHeight); K.downBtn(list); }, 450);
      };
      grow(); K.setSend();
      if (K.busy) K.autoScroll(list); else K.scrollTo(list, list.scrollHeight);
      K.downBtn(list);
      if (K.refocus) { K.refocus = false; ta.focus({ preventScroll: true }); }
    },
    // 보내기 단추 — 받는 중에는 멈춤(■), 빈 입력이면 흐리게
    setSend() {
      const b = document.querySelector('#kpanel .kc-send'); if (!b) return;
      const ta = document.querySelector('#kpanel .kc-box textarea');
      b.textContent = K.busy ? '■' : '↑'; b.title = K.busy ? '멈춤' : '보내기 (Enter)';
      b.disabled = !K.busy && !(ta && ta.value.trim());
    },
    // ═══ 자가검증 순환(사용자 지정 2026-09-29: "이미지 확인하며 최대 3번까지 자가검증하며 수정, 안 되면 롤백") ═══
    // 수정안 → 원본 옆 숨김 사본에 적용해 그 장을 캡처 · 모든 장 자동 점검(/api/shot) → 그림과 점검 결과를 AI 에게 보여 스스로 검증 →
    // "검증 통과"면 [적용], 아니면 AI 가 고친 안으로 다시 캡처 · 검증. 3번 검증해도 통과 못 하면 **롤백** — 사본만 버리므로 원본은 한 번도 안 바뀐다.
    // 왜: 글로 된 점검 결과만 되돌려 주니 문제가 142 → 154 → 172 로 오히려 늘었다(실측) — 모델이 결과 화면을 봐야 고칠 수 있다.
    // "검증 통과"라도 자동 점검(원래 없던 넘침 · 오류)이 남아 있으면 통과로 치지 않는다.
    baseCache: {},
    slideNo(name) { const k = [...document.querySelectorAll('#stage .slide')].findIndex((x) => x.dataset.name === name); return k < 0 ? 1 : k + 1; },
    // 원본 캡처 — 점검 비교(모든 장) + 이전 그림(고치는 장). 예전엔 1장을 찍었다 — 그림은 안 써서 몰랐다(이전과 겹쳐 보기에서 같은 장이 필요, 2026-09-29)
    baseShot(m) { const key = `${m.edit.sha}:${m.edit.slide}`; return (K.baseCache[key] ||= K.post('/api/shot', { file: m.edit.file, html: m.edit.orig, slide: K.slideNo(m.edit.slide) }).catch((e) => { delete K.baseCache[key]; throw e; })); },
    async selfStep(i) {
      const m = K.chat[i]; const round = m.verify || 0;
      const head = stripEdit(m.text).split('\n').slice(0, 3).join(' ');
      // 통과 = 첫 줄 근처나 마지막 줄에 '검증 통과' · 대상별 확인에 '안 됨'이 없음 · 수정안 없음
      const body0 = stripEdit(m.text); const lastLine = body0.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
      if (round > 0 && (/검증\s*통과/.test(head) || /검증\s*통과/.test(lastLine)) && !/안\s*됨/.test(body0) && !m.edits?.items?.length) {
        const st = m.prevState;
        if (st && !st.problems.length && !st.errors.length) { m.passState = st; K.updateMsg(i); return; }
        return K.nextVerify(i, st, 'AI 는 통과라고 했지만 자동 점검에 문제가 남아 있습니다 — 그림을 다시 보세요');
      }
      if (!m.edits) { if (round > 0) K.reask(i, '수정안 블록이나 「검증 통과」가 없었습니다'); return; }   // 첫 답이 설명뿐이면(수정 요청이 아니었으면) 여기서 끝
      // 자가검증 차례에 '검증 통과' 대신 **지금 상태를 그대로 다시 낸** 답 — 사실상 "이대로 좋다"다. 자동 점검이 깨끗하면 통과로 친다
      // (실측: 같은 768자 답을 세 번 되풀이해 롤백됐다 — 되물어도 같은 답이 온다)
      if (round > 0 && /^바뀐 곳이 없습니다/.test(m.edits.err || '') && m.prevState && !m.prevState.problems.length && !m.prevState.errors.length) { m.passState = m.prevState; m.implicitPass = true; K.updateMsg(i); return; }
      if (!m.edits.ok) {
        const why = m.edits.err || m.edits.items.filter((x) => x.bad || x.n !== 1).map((x) => x.bad || `찾을 글이 파일에 ${x.n}번(정확히 1번이어야 함): ${x.find.slice(0, 60)}`).join(' / ');
        return K.reask(i, why);
      }
      const state = { text: m.edits.text, chain: [...(m.edit.chain0 || []), ...m.edits.items.map(({ kind, find, replace }) => ({ kind, find, replace }))] };
      m.shooting = true; K.updateMsg(i);
      try {
        const base = await K.baseShot(m);
        const r = await K.post('/api/shot', { file: m.edit.file, html: state.text, slide: K.slideNo(m.edit.slide) });
        const d = window.DeckCheck.diff(base, r);
        Object.assign(state, { jpg: r.jpg, base: base.jpg, problems: d.problems, errors: d.errors });
        // 두 그림의 바뀐 곳을 코드로 센다 — 자가검증 AI 가 '안 바뀐 결과'도 통과시켰다(bench/ui_run r2 · r3: 카드 자리 바꾸기가 제목만 바뀐 채 통과)
        try { const df = await K.imgDiff(base.jpg, r.jpg); const k = 1600 / df.W;
          state.diff = { n: df.boxes.length, pct: df.pct, boxes: df.boxes.slice(0, 8).map((b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * k))) };
          if (!df.boxes.length) state.problems = [...state.problems, { slide: K.slideNo(m.edit.slide), key: 'nochange', text: '화면이 하나도 바뀌지 않았습니다 — 요청이 반영되지 않음' }];
        } catch (e) { /* 비교 실패 — 그림 없이 */ }
      } catch (e) { m.shooting = false; m.shotErr = e.message; K.updateMsg(i); return; }   // 캡처가 안 되면 예전처럼 사람이 보고 판단
      m.shooting = false; m.state = state; K.updateMsg(i);
      K.nextVerify(i, state);
    },
    // 쓸 수 없는 수정안 — 이유를 그대로 알려 다시 내게 한다(그림 없이). 자가검증 3번 안에 함께 센다
    reask(i, why) {
      const m = K.chat[i]; const round = (m.verify || 0) + 1;
      if (round > 3) { m.rollback = true; K.updateMsg(i); return; }
      m.handedOff = true; m.reasked = true; K.updateMsg(i);
      const st = m.prevState;
      K.ask(`앞 수정안은 쓸 수 없었습니다: ${why}\n처음 요청(「${m.root}」)을 이 점을 고쳐 같은 형식으로 다시 내 주세요.`,
        { retry: round, verify: round, root: m.root, sha: m.edit.sha, orig: m.edit.orig, slide: m.edit.slide, ...(st ? { src: st.text, chain: st.chain, prevState: st } : {}), autoN: 0 });
    },
    // ═══ 미리보기 크게 · 이전과 비교(사용자 지정 2026-09-29 "클릭 시 크게, 이전과 비교해서 뭐가 바뀌었는지 겹쳐서") ═══
    // 네 가지로 본다: 바뀐 곳(이후 그림 위에 바뀐 칸만 밝게 · 빨간 상자) · 겹쳐 보기(이전을 반투명으로 얹고 밀대로 섞기) · 이전 · 이후.
    // 바뀐 곳은 두 캡처(같은 크기 JPEG)를 8px 칸으로 나눠 비교한다 — 화소 하나씩 보면 JPEG 잡티가 전부 '바뀜'으로 잡힌다.
    // 칸 안 표본(2px 간격) 중 RGB 차 합이 90 을 넘는 게 3개 이상이면 바뀐 칸, 이웃 칸으로 한 칸 넓혀 이어진 덩어리를 상자로 묶는다.
    // 두 캡처의 바뀐 곳 — a · b 는 <img> 또는 data URL. 결과 상자는 그림 픽셀 기준(W × H), pct 는 바뀐 칸 비율(%)
    async imgDiff(a0, b0) {
      const img = (x) => (typeof x === 'string' ? new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = x; }) : Promise.resolve(x));
      const [B0, A] = await Promise.all([img(a0), img(b0)]); const W = A.naturalWidth; const H = A.naturalHeight; let boxes = [];
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(B0, 0, 0, W, H); const a = g.getImageData(0, 0, W, H).data; g.drawImage(A, 0, 0, W, H); const b = g.getImageData(0, 0, W, H).data;
      const CS = 8; const gw = Math.ceil(W / CS); const gh = Math.ceil(H / CS); const cnt = new Uint8Array(gw * gh);
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const k = (y * W + x) * 4; if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 90) cnt[((y / CS) | 0) * gw + ((x / CS) | 0)]++; }
      const on = new Uint8Array(gw * gh); for (let k = 0; k < on.length; k++) on[k] = cnt[k] >= 3 ? 1 : 0;
      const grow = new Uint8Array(gw * gh);   // 한 칸 넓혀 가까운 조각을 한 덩어리로
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (on[y * gw + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) grow[yy * gw + xx] = 1; }
      const seen = new Uint8Array(gw * gh);
      for (let k = 0; k < grow.length; k++) { if (!grow[k] || seen[k]) continue; let x0 = gw; let y0 = gh; let x1 = 0; let y1 = 0; let n = 0; const q = [k]; seen[k] = 1;
        while (q.length) { const c = q.pop(); const cx = c % gw; const cy = (c / gw) | 0; n += on[c]; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
          for (const d of [c - 1, c + 1, c - gw, c + gw]) if (d >= 0 && d < grow.length && grow[d] && !seen[d] && Math.abs((d % gw) - cx) <= 1) { seen[d] = 1; q.push(d); } }
        if (n >= 2) boxes.push({ x: x0 * CS, y: y0 * CS, w: (x1 - x0 + 1) * CS, h: (y1 - y0 + 1) * CS, n }); }
      boxes.sort((p, q) => q.n - p.n); boxes = boxes.slice(0, 40);
      const changed = on.reduce((s2, x) => s2 + x, 0);
      return { boxes, W, H, pct: (changed / on.length) * 100 };
    },
    async shotView(st, title) {
      let v = document.querySelector('#kshotv');
      if (!v) { v = document.createElement('div'); v.id = 'kshotv'; document.body.appendChild(v);
        v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('.kx2')) v.classList.remove('on'); });
        addEventListener('keydown', (e) => { if (e.key === 'Escape' && v.classList.contains('on')) { e.stopImmediatePropagation(); v.classList.remove('on'); } }, true); }
      const has = !!st.base;
      v.innerHTML = `<div class="kv-h"><b>미리보기</b><span class="kv-q">${esc(title)}</span><span class="kv-tabs">${has ? '<button data-kv="diff" class="on">바뀐 곳</button><button data-kv="onion">겹쳐 보기</button><button data-kv="before">이전</button>' : ''}<button data-kv="after" class="${has ? '' : 'on'}">${esc(st.label || '이후')}</button>`
        // 섞기 밀대는 [겹쳐 보기] 바로 밑에 띄운다 — 줄 안에 두면 나타날 때 옆 버튼들이 밀렸다(사용자 지적 2026-09-30)
        + `<span class="kv-mix" style="display:none">이전 <input type="range" min="0" max="100" value="50"> 이후</span></span><button class="kx2" title="닫기 (Esc)">✕</button></div>`
        + `<div class="kv-b"><div class="kv-box"><img class="kv-a" src="${st.jpg}"><img class="kv-0" src="${st.base || ''}" style="display:none"><canvas class="kv-c"></canvas></div></div><div class="kv-f">${has ? '비교 중…' : esc(st.note || '이전 그림이 없는 미리보기입니다(새로고침 전에 만든 것) — 이후만 보여 줍니다')}</div>`;
      v.classList.add('on');
      const box = v.querySelector('.kv-box'); const A = v.querySelector('.kv-a'); const B0 = v.querySelector('.kv-0'); const C = v.querySelector('.kv-c'); const mix = v.querySelector('.kv-mix'); const foot = v.querySelector('.kv-f');
      const load = (im) => (im.complete && im.naturalWidth ? Promise.resolve() : new Promise((ok) => { im.onload = ok; im.onerror = ok; }));
      await load(A); const W = A.naturalWidth || 1600; const H = A.naturalHeight || 900;
      const fitBox = () => { const w = Math.min(innerWidth * 0.96, (innerHeight - 130) * W / H); box.style.width = `${w}px`; box.style.height = `${w * H / W}px`; };
      fitBox(); addEventListener('resize', fitBox);
      let boxes = [];
      if (has) {
        await load(B0);
        const df = await K.imgDiff(B0, A); boxes = df.boxes;
        foot.textContent = boxes.length ? `바뀐 곳 ${boxes.length}군데 · 화면의 ${df.pct.toFixed(1)}% — 빨간 상자가 바뀐 자리입니다` : '눈에 보이는 차이가 없습니다(두 그림이 같음)';
        C.width = W; C.height = H; const cg = C.getContext('2d');
        cg.fillStyle = 'rgba(255,255,255,.62)'; cg.fillRect(0, 0, W, H);                         // 안 바뀐 곳은 흐리게
        boxes.forEach((r) => cg.clearRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8));                  // 바뀐 곳은 원래 밝기로
        cg.strokeStyle = '#DC2626'; cg.lineWidth = Math.max(2, W / 500); boxes.forEach((r) => cg.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8));
      }
      const show = (mode) => {
        v.querySelectorAll('[data-kv]').forEach((b) => b.classList.toggle('on', b.dataset.kv === mode));
        A.style.display = mode === 'before' ? 'none' : ''; B0.style.display = mode === 'before' || mode === 'onion' ? '' : 'none';
        B0.style.opacity = mode === 'onion' ? String(1 - mix.querySelector('input').value / 100) : '1'; B0.style.position = mode === 'onion' ? 'absolute' : '';
        C.style.display = mode === 'diff' ? '' : 'none'; mix.style.display = mode === 'onion' ? '' : 'none';
        const ob = v.querySelector('[data-kv="onion"]'); if (ob && mode === 'onion') mix.style.left = `${ob.offsetLeft}px`;
      };
      mix.querySelector('input').oninput = () => show('onion');
      v.querySelectorAll('[data-kv]').forEach((b) => { b.onclick = () => show(b.dataset.kv); });
      show(has ? 'diff' : 'after');
    },
    // 덱 작성 규칙 — DECK.md 의 2~6장(말 · 글자 크기 · 인포그래픽 · 숫자 · 색)을 AI 수정 문맥에 원문 그대로 붙인다(사용자 지정 2026-09-30
    // "엔진에 적어둔 디자인 · 글자 규칙을 AI 가 수정할 때 스킬로"). 요약본을 따로 두면 DECK.md 와 어긋나므로 매번 파일에서 잘라 온다(8.7천 자).
    // 1장(엔진 사용법)과 7장(끝내기 전 확인 — 도구 실행)은 사람 · Claude Code 용이라 뺀다. 덱 폴더에 DECK.md 가 없으면 붙이지 않는다
    async deckRules() {
      if (K.rulesP) return K.rulesP;
      K.rulesP = fetch(K.cfg.rulesUrl || 'DECK.md', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
        const a = t.search(/^## 2\./m); const b = t.search(/^## 7\./m); return a < 0 ? '' : t.slice(a, b > a ? b : undefined).trim();
      }).catch(() => '');
      return K.rulesP;
    },
    // 그림 부품 사용법 — js/deckviz.js 에서 window.Viz 로 내보내는 함수마다 바로 위 주석 + 선언 줄을 뽑는다(사용자 신고 2026-09-30:
    // AI 가 '도넛으로' 요청에 Viz.ring3d 를 인자 모양을 모른 채 불러 'parts.reduce is not a function'). 파일에서 매번 뽑아 어긋나지 않게
    async vizApi() {
      if (!window.Viz) return '';
      if (K.vizP) return K.vizP;
      K.vizP = fetch('js/deckviz.js', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
        const L = t.split('\n'); const out = [];
        L.forEach((ln, k) => { const m = ln.match(/^\s*const (\w+) = (\([^)]*\)|\w+) =>/); if (!m || !(m[1] in window.Viz)) return;
          const c = []; for (let j = k - 1; j >= 0 && /^\s*\/\//.test(L[j]); j--) c.unshift(L[j].trim());
          out.push([...c, `Viz.${m[1]} = ${m[2]} => …`].join('\n')); });
        return out.join('\n\n');
      }).catch(() => '');
      return K.vizP;
    },
    // 사람이 누른 [다시 요청] — 왜 못 썼는지 모아 원본 파일 기준으로 새로 부탁한다(자가검증 3번을 새로 센다)
    againEdit(i) {
      const m = K.chat[i]; if (!m?.edit) return;
      const E = m.edits || {};
      const why = m.rollback && !E.err && E.ok !== false ? '3번 자가검증해도 그림에서 문제가 남았습니다 — 더 단순한 배치로 다시 내 주세요'
        : E.err || (E.items || []).filter((x) => x.bad || x.n !== 1).map((x) => x.bad || `찾을 글이 파일에 ${x.n}번(정확히 1번이어야 함): ${x.find.slice(0, 60)}`).join(' / ') || '수정안을 쓸 수 없었습니다';
      m.manualAgain = true; K.updateMsg(i);
      K.ask(`↻ 다시 요청 — 앞 수정안은 쓸 수 없었습니다: ${why}\n처음 요청(「${m.root}」)을 이 점을 고쳐 같은 형식으로 다시 내 주세요.`, { edit: true, root: m.root });
    },
    nextVerify(i, state, note = '') {
      const m = K.chat[i]; const round = (m.verify || 0) + 1;
      if (round > 3 || !state) { m.rollback = true; K.updateMsg(i); return; }
      m.handedOff = true; K.updateMsg(i);
      const probs = [...state.errors.map((e) => `스크립트 오류: ${e}`), ...state.problems.slice(0, 10).map((p) => `${p.slide}페이지 ${p.text}`)];
      K.ask(`자가검증 ${round}/3 — 처음 요청: 「${m.root}」\n${state.base ? `첨부 그림 두 장 — 첫째는 고치기 전, 둘째는 지금 수정안을 적용한 뒤의 「${m.edit.slide}」 장 화면(1600×900)입니다.` : `첨부 그림은 지금 수정안을 적용한 「${m.edit.slide}」 장 화면(1600×900)입니다.`}${note ? `\n${note}.` : ''}\n`
        + `자동 점검(원래 없던 문제): ${probs.length ? `\n${probs.map((x) => `- ${x}`).join('\n')}` : '문제 없음'}\n`
        + (state.diff ? `자동 비교(두 그림의 화소 차이): 바뀐 곳 ${state.diff.n}군데 · 화면의 ${state.diff.pct.toFixed(1)}%${state.diff.n ? ` — 자리(x, y, 너비, 높이 · 1600×900 기준): ${state.diff.boxes.map((b) => `(${b.join(', ')})`).join(' ')}` : ''}. 요청한 곳이 이 목록에 없으면 반영되지 않은 것이고, 요청과 상관없는 곳이 바뀌었으면 문제다.\n` : '')
        + '\n'
        + '그림을 보고 ① 요청대로 바뀌었는지 ② 글자 · 도형 겹침, 잘림, 카드나 무대 밖 넘침, 읽기 힘들게 작은 글자가 없는지 ③ 새로 쓴 글 · 색 · 크기가 「덱 작성 규칙」(명사형 제목 · 개조식 · --fs-* · --c-*)을 지키는지 ④ 요청한 대상 **전부**에 적용됐는지(둘이면 둘 다 · 빠지거나 안 그려진 것 · 원래 있던 정보가 사라진 것은 없는지) 두 그림을 비교해 스스로 검증하세요.\n'
        + '- 먼저 「요청 대상별 확인」을 대상마다 한 줄씩 적는다(예: 「왼쪽 카드 → 오른쪽: 됨」 「919 색: 안 됨」). 그림에서 직접 확인한 것만 됨이다.\n'
        + '- 전부 됨이고 위 문제가 없을 때만 **마지막 줄**에 **검증 통과** 라고 쓰고 수정안은 내지 마세요.\n'
        + '- 문제가 있으면 무엇이 문제인지 한 줄로 쓰고, 아래 「지금 상태」를 고친 완성본을 같은 형식으로 내세요.',
        { retry: round, verify: round, root: m.root, src: state.text, sha: m.edit.sha, orig: m.edit.orig, chain: state.chain, images: state.jpg ? (state.base ? [state.base, state.jpg] : [state.jpg]) : [], prevState: state, slide: m.edit.slide, autoN: probs.length });
    },
    // [적용] — 서버가 다시 세고 백업한 뒤 저장한다. 저장되면 대화를 이 탭에 맡겨 두고 새로고침(고친 덱을 바로 본다)
    async post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; },
    async applyEdit(i, btn) {
      const m = K.chat[i]; btn.disabled = true; m.editErr = '';
      const items = m.passState ? m.passState.chain : m.edits.items.map(({ kind, find, replace }) => ({ kind, find, replace }));   // 자가검증을 거쳤으면 원본부터의 수정 사슬 전부
      try { const j = await K.post('/api/edit', { file: m.edit.file, sha: m.edit.sha, slide: m.edit.slide, edits: items, src: 'ai', note: String(m.root || '').slice(0, 70) });   // src · note — 버전 기록에 「AI 수정 — 부탁 내용」으로 남는다
        m.applied = j.backup; K.keepChat(); location.reload();
      } catch (e) { m.editErr = `저장 못 함: ${e.message}`; K.updateMsg(i); }
    },
    async undoEdit(i, btn) {
      const m = K.chat[i]; btn.disabled = true;
      try { await K.post('/api/edit/undo', { file: m.edit.file }); m.undone = true; K.keepChat(); location.reload(); } catch (e) { m.editErr = `되돌리기 못 함: ${e.message}`; K.updateMsg(i); }
    },
    // 새로고침을 건너 대화를 잇는다 — sessionStorage(이 탭 한정). 원본(src)은 크니 빼고, 다시 열리면 지운다
    chatKey: () => `deckkit.chat:${location.pathname}`,
    keepChat() { try { sessionStorage.setItem(K.chatKey(), JSON.stringify({ slide: K.cfg.current().dataset.name, chat: K.chat.map((m) => (m.edit ? { ...m, edit: { file: m.edit.file, sha: m.edit.sha, slide: m.edit.slide }, state: m.state && { jpg: m.state.jpg, base: m.state.base, problems: m.state.problems, errors: m.state.errors }, prevState: null, passState: m.passState && { jpg: m.passState.jpg, base: m.passState.base, problems: [], errors: [], chain: [] } } : m)) })); } catch (e) { /* 저장소 없음 */ } },
    restoreChat() {
      try { const raw = sessionStorage.getItem(K.chatKey()); if (!raw) return false; sessionStorage.removeItem(K.chatKey());
        const o = JSON.parse(raw); K.chat = o.chat || []; return true; } catch (e) { return false; }
    },
    // 적용 직후 점검 — 스크립트 오류, 지금 장에서 무대(1600×900) 밖으로 나간 요소. 있으면 방금 적용한 수정안 밑에 적어 [되돌리기]를 권한다
    checkAfterEdit() {
      const m = [...K.chat].reverse().find((x) => x.applied && !x.undone); if (!m) return;
      const errs = (window.__deckEditErrs || []).slice(0, 3);
      const sl = K.cfg.current(); const S = document.querySelector('#stage').getBoundingClientRect(); const k = S.width / 1600; let over = 0;
      sl.querySelectorAll('*').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.height && ((r.right - S.left) / k > 1602 || (r.bottom - S.top) / k > 902)) over++; });
      // 카드 밖 넘침 — 무대 안이어도 글이 카드 위로 튀어나와 설명 줄과 겹치거나 카드 아래로 잘린다(실측: '그래프를 세로로' 적용이 점검을 통과했다).
      // 카드(.cardx · .card · .box) 안의 글·그림 요소가 카드 테두리를 4px 넘게 벗어나면 센다. 카드 자체가 overflow:hidden 이면 잘린 것도 넘침이다
      let esc = 0;
      sl.querySelectorAll('.cardx, .card, .box').forEach((c) => { const cr = c.getBoundingClientRect(); if (!cr.width) return;
        c.querySelectorAll('*').forEach((el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
          if (r.left < cr.left - 4 || r.right > cr.right + 4 || r.top < cr.top - 4 || r.bottom > cr.bottom + 4) esc++; }); });
      const warn = [errs.length ? `스크립트 오류: ${errs.join(' / ')}` : '', over ? `화면 밖으로 넘친 요소 ${over}개` : '', esc ? `카드 밖으로 넘친 요소 ${esc}개` : ''].filter(Boolean).join(' · ');
      m.editErr = warn ? `적용 뒤 점검 — ${warn} → [되돌리기]를 권합니다` : ''; m.checked = !warn;
    },
    // 받는 중인 답 하나만 다시 그린다(패널 전체를 다시 그리면 입력 중인 글·스크롤이 흔들린다)
    updateMsg(i) {
      const el = document.querySelector(`#kpanel .kc-a[data-mi="${i}"]`); if (!el) return;
      const list = el.closest('.kc-list'); if (list) K.userMoved(list);
      el.querySelector('.kc-body').innerHTML = K.ansHtml(K.chat[i]); el.querySelector('.kc-meta').innerHTML = K.metaHtml(K.chat[i], i);
      if (list) { if (K.chat[i].streaming) K.autoScroll(list); K.downBtn(list); }
    },
    // ═══ 받는 중 자동 스크롤 — ChatGPT 식(사용자 지정 2026-09-28) ═══
    // follow: 'pin' 보낸 직후 — 맨 밑을 따라가다 **답이 3줄 보이면** 멈춘다(답 첫머리를 읽는 중에 글이 밀려 올라가지 않게). 그 아래는 ↓ 로 "더 있음".
    //         처음엔 "질문이 목록 맨 위에 닿을 때까지" 따라갔는데, 이어 묻기는 질문이 화면 맨 밑에서 시작해 20줄 가까이 따라가
    //         안 멈추는 것처럼 보였다(사용자 지적 2026-09-28) — 그래서 질문 위치가 아니라 답 줄 수로 멈춘다.
    //         'end' 사람이 맨 밑까지 내렸거나 ↓ 를 눌렀다 — 끝까지 따라간다. 'off' 사람이 위로 올렸다 — 건드리지 않는다.
    autoScroll(list) {
      if (K.follow === 'off') return;
      const bottom = list.scrollHeight - list.clientHeight;
      if (K.follow === 'end') { K.scrollTo(list, bottom); return; }
      const qs = list.querySelectorAll('.kc-u'); const a = qs[qs.length - 1]?.nextElementSibling;
      if (!a) { K.scrollTo(list, bottom); return; }
      const LINE = 25; // .kc-body 14.5px × 1.72
      const stopAt = a.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop + LINE * 3 + 12 - list.clientHeight;
      K.scrollTo(list, Math.min(bottom, Math.max(list.scrollTop, stopAt)));
    },
    // 사람이 스크롤을 옮겼으면 그 자리로 따라가기를 정한다 — 글을 덧붙이기 **직전**에도 부른다: 휠은 부드럽게 굴러가는 동안
    // 글이 늘어 바닥이 계속 내려가므로, 스크롤 신호만 보면 "바닥에 닿은 순간"을 놓친다(실측: 휠을 끝까지 굴려도 재개 안 됨)
    userMoved(list) {
      if (!K.busy || K.jumping || Math.abs(list.scrollTop - K.setTop) <= 1) return;
      K.follow = K.atBottom(list) ? 'end' : 'off'; K.setTop = list.scrollTop;
    },
    // 코드가 옮긴 자리를 적어 둔다 — onscroll 이 이것과 같으면 사람이 굴린 게 아니다
    scrollTo(list, top) { list.scrollTop = top; K.setTop = list.scrollTop; },
    atBottom: (list) => list.scrollHeight - list.scrollTop - list.clientHeight < 24,
    downBtn(list) { list.parentElement.querySelector('.kc-down')?.classList.toggle('on', !K.atBottom(list)); },
    // 문맥 = 지금 장의 보이는 글 + 이 장의 실행 기록(덱이 준다) + 이 단계 코드 발췌 전부
    // 덱 전체 문맥(cfg.wholeDeck) — AI 가 덱을 다 안다고 보고 여러 장에서 근거를 모아 답하게, 장마다 번호 · 화면 글 · 원자료를 싣는다.
    // 안 보이는 장은 visibility:hidden 이라 innerText 가 비어 나온다 → 읽는 순간만 visible 로 바꿨다가 되돌린다(opacity 0 그대로라 깜빡임 없음).
    // 크기: 13장 덱이 약 3만 자 — serve.py 본문 한도(200KB, 한글 3바이트)와 모델 문맥 안에 들게 장마다 글 3천 자 · 원자료 4천 자로 자른다.
    slideText(sl) { const v = sl.style.visibility; sl.style.visibility = 'visible'; const t = (sl.innerText || '').replace(/\n{2,}/g, '\n'); sl.style.visibility = v; return t; },
    deckContext() {
      const cur = K.cfg.current(); const all = [...document.querySelectorAll('#stage .slide')];
      const parts = all.map((sl, i) => { const extra = (K.cfg.contextOf?.(sl) || '').slice(0, 4000);
        return `### [${i + 1}] ${sl.dataset.name}${sl === cur ? ' ← 지금 보고 있는 장' : ''}\n${K.slideText(sl).slice(0, 3000)}${extra ? `\n(원자료) ${extra}` : ''}`; });
      const how = '- 사람에게 말할 때는 슬라이드 한 장을 「장」이 아니라 「페이지」라고 부른다(「3페이지」 · 「이 페이지」).\n'
      + '- 이 덱 전체를 이미 알고 있다고 보고 답한다. 질문에 필요한 자료를 **여러 장에서 모아** 결론을 먼저 말하고, 이어서 근거를 목록으로 든다.\n'
        + `- 근거마다 그 장 링크를 \`[장 이름](#장번호)\` 꼴로 붙인다(장번호는 아래 [번호]). 예: 정답률은 v1 83.1% → v2 99.2% [정답률](#${all.findIndex((x) => x.dataset.name === '정답률') + 1 || 3})\n`
        + '- 질문이 지금 장에 관한 것이면 지금 장을 먼저 쓴다. 덱에 없는 수치·원인은 지어내지 말고 "덱에는 없습니다"라고 한다.';
      return `## 덱 소개\n${K.cfg.intro || ''}\n\n## 답하는 방식\n${how}\n\n## 지금 보고 있는 장\n[${all.indexOf(cur) + 1}] ${cur.dataset.name}\n\n## 덱 전체(장 번호 · 화면 글 · 원자료)\n${parts.join('\n\n')}`.slice(0, 60000);
    },
    context() {
      if (K.cfg.wholeDeck) return K.deckContext();
      const sl = K.cfg.current();
      const text = (sl.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 7000);
      const extra = K.cfg.contextOf?.(sl) || '';
      // 코드는 함수 본문 전체가 실려 있다(최대 1천여 줄) — AI 문맥 한도(모델 65K 토큰) 안에 들도록 함수마다 앞 180줄만 보낸다
      const code = K.nodes().map((n) => { const ls = n.code.split('\n'); return `### ${n.path}:${n.line} — ${n.fn} (${n.role})${n.llm ? ` [LLM 용도=${n.llm}]` : ''}\n${ls.slice(0, 180).join('\n')}${ls.length > 180 ? `\n… (이하 ${ls.length - 180}줄 생략 — 화면 코드 보기에는 전부 있음)` : ''}`; }).join('\n\n').slice(0, 70000);
      const intro = K.cfg.intro || '';
      return `## 덱 소개\n${intro}\n\n## 지금 장「${sl.dataset.name}」의 화면 글\n${text}\n\n## 이 장의 실행 기록(실제 값)\n${extra}\n\n## 이 단계의 코드 발췌(파일:줄, 주석 원문)\n${code || '(이 장에 연결된 코드 단계 없음)'}`.slice(0, 150000);
    },
    // 질문 하나 — 앞 대화(질문·답)를 history 로, 지금 장의 문맥은 이번 질문에만. 답은 NDJSON 조각({"d"})으로 받는 대로 그린다
    // opts.retry = 미리보기 점검에서 문제가 나 자동으로 다시 부탁한 횟수(최대 2), opts.root = 사람이 처음 한 요청
    async ask(q, opts = {}) {
      if (K.busy) return;
      const slide = K.cfg.current().dataset.name;
      const history = K.chat.filter((m) => !m.err && !m.streaming && m.text)
        .map((m) => ({ role: m.role, content: m.role === 'user' ? `(「${m.slide}」 장에서) ${m.text}` : m.text })).slice(-16);
      K.chat.push({ role: 'user', text: q, slide, ...(opts.retry ? { auto: opts.retry, autoN: opts.autoN } : {}), ...(opts.thumbs ? { thumbs: opts.thumbs } : {}) });
      const a = { role: 'assistant', text: '', slide, streaming: true, retry: opts.retry || 0, verify: opts.verify || 0, root: opts.root || q, prevState: opts.prevState || null }; K.chat.push(a); const ai = K.chat.length - 1;
      K.refocus = document.activeElement?.closest?.('.kc-box') != null; // 입력창에서 보냈으면 이어 쓰게 포커스 유지
      K.draft = ''; K.tab = 'ai'; document.body.classList.add('kside'); K.follow = 'pin'; K.render(); K.relayout();
      let ctx = K.context(); const t0 = performance.now();
      // 고칠 수 있는 덱이면 **늘** 원본을 함께 보내고, 고칠지 말지는 AI 가 판단한다(사용자 지정 2026-09-29 "ai 판단하게 가는 줄").
      // 예전엔 질문에 고치기 낱말(바꿔 · 넣어 …)이 있을 때만 보냈다 — "그래 그렇게 해줘" · "적절한 거 넣었니?" 가 일반 질문으로 가
      // 수정안이 카드 없이 글로만 나오고, 원본이 없으니 찾을 글도 지어냈다. 원본을 늘 붙여도 답 시간은 거의 같다(실측: 문맥 1만 자 1.5~2.9초 ↔ 5.4만 자 2.8초)
      if (K.cfg.editable && !opts.noEdit) {   // noEdit — 설명 질문으로 판단된 부탁(deckagent 의 gemma 엔진 나누기)
        // 자가검증 라운드(opts.src)는 파일이 아니라 **앞 수정이 적용된 지금 상태**를 준다. sha · orig 는 늘 원본 파일 것 — 적용은 원본에 사슬(chain)째 한다
        try { const src = opts.src ?? await (await fetch(location.pathname, { cache: 'no-store' })).text();
          a.edit = { file: location.pathname, sha: opts.sha || await sha256(src), src, orig: opts.orig ?? src, chain0: opts.chain || [] };  // sec · ini · slide 는 아래에서 채운다
          // 원본 전체만 주면 LLM 이 없는 태그를 지어냈다(실측: <h2 class="eyebrow"> — 파일엔 <div class="eyebrow">). 지금 장의 마크업과
          // 그 장을 그리는 스크립트(INIT['장 이름'])를 먼저 뽑아 준다 — 대부분의 "간단한 수정"은 이 두 조각 안에 있다.
          const nm = opts.slide || K.cfg.current().dataset.name; const esc2 = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const sec = (src.match(new RegExp(`<section[^>]*data-name="${esc2(nm)}"[\\s\\S]*?</section>`)) || [''])[0];
          // 한 줄짜리(굳혀 비운) INIT 먼저 — 예전 규칙('줄바꿈 뒤 };'까지)은 한 줄 INIT 에서 다음 장 INIT 까지 삼켰다(2026-09-30: 정답률 ↔ 서식별 차이)
          const ini = (src0 => (src0.match(new RegExp(`^INIT\\['${esc2(nm)}'\\] = [^\\n]*\\};[ \\t]*$`, 'm')) || src0.match(new RegExp(`INIT\\['${esc2(nm)}'\\] = [\\s\\S]*?\\n};`)) || [''])[0])(src);
          // 그리는 스크립트를 글자로 못 찾는데 화면 글이 파일과 다르다 = 목록 스크립트가 그리는 장(간지). 마크업을 고치면 굳힌다(data-frozen)
          const live = [...document.querySelectorAll('#stage .slide')].find((x) => x.dataset.name === nm);
          const txt = (h) => { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('.cast').forEach((x) => x.remove()); return d.textContent.replace(/\s+/g, ' ').trim(); };
          const autoFreeze = !ini && !/^<section[^>]*\sdata-frozen=/.test(sec) && !!live && txt(sec.replace(/^<section[^>]*>|<\/section>$/g, '')) !== txt(live.innerHTML);
          Object.assign(a.edit, { slide: nm, sec, ini, autoFreeze });
          const rules = await K.deckRules(); const viz = await K.vizApi();
          ctx += `\n\n## 덱 고치기 — 이 덱 파일(${location.pathname})\n${EDIT_HOW}\n${rules ? '- 새로 쓰거나 바꾸는 글 · 크기 · 색 · 배치는 아래 「덱 작성 규칙」을 따른다(제목은 명사형, 설명은 개조식, 글자 크기는 --fs-* 단계, 색은 --c-* 변수).\n' : ''}${K.cfg.tools ? TOOLS_HOW : ''}- find 는 먼저 아래 「지금 장의 마크업」·「지금 장을 그리는 스크립트」에서 찾는다. 거기 없는 글이면 원본 전체에서 찾는다.\n\n`
            + (viz ? `### 그림 부품 Viz.* 사용법(js/deckviz.js 원문 발췌 — 부를 때 인자 모양을 이대로)\n\`\`\`js\n${viz}\n\`\`\`\n\n` : '')
            + (rules ? `### 덱 작성 규칙 — DECK.md 2~6장(사용자가 여러 번 고쳐 준 규칙, 원문 그대로)\n${rules}\n\n` : '')
            + `### 지금 장의 마크업(${opts.src ? '지금 상태 — 앞 수정이 적용됨' : '원본 그대로'})\n\`\`\`html\n${sec || '(못 찾음)'}\n\`\`\`\n\n### 지금 장을 그리는 스크립트(${opts.src ? '지금 상태' : '원본 그대로'})\n\`\`\`js\n${ini || '(없음 — 이 장은 마크업만으로 그려진다. 스크립트 블록(```js)은 내지 않는다)'}\n\`\`\`${/^<section[^>]*\sdata-frozen=/.test(sec) ? '\n이 장은 고정된 장(data-frozen)이다 — 스크립트가 다시 그리지 않고 마크업이 곧 화면이다. 마크업만 고치고 data-frozen 은 지우지 않는다.' : ''}\n\n### ${opts.src ? '지금 상태의 HTML 전체' : '원본 HTML 전체'}\n\`\`\`html\n${src}\n\`\`\``; } catch (e) { /* 원본을 못 읽으면 고치기 없이 답만 */ }
      }
      K.busy = true; K.ctrl = new AbortController(); K.setSend();
      try {
        // 첫 질문(자가검증 차례가 아니면) — 지금 장 화면을 그림으로 붙인다. 12초 안에 못 찍으면 그림 없이
        let imgs = opts.images || [];
        // 사람이 첨부한 그림(deckagent 의 입력칸 첨부) — 먼저 싣고, 자리(최대 2장)가 남으면 지금 장 화면을 더한다
        if (opts.userImages?.length) { imgs = opts.userImages.slice(0, 2); ctx += `\n\n## 사람이 첨부한 그림\n첨부 그림 ${imgs.length}장(앞쪽)은 사람이 올린 것이다 — 질문과 함께 보고 답한다.`; }
        if (imgs.length < 2 && !opts.images?.length && !opts.src && K.cfg.editable) {
          const shot = await Promise.race([K.curShot(opts.slide || slide).catch(() => null), new Promise((ok) => setTimeout(() => ok(null), 12000))]);
          if (shot?.jpg) { imgs = [...imgs, shot.jpg]; a.sawShot = true; ctx += `\n\n## 첨부 그림\n「${opts.slide || slide}」 장의 지금 화면(1600×900 캡처)이다. 배치 · 색 · 크기 · 겹침은 그림을 보고 판단한다.`; }
        }
        const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, context: ctx, history, stream: true, images: imgs, thinking: !!(K.cfg.thinking || opts.thinking), think_tokens: K.cfg.thinkTokens || 0 }), signal: K.ctrl.signal });
        if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
        const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let k;
          while ((k = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
            if (!line) continue;
            const j = JSON.parse(line);
            if (j.d) { a.text += j.d; K.updateMsg(ai); }
            if (j.r) { a.think = (a.think || 0) + j.r; if (!a.text) K.updateMsg(ai); }
            if (j.error) a.err = j.error;
            if (j.done) { a.model = j.model; a.fin = j.fin || ''; }
          }
        }
        if (!a.text && !a.err) a.err = '빈 답';
        // 수정 모드가 아니었는데 답에 수정안 블록이 있다 — 지금 파일을 받아 카드로 만든다(찾을 글은 서버가 다시 정확히 센다)
        if (!a.edit && K.cfg.editable && /<{5,}\s*(찾기|이 장|조작)|```html\s*\n\s*<section/.test(a.text)) {
          try { const src = await (await fetch(location.pathname, { cache: 'no-store' })).text(); const esc2 = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            a.edit = { file: location.pathname, sha: await sha256(src), src, orig: src, chain0: [], slide,
              sec: (src.match(new RegExp(`<section[^>]*data-name="${esc2(slide)}"[\\s\\S]*?</section>`)) || [''])[0],
              ini: (src0 => (src0.match(new RegExp(`^INIT\\['${esc2(slide)}'\\] = [^\\n]*\\};[ \\t]*$`, 'm')) || src0.match(new RegExp(`INIT\\['${esc2(slide)}'\\] = [\\s\\S]*?\\n};`)) || [''])[0])(src) };
          } catch (e) { /* 원본을 못 읽으면 글로만 */ }
        }
        if (a.edit) a.edits = parseEdits(a.text, a.edit.src, a.edit);
        // 길이 제한에 잘린 답 — 수정안이 깨졌으면 까닭을 '잘림'으로 바꿔 되묻는다(실측: 격자 200칸을 통째로 다시 쓰다 반복에 빠져 잘림 → '바뀐 곳이 없습니다'만 3번)
        if (a.fin === 'length' && a.edits && !a.edits.ok) a.edits = { ...a.edits, ok: false, err: '답이 길이 제한에서 잘렸습니다 — 페이지를 통째로 다시 쓰지 말고, 바뀌는 줄만 ① 찾기/바꾸기나 ③ 조작(맞바꾸기 · 앞에 · 뒤에 · 지우기)으로 내세요' };
      } catch (e) {
        if (e.name === 'AbortError') a.stopped = true; else a.err = `${e.message} — 8899 서버(serve.py)로 열었는지 확인하세요`;
      }
      a.streaming = false; a.ms = performance.now() - t0; a.ctx = ctx.length;
      K.busy = false; K.ctrl = null; K.updateMsg(ai); K.setSend();
      if (a.edit && !a.err && !a.stopped && window.DeckCheck) K.selfStep(ai);   // 저장 전에 미리보기에 적용 · 캡처 · 자가검증
    },
    // 세부 카드 — 무대 좌표(x,y) 근처에. goto 는 {idx, label}
    popover({ x, y, title, sub = '', html = '', goto = null, askQ = null, full = null, sel = undefined }) {
      // 떠 있는 카드 대신 **오른쪽 패널**에 연다 — 슬라이드는 왼쪽으로 밀려 그대로 보인다(사용자 지정 2026-09-28)
      window.DeckZoom?.reset();
      K.mark(sel);
      K.detail = { title, sub, html, goto, askQ, full }; K.open('detail');
      return;
      const pop = document.querySelector('#kpop');
      pop.innerHTML = `<button class="kpx">✕</button><h4>${esc(title)}</h4><div class="sub">${esc(sub)}</div>${html}<div class="acts">${goto ? `<button class="go">「${esc(goto.label)}」 페이지로 가기 →</button>` : ''}${full ? '<button class="fv">전문 크게 보기</button>' : ''}${askQ ? '<button class="ai">✦ AI 에게 자세히</button>' : ''}</div>`;
      pop.classList.add('on');
      const W = 1600; const H = 900;
      pop.style.left = `${Math.max(16, Math.min(W - 540, x + 14))}px`;
      pop.style.top = `${Math.max(16, Math.min(H - 40 - Math.min(620, pop.offsetHeight || 400), y + 10))}px`;
      pop.querySelector('.kpx').onclick = () => pop.classList.remove('on');
      if (goto) pop.querySelector('.go').onclick = () => { pop.classList.remove('on'); K.cfg.goto(goto.idx); };
      if (full) pop.querySelector('.fv').onclick = () => { pop.classList.remove('on'); K.full(full); };
      if (askQ) pop.querySelector('.ai').onclick = () => { pop.classList.remove('on'); K.open('ai'); K.ask(askQ); };
    },
    // 누른 요소 표시 — sel 을 주면 그것, 아니면 방금 누른 곳에서 가장 가까운 막대·띠·카드. null 이면 표시 없음
    mark(sel) {
      K.unmark();
      const t = sel === undefined ? K.lastEl : sel; K.lastEl = null;
      const el = t && t.closest ? t.closest('.gbar, .gband, [data-ksel], .fitem, [data-ch], .row, .card, .node, button') : null;
      if (!el || !el.closest('#stage') || el.matches('.foot button, [data-more], [data-kcode], [data-kask]')) return;
      el.classList.add('ksel'); el.closest('.slide')?.classList.add('kdim'); K.selEl = el;
    },
    unmark() { document.querySelectorAll('.ksel').forEach((x) => x.classList.remove('ksel')); document.querySelectorAll('.kdim').forEach((x) => x.classList.remove('kdim')); K.selEl = null; },
    hidePop() { K.unmark(); document.querySelector('#kpop')?.classList.remove('on'); document.querySelector('#kfull')?.classList.remove('on'); if (K.detail) { K.detail = null; if (K.tab === 'detail') K.tab = 'code'; } },
    // 전문 보기 — 잘라 내지 않은 원문을 무대 크기의 창에 전부. sections: [{label, text, note}] 또는 [{group, items:[...]}]
    // 원문 묶음 — 오른쪽 패널의 세부 탭에(떠 있는 창을 따로 두지 않는다). 긴 상자는 높이를 묶고 「크게 보기」로 연다
    full({ title, sub = '', sections = [] }) {
      // 묶음(호출 하나 등)은 접었다 펴게 — 여러 개가 줄줄이 이어져 패널이 끝없이 길어지지 않게. 묶음이 하나면 펼쳐 둔다
      const blk = (x) => `<div class="blk"><b>${esc(x.label)} — ${String(x.text ?? '').length.toLocaleString()}자</b><pre>${esc(x.text)}</pre></div>`;
      const groups = sections.filter((x) => x.items);
      const html = sections.map((x) => (x.items
        ? `<details class="kgd"${groups.length === 1 ? ' open' : ''}><summary>${esc(x.group)} <span>${x.items.length}개</span></summary>${x.items.map(blk).join('')}</details>`
        : blk(x))).join('');
      K.popover({ title, sub, html });
    },
    bigView({ title, sub = '', sections = [] }) {
      window.DeckZoom?.reset();
      let f = document.querySelector('#kfull');
      if (!f) { f = document.createElement('div'); f.id = 'kfull'; document.body.appendChild(f); }
      const flat = sections.flatMap((s) => (s.items ? [{ head: s.group }, ...s.items] : [s]));
      let n = 0;
      const body = flat.map((s) => {
        if (s.head) return `<div style="margin-top:26px;font-size:19px;font-weight:900;color:#c026d3;border-bottom:2px solid #fbe9fd;padding-bottom:4px" id="kf${n++}">${esc(s.head)}</div>`;
        const t = String(s.text ?? '');
        return `<div class="fs"><div class="fl">${esc(s.label)}<span>${t.length.toLocaleString()}자${s.note ? ` · ${esc(s.note)}` : ''}</span></div><pre>${esc(t)}</pre></div>`;
      }).join('');
      const heads = flat.filter((s) => s.head);
      f.innerHTML = `<div class="fh"><div><h4>${esc(title)}</h4><div class="sub">${esc(sub)}</div></div><button class="fc">전부 복사</button><button class="fx">닫기 ✕</button></div>${heads.length > 1 ? `<div class="fnav">${heads.map((h, i) => `<a data-kf="${i}">${esc(h.head)}</a>`).join('')}</div>` : ''}<div class="fb">${body}</div>`;
      f.classList.add('on');
      f.querySelector('.fx').onclick = () => f.classList.remove('on');
      f.querySelector('.fc').onclick = () => { navigator.clipboard?.writeText(flat.map((s) => (s.head ? `\n### ${s.head}` : `--- ${s.label}\n${s.text}`)).join('\n')); f.querySelector('.fc').textContent = '복사했습니다'; };
      f.querySelectorAll('[data-kf]').forEach((a) => { a.onclick = () => f.querySelector(`#kf${a.dataset.kf}`).scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      f.querySelector('.fb').scrollTop = 0;
    },
    // LLM 호출 하나를 전문 창 섹션 묶음으로 — 요청 메시지 전부 + 응답 전부
    callSections(c, head) {
      return { group: head, items: [...(c.msgs || []).map((m, i) => ({ label: `요청 ${i + 1} · ${m.role === 'system' ? '지시(system)' : '사용자(user)'}`, text: m.text })), { label: '받은 답(응답 전문)', text: c.resp }] };
    },
    esc, codeHtml,
  };
  // 넘치는 상자에 마우스를 올리면 모서리에 「⤢ 크게 보기」 — 무대·패널 어디든(확대 중에도 화면 좌표로 붙인다)
  let bigTarget = null;
  const bigBtn = () => { let b = document.querySelector('#kbig'); if (!b) { b = document.createElement('button'); b.id = 'kbig'; b.textContent = '⤢ 크게 보기'; document.body.appendChild(b); b.onclick = () => openBig(bigTarget); } return b; };
  const labelOf = (el) => { const blk = el.closest('.blk, .knode, [data-name]'); const t = blk?.querySelector('b, .kfn, h2'); return (t?.innerText || '원문').trim().slice(0, 80); };
  const openBig = (el) => { if (!el) return; bigBtn().classList.remove('on'); K.bigView({ title: labelOf(el), sub: '상자 하나 전체', sections: [{ label: labelOf(el), text: el.innerText }] }); };
  const overflowing = (el) => el && el.scrollHeight > el.clientHeight + 24;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('pre, .code');
    const b = bigBtn();
    if (e.target === b) return;
    if (!el || !overflowing(el)) { b.classList.remove('on'); bigTarget = null; return; }
    bigTarget = el; const r = el.getBoundingClientRect();
    b.style.left = `${Math.max(8, r.right - 118)}px`; b.style.top = `${Math.max(8, r.top + 8)}px`; b.classList.add('on');
  });
  // 터치에서는 두 번 탭으로 크게 본다
  document.addEventListener('dblclick', (e) => { const el = e.target.closest && e.target.closest('pre, .code'); if (overflowing(el)) { e.preventDefault(); openBig(el); } });
  window.DeckKit = K;
})();
