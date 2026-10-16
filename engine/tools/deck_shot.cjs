// 덱 미리보기 캡처 — 덱 AI 자가검증(server/app.py /api/shot)과 Claude Code(덱 폴더에서 node tools/deck_shot.cjs)가 부른다. 고친 덱의 사본 주소를 열어
//   ① 찍을 장을 점검하고(DeckCheck.slideProblems: 무대 밖 · 카드 밖 넘침 — 네 번째 인자 all 이면 모든 장) ② 그 장의 무대를 JPEG 로 찍는다.
// 쓰는 법:  node deck_shot.cjs <주소> <장 번호(1부터)> <그림 저장 경로>      → 표준 출력에 JSON {errors, slides:[{i,name,problems}]}
//          장 번호를 쉼표로 여러 개(3,5,9) 주면 장마다 <경로>-<번호>.jpg 로 찍는다(덱은 한 번만 연다 — 여러 장 고치기, 2026-09-30) → JSON 에 shots:[번호…]
// 왜 서버에서 찍나: 브라우저 안에서는 화면을 그림으로 뜰 표준 방법이 없고(SVG · 입체 막대가 많아 html2canvas 류는 어긋난다),
//   로컬 LLM 는 그림을 읽을 수 있어 "보고 스스로 검증"하게 하려면 실제 렌더링 그림이 필요하다(2026-09-29 사용자 지정).
const path = require('path');
// playwright 는 NODE_PATH(서버가 넣는다) 또는 프로젝트 node_modules 에서
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
// 캡처 키 — 덱은 로그인한 주인만 열리는데, 서버 안 크롬은 로그인이 없다. 서버가 켤 때 만든 키를 머리글로 보낸다(DECK_SHOT_KEY)
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, slideNo, out, scope] = process.argv.slice(2);
// 빠르게(2026-09-30 사용자 "간단 수정마저 엄청 오래 걸린다" — 제목 한 줄 고치기 28초 중 캡처가 16초):
//   · 덱 준비(deckready)를 기다린다 — 예전엔 무조건 1.8초 쉬었다. 신호가 이미 지나갔을 수 있어 페이지를 열기 전에 표시를 심는다
//   · 점검은 찍는 장만 — 예전엔 13장을 다 넘기며 점검했다(장마다 150ms + 점검). 공용 스타일 · 스크립트가 바뀐 때는 서버가 all 로 부른다
(async () => {
  const b = await chromium.launch(); const errors = [];
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 960 }, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await p.addInitScript(() => { addEventListener('deckready', () => { window.__deckReady = 1; }); addEventListener('deckfail', () => { window.__deckReady = 1; }); });
    await p.goto(url); await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 15000 });
    await p.addStyleTag({ content: '#ppt-home { display: none !important; } body { --fit-top: 0px !important; } ' }); await p.evaluate(() => { window.DeckFit?.(); dispatchEvent(new Event('resize')); });   // 왼쪽 위 로고 · 그 자리 비움 없이 무대를 크게
    await p.waitForFunction(() => window.__deckReady, null, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(250);   // 재료(json) · 장 그리기 · 글꼴
    const n = await p.evaluate(() => deck.slides.length);
    const want = String(slideNo || '1').split(',').map(Number).filter((x) => x >= 1 && x <= n);
    if (!want.length) want.push(1);
    const check = async (i) => ({ i, name: await p.evaluate((k) => deck.slides[k].dataset.name, i), problems: await p.evaluate(() => (window.DeckCheck ? DeckCheck.slideProblems(document, deck) : [])) });
    const slides = [];
    if (scope === 'all') for (let i = 0; i < n; i++) { if (want.includes(i + 1)) continue; await p.evaluate((i) => deck.show(i, deck.stepsOf ? deck.stepsOf(deck.slides[i]) : 0), i); await p.waitForTimeout(150); slides.push(await check(i)); }
    for (const w of want) {
      await p.evaluate((i) => deck.show(i, deck.stepsOf ? deck.stepsOf(deck.slides[i]) : 0), w - 1); await p.waitForTimeout(450);   // 장 넘김 흐려짐(.4s) 끝까지
      slides.push(await check(w - 1));
      await p.locator('#stage').screenshot({ path: want.length > 1 ? out.replace(/\.jpg$/, `-${w}.jpg`) : out, type: 'jpeg', quality: 72 });
    }
    slides.sort((a, z) => a.i - z.i);
    process.stdout.write(JSON.stringify({ errors, slides, ...(want.length > 1 ? { shots: want } : {}) }));
  } finally { await b.close(); }
})().catch((e) => { process.stdout.write(JSON.stringify({ errors: [`캡처 실패: ${e.message}`], slides: [] })); process.exit(0); });
