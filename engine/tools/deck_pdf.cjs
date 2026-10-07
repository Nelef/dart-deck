// 덱 → PDF — 보던 화면 그대로, 페이지마다 한 쪽(사용자 지정 2026-10-01 "html 로 보던 것과 하나라도 다르면 안 됨").
// 쓰는 법: node deck_pdf.cjs <덱 주소> <저장할 .pdf>            → 표준 출력에 JSON {pages, ms, bytes, mode, errors}
//          MODE=image 면 그림판(페이지마다 화면을 PNG 로 찍어 넣음 · 배율 SCALE, 기본 2)
//
// 기본 = 벡터판. 화면을 1600×900 · 무대 배율 1 로 맞추고 페이지마다 마지막 단계까지 펼쳐 움직임이 멎으면 화면(#view)을 통째로 복제해 두었다가,
//   1600×900 칸에 하나씩 이어 붙여 크롬 인쇄 한 번으로 만든다. 글자 · 도형 · SVG 가 벡터로 들어가 작고(그림판의 절반 안팎) 글자를 선택 · 검색할 수 있다.
//   · 복제인 까닭: 페이지를 세로로 쌓으려고 덱 배치를 바꾸면 옛 형식 덱이 작아지고 검게 깨졌다(2026-10-01 시험). 복제는 화면 배치를 건드리지 않는다
//   · 한 번에 인쇄하는 까닭: 쪽마다 인쇄해 합치면 반복되는 그림 · 글꼴이 쪽마다 또 들어가 그림판보다 커졌다(6.6MB)
//   · 글꼴: 가변 글꼴은 PDF 에 Type 3(무겁고 흐림)로 들어가 PDF 를 만들 때만 굵기별 고정 글꼴(fonts/print/print.css, tools/fontprint.py)을 덧붙인다
//   · 복제는 스크롤 위치를 안 옮겨 스크롤되는 상자의 위치를 적었다 되돌린다. 칸에 transform 을 줘 fixed 인 #view 가 칸 안에 머문다
//   검증(7개 덱 106쪽): PDF 를 그림으로 되돌려 그림판과 견주면 차이는 글자 가장자리 번짐뿐(흐리게 뭉갠 64px 칸 평균차 ≤ 20/255) — 배치 · 줄바꿈 · 색은 같다.
//   그림판은 화면과 픽셀까지 같지만 글자 선택이 안 되고 2배 크다.
// 움직임 기다리기: 넘김 흐려짐 0.45초 → CSS 애니메이션 끝 → 페이지 안 변화가 0.4초 없을 때까지(최대 5초 — 스크립트 확대 · 숫자 올라가기는 getAnimations 에 안 잡힌다.
//   예전엔 0.45초만 쉬어 1.2초짜리 확대 애니메이션 도중을 찍었다)
const fs = require('fs'); const os = require('os'); const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../node_modules/playwright')); } })();
const KEY = process.env.DECK_SHOT_KEY || '';
const [url, out] = process.argv.slice(2); const MODE = process.env.MODE === 'image' ? 'image' : 'vector';
const SCALE = Math.max(1, Math.min(3, Number(process.env.SCALE) || 2));
const FLAT = process.env.FLAT === '1';   // 그림자 · 필터를 없앤다 — 이 PDF 를 LibreOffice 로 PPT 로 바꿀 때 상자 그림자가 검은 덩어리가 됐다(2026-10-07 실측)
const STILL = '#ppt-home, #bar, body > *:not(#view) { display: none !important; } #view > *:not(#stage) { display: none !important; } #tip { display: none !important; } body { --fit-top: 0px !important; --fit-left: 0px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }';

