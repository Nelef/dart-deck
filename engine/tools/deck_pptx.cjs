// 덱 → PPT 재료(사용자 지정 2026-10-07 "ppt 로 변환") — 보던 화면 그대로, 페이지마다 한 장씩 그림(JPEG)으로 찍고 페이지 이름 · 글을 적는다.
// 쓰는 법: node deck_pptx.cjs <덱 주소> <결과 폴더>   → 폴더에 p001.jpg … + pages.json([{name, text, img}]), 표준 출력에 JSON {pages, ms, errors}
//   배율 SCALE(기본 2 = 3200×1800) · 품질 QUALITY(기본 90). 그림을 PPT 에 한 장씩 넣는 것은 server/pptx_build.py(python-pptx).
// 찍는 방식은 deck_pdf.cjs 의 「그림판」과 같다(마지막 단계까지 펼치고 움직임이 멎으면 #stage 를 찍는다) — PDF · 화면과 같은 모양
const fs = require('fs'); const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, outDir] = process.argv.slice(2);
const SCALE = Math.max(1, Math.min(3, Number(process.env.SCALE) || 2)); const QUALITY = Math.max(60, Math.min(100, Number(process.env.QUALITY) || 90));
const STILL = '#ppt-home, #bar, body > *:not(#view) { display: none !important; } #view > *:not(#stage) { display: none !important; } #tip { display: none !important; } body { --fit-top: 0px !important; --fit-left: 0px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }';

const settle = async (p, i) => {
  await p.evaluate((k) => deck.show(k, deck.stepsOf ? deck.stepsOf(deck.slides[k]) : 0), i);
  await p.waitForTimeout(450);
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout: 3000 }).catch(() => {});
  await p.evaluate((k) => new Promise((ok) => { const s = deck.slides[k]; let t; const cap = setTimeout(done, 5000);
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 400); }); t = setTimeout(done, 400);
    function done() { mo.disconnect(); clearTimeout(cap); clearTimeout(t); ok(); }
    mo.observe(s, { subtree: true, attributes: true, childList: true, characterData: true }); }), i);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

(async () => {
  const t0 = Date.now(); const errors = []; fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SCALE, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await p.addInitScript(() => { addEventListener('deckready', () => { window.__deckReady = 1; }); addEventListener('deckfail', () => { window.__deckReady = 1; }); });
    await p.goto(url); await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 20000 });
    await p.waitForFunction(() => window.__deckReady, null, { timeout: 15000 }).catch(() => {});
    await p.emulateMedia({ media: 'screen' }); await p.addStyleTag({ content: STILL });
    await p.evaluate(async () => { document.body.classList.add('dfs'); window.DeckZoom?.reset?.(); dispatchEvent(new Event('resize')); await document.fonts.ready; });
    const n = await p.evaluate(() => deck.slides.length); const pages = [];
    for (let i = 0; i < n; i++) {
      await settle(p, i); const img = `p${String(i + 1).padStart(3, '0')}.jpg`;
      await p.locator('#stage').screenshot({ path: path.join(outDir, img), type: 'jpeg', quality: QUALITY });
      const meta = await p.evaluate((k) => { const s = deck.slides[k]; return { name: s.dataset.name || `페이지 ${k + 1}`, text: (s.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000) }; }, i);
      pages.push({ ...meta, img });
    }
    fs.writeFileSync(path.join(outDir, 'pages.json'), JSON.stringify(pages));
    process.stdout.write(JSON.stringify({ pages: n, ms: Date.now() - t0, errors }));
  } finally { await b.close(); }
})().catch((e) => { process.stdout.write(JSON.stringify({ errors: [`PPT 재료 실패: ${e.message}`], pages: 0 })); process.exit(0); });
