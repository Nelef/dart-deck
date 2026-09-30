// 덱 미리보기 캡처 — 덱 AI 자가검증(server/app.py /api/shot)과 Claude Code(덱 폴더에서 node tools/deck_shot.cjs)가 부른다. 고친 덱의 사본 주소를 열어
//   ① 모든 장을 점검하고(DeckCheck.slideProblems: 무대 밖 · 카드 밖 넘침) ② 지정한 장의 무대를 JPEG 로 찍는다.
// 쓰는 법:  node deck_shot.cjs <주소> <장 번호(1부터)> <그림 저장 경로>      → 표준 출력에 JSON {errors, slides:[{i,name,problems}]}
//          장 번호를 쉼표로 여러 개(3,5,9) 주면 장마다 <경로>-<번호>.jpg 로 찍는다(덱은 한 번만 연다 — 여러 장 고치기, 2026-09-30) → JSON 에 shots:[번호…]
// 왜 서버에서 찍나: 브라우저 안에서는 화면을 그림으로 뜰 표준 방법이 없고(SVG · 입체 막대가 많아 html2canvas 류는 어긋난다),
//   gemma-4-26b 는 그림을 읽을 수 있어 "보고 스스로 검증"하게 하려면 실제 렌더링 그림이 필요하다(2026-09-29 사용자 지정).
const path = require('path');
// playwright 는 NODE_PATH(서버가 넣는다) 또는 프로젝트 node_modules 에서
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
// 캡처 키 — 덱은 로그인한 주인만 열리는데, 서버 안 크롬은 로그인이 없다. 서버가 켤 때 만든 키를 머리글로 보낸다(DECK_SHOT_KEY)
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, slideNo, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const errors = [];
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 960 }, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await p.goto(url); await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 15000 });
    await p.addStyleTag({ content: '#ppt-home { display: none !important; } body { --fit-top: 0px !important; } ' }); await p.evaluate(() => { window.DeckFit?.(); dispatchEvent(new Event('resize')); });   // 왼쪽 위 로고 · 그 자리 비움 없이 무대를 크게
    await p.waitForTimeout(1800);                                   // 재료(json) · 장 그리기
    const n = await p.evaluate(() => deck.slides.length); const slides = [];
    for (let i = 0; i < n; i++) {
      await p.evaluate((i) => deck.show(i, deck.stepsOf ? deck.stepsOf(deck.slides[i]) : 0), i); await p.waitForTimeout(150);
      slides.push(await p.evaluate((i) => ({ i, name: deck.slides[i].dataset.name, problems: window.DeckCheck ? DeckCheck.slideProblems(document, deck) : [] }), i));
    }
    const want = String(slideNo || '1').split(',').map(Number).filter((x) => x >= 1 && x <= n);
    if (!want.length) want.push(1);
    for (const w of want) {
      await p.evaluate((i) => deck.show(i, deck.stepsOf ? deck.stepsOf(deck.slides[i]) : 0), w - 1); await p.waitForTimeout(700);
      await p.locator('#stage').screenshot({ path: want.length > 1 ? out.replace(/\.jpg$/, `-${w}.jpg`) : out, type: 'jpeg', quality: 72 });
    }
    process.stdout.write(JSON.stringify({ errors, slides, ...(want.length > 1 ? { shots: want } : {}) }));
  } finally { await b.close(); }
})().catch((e) => { process.stdout.write(JSON.stringify({ errors: [`캡처 실패: ${e.message}`], slides: [] })); process.exit(0); });