// 페이지 i 를 마지막 단계까지 펼치고 움직임이 멎을 때까지
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
  const t0 = Date.now(); const errors = []; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckpdf-'));
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: MODE === 'image' ? SCALE : 1, extraHTTPHeaders: KEY ? { 'x-shot-key': KEY } : {} });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await p.addInitScript(() => { addEventListener('deckready', () => { window.__deckReady = 1; }); addEventListener('deckfail', () => { window.__deckReady = 1; }); });
    await p.goto(url); await p.waitForFunction(() => typeof deck !== 'undefined' && deck.slides && deck.slides.length, null, { timeout: 20000 });
    await p.waitForFunction(() => window.__deckReady, null, { timeout: 15000 }).catch(() => {});
    await p.emulateMedia({ media: 'screen' });
    await p.addStyleTag({ content: STILL });
    if (FLAT) await p.addStyleTag({ content: '*, *::before, *::after { box-shadow: none !important; text-shadow: none !important; filter: none !important; backdrop-filter: none !important; }' });
    if (MODE === 'vector') await p.addStyleTag({ url: new URL('/fonts/print/print.css', url).href }).catch((e) => errors.push(`PDF 글꼴 없음(가변 글꼴로 — 커진다): ${e.message.slice(0, 80)}`));
    await p.evaluate(async () => { document.body.classList.add('dfs'); window.DeckZoom?.reset?.(); dispatchEvent(new Event('resize')); await document.fonts.ready; });
    const n = await p.evaluate(() => deck.slides.length);

    if (MODE === 'image') {
      const shots = [];
      for (let i = 0; i < n; i++) { await settle(p, i); const f = path.join(dir, `p${String(i + 1).padStart(3, '0')}.png`); await p.locator('#stage').screenshot({ path: f, type: 'png' }); shots.push(f); }
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: 1600px 900px; margin: 0; } html, body { margin: 0; padding: 0; }
        .pg { width: 1600px; height: 900px; break-after: page; overflow: hidden; } .pg:last-child { break-after: auto; } .pg img { width: 1600px; height: 900px; display: block; }</style></head>
        <body>${shots.map((f) => `<div class="pg"><img src="${path.basename(f)}"></div>`).join('')}</body></html>`;
      fs.writeFileSync(path.join(dir, 'book.html'), html);
      const q = await ctx.newPage(); await q.goto('file://' + path.join(dir, 'book.html')); await q.waitForFunction(() => [...document.images].every((im) => im.complete), null, { timeout: 60000 });
      await q.pdf({ path: out, width: '1600px', height: '900px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
    } else {
      for (let i = 0; i < n; i++) {
        await settle(p, i);
        await p.evaluate((k) => { const src = deck.slides[k]; const els = [src, ...src.querySelectorAll('*')];
          const sc = els.map((e, j) => (e.scrollTop || e.scrollLeft ? [j, e.scrollTop, e.scrollLeft] : null)).filter(Boolean);
          const v = document.querySelector('#view').cloneNode(true); v.querySelectorAll('.slide').forEach((s, j) => { if (j !== k) s.remove(); });
          (window.__pb ||= []).push({ v, sc }); }, i);
      }
      await p.evaluate(() => { document.querySelector('#view').style.display = 'none';
        for (const { v } of window.__pb) { const w = document.createElement('div'); w.className = 'pbw'; w.appendChild(v); document.body.appendChild(w); } });
      await p.addStyleTag({ content: '@page { size: 1600px 900px; margin: 0; } html, body { height: auto !important; overflow: visible !important; margin: 0 !important; } html > body > *:not(.pbw):not(#none) { display: none !important; } html > body > div.pbw:not(#view) { display: block !important; position: relative; width: 1600px; height: 900px; overflow: hidden; transform: translateZ(0); break-after: page; } html > body > div.pbw:last-child { break-after: auto; }' });
      await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
      await p.evaluate(() => { for (const { v, sc } of window.__pb) { const sl = v.querySelector('.slide'); const els = [sl, ...sl.querySelectorAll('*')]; for (const [j, t, l] of sc) { if (els[j]) { els[j].scrollTop = t; els[j].scrollLeft = l; } } } });
      await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
      await p.pdf({ path: out, width: '1600px', height: '900px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    }
    process.stdout.write(JSON.stringify({ pages: n, ms: Date.now() - t0, bytes: fs.statSync(out).size, mode: MODE, errors }));
  } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { process.stdout.write(JSON.stringify({ errors: [`PDF 실패: ${e.message}`], pages: 0 })); process.exit(0); });
