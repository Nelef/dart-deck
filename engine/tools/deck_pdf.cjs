// 덱 → PDF — 페이지마다 화면에 보이는 무대를 그대로 찍어 PDF 한 쪽에 한 장씩(사용자 지정 2026-10-01 "html 로 보던 것과 하나라도 다르면 안 됨").
// 쓰는 법: node deck_pdf.cjs <덱 주소> <저장할 .pdf> [배율, 기본 2]     → 표준 출력에 JSON {pages, ms, bytes, errors}
// 왜 캡처인가: 크롬의 인쇄(page.pdf)는 인쇄용 스타일 · 화면 맞춤(transform) · 애니메이션 · 그림자 처리가 화면과 달라 어긋날 수 있다.
//   화면 그대로를 그림으로 뜨면 보던 것과 픽셀까지 같다. 대신 PDF 안 글자는 선택 · 검색이 안 된다(그림).
// 그리는 법: 창 1600×900 · 전체화면 맞춤(body.dfs → 무대 배율 1) · 무대 밖(조작줄 · 로고 · ✎ · ✦ AI · 확대 배율 · 말풍선)은 숨김.
//   페이지마다 마지막 단계까지 펼쳐(deck.show(i, stepsOf)) 넘김 흐려짐과 애니메이션이 끝난 뒤 PNG(손실 없음, 배율 2 = 3200×1800)로 찍는다.
//   그림을 모아 크롬이 1600×900px 쪽의 PDF 로 묶는다 — 그림을 다시 줄이거나 압축하지 않는다(손실 없음).
const fs = require('fs'); const os = require('os'); const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, out, scaleArg] = process.argv.slice(2); const SCALE = Math.max(1, Math.min(3, Number(scaleArg) || 2));
(async () => {
  const t0 = Date.now(); const errors = []; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckpdf-'));
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SCALE, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await p.addInitScript(() => { addEventListener('deckready', () => { window.__deckReady = 1; }); addEventListener('deckfail', () => { window.__deckReady = 1; }); });
    await p.goto(url); await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 20000 });
    await p.waitForFunction(() => window.__deckReady, null, { timeout: 15000 }).catch(() => {});
    await p.addStyleTag({ content: 'body > *:not(#view) { display: none !important; } #view > *:not(#stage) { display: none !important; } #tip { display: none !important; } body { --fit-top: 0px !important; --fit-left: 0px !important; }' });
    await p.evaluate(async () => { document.body.classList.add('dfs'); window.DeckZoom?.reset?.(); dispatchEvent(new Event('resize')); await document.fonts.ready; });
    const n = await p.evaluate(() => deck.slides.length); const shots = [];
    for (let i = 0; i < n; i++) {
      await p.evaluate((k) => deck.show(k, deck.stepsOf ? deck.stepsOf(deck.slides[k]) : 0), i);
      await p.waitForTimeout(450);   // 장 넘김 흐려짐(.4s)
      // 애니메이션 · 전환이 다 끝날 때까지(최대 3초) — 숫자 올라가기 같은 JS 애니메이션도 한 번 더 쉬어 준다
      await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout: 3000 }).catch(() => {});
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (await p.evaluate((k) => !!deck.slides[k].querySelector('[data-count]'), i)) await p.waitForTimeout(1300);
      const f = path.join(dir, `p${String(i + 1).padStart(3, '0')}.png`); await p.locator('#stage').screenshot({ path: f, type: 'png' }); shots.push(f);
    }
    // 묶기 — 쪽 크기 1600×900px, 여백 0, 그림은 원래 픽셀 그대로
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: 1600px 900px; margin: 0; } html, body { margin: 0; padding: 0; }
      .pg { width: 1600px; height: 900px; page-break-after: always; break-after: page; overflow: hidden; } .pg:last-child { page-break-after: auto; break-after: auto; }
      .pg img { width: 1600px; height: 900px; display: block; }</style></head><body>${shots.map((f) => `<div class="pg"><img src="${path.basename(f)}"></div>`).join('')}</body></html>`;
    fs.writeFileSync(path.join(dir, 'book.html'), html);
    const q = await ctx.newPage(); await q.goto('file://' + path.join(dir, 'book.html')); await q.waitForFunction(() => [...document.images].every((im) => im.complete), null, { timeout: 60000 });
    await q.pdf({ path: out, width: '1600px', height: '900px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
    process.stdout.write(JSON.stringify({ pages: n, ms: Date.now() - t0, bytes: fs.statSync(out).size, errors }));
  } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { process.stdout.write(JSON.stringify({ errors: [`PDF 실패: ${e.message}`], pages: 0 })); process.exit(0); });
