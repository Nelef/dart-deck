// 덱 목록의 썸네일 — 덱의 실제 첫 화면(1페이지 · 처음 단계)을 작게 찍는다(server/app.py /thumb/…, 사용자 지정 2026-09-30
//   "메인 화면이 실제 첫 화면이 아니고 커스텀으로 만든 걸 보여 준다"). 목록 카드는 전에 제목 글만 그린 가짜 표지였다.
// 쓰는 법: node deck_thumb.cjs <덱 주소> <저장 경로.jpg>
// 작게 찍는 법: 무대(1600×900)를 그대로 그리고 화면 배율(deviceScaleFactor) 0.4 로 찍는다 → 640×360. 그림 줄이는 도구(이미지 라이브러리)가 필요 없다.
// 조작줄 · 떠 있는 [편집] · [AI] 단추 · 불러오기 표시는 숨긴다(무대 모서리에 겹쳐 찍혔다). 자막 덱의 첫 자막은 첫 화면의 일부라 둔다
const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 0.4, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    await p.goto(url.replace(/#.*$/, '') + '#1');
    await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 20000 });
    await p.addStyleTag({ content: '#ppt-home { display: none !important; } body { --fit-top: 0px !important; } #bar, #ldr, #kpanel, #de-btn, #de-ai, #k-ai, #k-code, .kfab { display: none !important; } #view { inset: 0 !important; } html, body, #view { background: #fff !important; }' });   // 무대 둥근 모서리 밖 어두운 바탕이 찍히지 않게
    await p.evaluate(() => { deck.show(0, 0); window.DeckFit?.(); dispatchEvent(new Event('resize')); });
    await p.waitForTimeout(1800);   // 재료(json) · 그림 · 글꼴 · 숫자 올리기
    await p.locator('#stage').screenshot({ path: out, type: 'jpeg', quality: 78 });
    process.stdout.write('ok');
  } finally { await b.close(); }
})().catch((e) => { process.stderr.write(String(e.message || e)); process.exit(1); });
