// 덱 미리 그려 점검 — 고친 덱을 파일에 쓰기 **전에** 보이지 않는 창(iframe)에 그려 모든 장을 돌며 문제를 모은다.
// 덱 AI 고치기(deckkit)가 수정안마다 부르고, 새로 생긴 문제가 있으면 그 목록을 AI 에게 되돌려 다시 쓰게 한다(사용자 지정 2026-09-29).
// 왜 필요한가: 로컬 LLM 는 결과 화면을 못 본다 — '그래프를 세로로' 적용이 퍼센트를 카드 밖으로 튀어나오게 했는데 코드만으로는 알 길이 없었다.
// 점검 항목은 tools/deck_check.cjs 와 같다: 스크립트 오류 · 무대(1600×900) 밖 넘침 · 카드(.cardx·.card·.box) 밖 넘침.
(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 한 장의 문제 — 그 장이 보이는 상태에서 부른다. 글이 있으면 앞 20자를 붙여 AI 가 어느 요소인지 알아보게 한다
  const slideProblems = (doc, deck) => {
    const s = deck.slides[deck.cur]; const S = doc.querySelector('#stage').getBoundingClientRect(); const K = S.width / 1600; const out = [];
    const label = (el) => { const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20); return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${t ? ` "${t}"` : ''}`; };
    s.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const dx = (r.right - S.left) / K - 1600; const dy = (r.bottom - S.top) / K - 900;
      if (dx > 2 || dy > 2) out.push({ kind: 'stage', key: `stage|${label(el)}`, text: `${label(el)} 가 무대 ${dx > dy ? '오른쪽' : '아래'} 밖으로 ${Math.round(Math.max(dx, dy))}px` });
    });
    s.querySelectorAll('.cardx, .card, .box').forEach((c) => {
      const cr = c.getBoundingClientRect(); if (!cr.width) return;
      c.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const d = { 위: cr.top - r.top, 아래: r.bottom - cr.bottom, 왼쪽: cr.left - r.left, 오른쪽: r.right - cr.right };
        const [dir, px] = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
        if (px > 4) out.push({ kind: 'card', key: `card|${label(el)}`, text: `${label(el)} 가 카드 ${dir}로 ${Math.round(px / K)}px 넘침` });
      });
    });
    // ③ 겹침(2026-09-29 벤치에서 놓친 것) — 카드 **안**에서 글자가 다른 글자나 채워진 도형(격자 네모 · 막대 · 그림)을 덮는다.
    //   실측: '틀린 필드 패널 없애기'(T10)에서 83.1% 가 오른쪽 격자에 붙어 겹쳤는데 카드 밖 넘침이 아니라 통과했다.
    //   글자 상자는 글 조각(텍스트 노드)의 실제 범위로 잡는다(블록 요소 상자는 빈 폭까지 넓어 옆 칸과 헛겹친다).
    //   조상 · 자손 사이는 겹침이 아니다(카드 배경 위의 글). 작은 스침은 무시 — 교차 넓이 12px² 이상이면서 작은 쪽의 8% 이상.
    const vis = (el) => { for (let e = el; e && e !== s; e = e.parentElement) { const c = getComputedStyle(e); if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) < 0.3) return false; } return true; };
    const texts = []; const walk = doc.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
      // 스크립트 코드가 글자로 보임 — AI 가 마크업 안에 ${…} · .map( 을 그대로 적은 것(bench/ui_run r1: 간지 '세련되게' 2건이
      // 화면에 '${PARTS.map((o) => …)}' 가 찍힌 채 자가검증을 통과). 코드를 보여 주려고 둔 칸(pre · code · .code · .mono)은 뺀다
      if (/\$\{[^}]*\}|=>\s*[`({]|\.(map|join|forEach)\(/.test(n.textContent) && !n.parentElement.closest('pre, code, .code, .mono'))
        out.push({ kind: 'code', key: `code|${label(n.parentElement)}`, text: `${label(n.parentElement)} 에 스크립트 코드가 글자로 보임 — 「${n.textContent.trim().slice(0, 40)}」` });
      // 이모지 — 운영체제마다 그림이 다르고(맥 · 윈도 · 서버) PDF 도 달라진다. 덱 글꼴에 없어 컴퓨터 글꼴로 그려진다(사용자 지정 2026-10-01 "이모지는 AI 가 못 만들게").
      //   기본 모양이 그림 글자인 것(Emoji_Presentation)과 그림으로 바꾸는 표시(U+FE0F)를 잡는다 — ✓ · ★ · → 같은 기호 글자는 덱 글꼴(Noto Sans Symbols)에 있어 괜찮다
      const emo = n.textContent.match(/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|.\uFE0F?\u20E3/gu);
      if (emo) out.push({ kind: 'emoji', key: `emoji|${label(n.parentElement)}`, text: `${label(n.parentElement)} 에 이모지 ${[...new Set(emo)].join(' ')} — 쓰지 않는다(SVG 아이콘이나 ✓ · ● · ▶ 같은 기호로)` });
      // 줄마다 글자 **몸통**만 — 글꼴 상자(위아래 여백 포함)로 잡으면 줄 간격이 촘촘한 곳(큰 숫자 위 이름표)이 원본에서도 전부 겹침으로 걸렸다
      const rg = doc.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) { if (q.width < 2 || q.height < 2) continue;
        const r = { left: q.left + 1, right: q.right - 1, top: q.top + q.height * 0.25, bottom: q.bottom - q.height * 0.25 }; r.width = r.right - r.left; r.height = r.bottom - r.top;
        texts.push({ el: n.parentElement, r, t: n.textContent.trim().slice(0, 20) }); }
    }
    const inks = [];
    s.querySelectorAll('*').forEach((el) => {
      if (el.children.length || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      const c = getComputedStyle(el); const bg = c.backgroundColor; const filled = bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg);
      if (!(filled || /^(img|canvas)$/i.test(el.tagName)) || !vis(el)) return;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; inks.push({ el, r });
    });
    const hit = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w <= 0 || h <= 0) return 0; const x = (w * h) / (K * K); return x >= 12 && w * h >= 0.08 * Math.min(a.width * a.height, b.width * b.height) ? x : 0; };
    const kin = (a, b) => a === b || a.contains(b) || b.contains(a);
    const seen = new Set();
    for (let i = 0; i < texts.length; i++) {
      const A = texts[i];
      for (let j = i + 1; j < texts.length; j++) { const B = texts[j]; if (kin(A.el, B.el) || !hit(A.r, B.r)) continue;
        const key = `overlap|${A.t}|${B.t}`; if (!seen.has(key)) { seen.add(key); out.push({ kind: 'overlap', key, text: `글 "${A.t}" 와 글 "${B.t}" 가 겹침` }); } }
      for (const B of inks) { if (kin(A.el, B.el)) continue;
        if (hit(A.r, B.r)) { const key = `overlap|${A.t}|${label(B.el)}`; if (!seen.has(key)) { seen.add(key); out.push({ kind: 'overlap', key, text: `글 "${A.t}" 가 도형 ${label(B.el)} 을 덮음` }); } continue; }
        // 붙음 — 글자와 채워진 도형 사이가 4px 도 안 된다. 실측(T10): 83.1% 의 % 끝(800px)과 격자 첫 네모(800px)가 딱 맞닿아
        // 입체 그림자 때문에 눈에는 겹쳐 보였다(교차 넓이 0 이라 겹침으로는 안 걸림). 원본 덱에는 이런 자리가 없다(검증)
        const g = 4 * K; const near = A.r.left < B.r.right + g && A.r.right > B.r.left - g && A.r.top < B.r.bottom + g && A.r.bottom > B.r.top - g;
        if (near) { const key = `touch|${A.t}|${label(B.el)}`; if (!seen.has(key)) { seen.add(key); out.push({ kind: 'overlap', key, text: `글 "${A.t}" 가 도형 ${label(B.el)} 에 붙음(간격 4px 미만)` }); } } }
    }
    // ④ 중복 — 바로 옆 형제가 태그 · class · 글이 모두 같다(실측: 목차 번호 칸을 하나 더 만들어 번호가 두 번 찍혔는데 통과했다, T5)
    s.querySelectorAll('*').forEach((el) => {
      const nx = el.nextElementSibling; const t = (el.textContent || '').trim();
      // class 가 붙은 요소끼리만 — 범례의 ■ ■ 처럼 뜻 없이 되풀이되는 기호는 뺀다(목차 번호 .no 같은 틀 조각이 대상)
      if (!nx || !t || !el.className || el.children.length > 3 || nx.tagName !== el.tagName || nx.className !== el.className || (nx.textContent || '').trim() !== t) return;
      out.push({ kind: 'dup', key: `dup|${label(el)}`, text: `${label(el)} 가 바로 옆에 한 번 더 있음(중복)` });
    });
    return out;
  };

  /**
   * 덱 HTML 한 벌을 보이지 않는 창에 그려 모든 장을 점검한다.
   * @param {string} html 덱 파일 전체(고친 뒤의 원본)
   * @param {{base?: string, settle?: number}} [o] base = 상대 경로 기준(기본: 지금 덱의 폴더), settle = 재료 불러오기를 기다리는 시간
   * @returns {Promise<{errors: string[], slides: {i:number, name:string, problems:{kind,key,text}[]}[]}>}
   */
  const render = async (html, o = {}) => {
    const base = o.base || location.href.replace(/[^/]*$/, '');
    // 오류 고리를 **덱 스크립트보다 먼저** — deck.js 는 장 그리기 실패를 console.error 로만 남긴다.
    // 주소 바꾸기(history.replaceState)도 막는다 — 장을 넘길 때 #번호를 쓰는데 about:srcdoc 창에서는 SecurityError 로 멈춘다
    const hook = `<base href="${base}"><script>window.__errs=[];const __ce=console.error.bind(console);console.error=(...a)=>{__errs.push(a.map(x=>(x&&x.message)||String(x)).join(' ').slice(0,200));__ce(...a)};addEventListener('error',e=>__errs.push(String(e.message).slice(0,200)));history.replaceState=history.pushState=()=>{};<\/script>`;
    const doc = html.includes('<head>') ? html.replace('<head>', `<head>${hook}`) : hook + html;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:960px;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(f);
    try {
      f.srcdoc = doc;
      await new Promise((r) => { f.onload = r; });
      const w = f.contentWindow;
      // 덱은 `const deck = Deck.create(...)` 라 window.deck 이 아니다(전역 렉시컬) — 창 안에서 이름으로 찾는다
      const find = () => { try { return w.eval('typeof deck !== "undefined" ? deck : null'); } catch (e) { return null; } };
      for (let k = 0; k < 60 && !(find()?.slides?.length); k++) await wait(100);
      await wait(o.settle ?? 1800);                                  // 재료(json) 불러오기 · 장 그리기
      // 그리기 자체가 실패하면 **점검 실패**로 던진다 — 원래 덱과 고친 덱이 똑같이 실패하면 "새 문제 없음"으로 통과해 버렸다(2026-09-29 실측)
      const deck = find(); if (!deck || !deck.slides?.length) throw new Error(`덱을 그리지 못했습니다${w.__errs?.length ? ` — ${w.__errs[0]}` : ''}`);
      const slides = [];
      for (let i = 0; i < deck.slides.length; i++) {
        deck.show(i, deck.stepsOf ? deck.stepsOf(deck.slides[i]) : 0); await wait(120);
        slides.push({ i, name: deck.slides[i].dataset.name, problems: slideProblems(f.contentDocument, deck) });
      }
      return { errors: [...(w.__errs || [])], slides };
    } finally { f.remove(); }
  };

  // 고친 뒤에 **새로** 생긴 문제만 — 원래 덱에 있던 넘침은 이 수정 탓이 아니다(장 이름 + 요소 꼬리표로 짝짓고, 개수가 늘어난 만큼만)
  const diff = (before, after) => {
    const bk = {}; before.slides.forEach((s) => s.problems.forEach((p) => { const k = `${s.name}|${p.key}`; bk[k] = (bk[k] || 0) + 1; }));
    const out = [];
    after.slides.forEach((s) => s.problems.forEach((p) => { const k = `${s.name}|${p.key}`; if (bk[k]) bk[k]--; else out.push({ slide: s.i + 1, name: s.name, ...p }); }));
    const oldErr = new Set(before.errors);
    return { errors: after.errors.filter((e) => !oldErr.has(e)), problems: out };
  };

  // SHA-256(16진) — 브라우저 암호 API(crypto.subtle)는 **보안 컨텍스트**(https · localhost)에서만 있다.
  // 폰에서 Tailscale 주소(http://100.x.x.x)로 열면 없어서 "원본을 못 읽었습니다"로 멈췄다(2026-09-29 사용자 신고) — 그럴 때 이 구현을 쓴다.
  const sha256js = (str) => {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const b = new TextEncoder().encode(str); const l = b.length; const n = ((l + 9 + 63) >> 6) << 6; const m = new Uint8Array(n); m.set(b); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const W = new Uint32Array(64);
    const r = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let t = 0; t < 16; t++) W[t] = dv.getUint32(o + t * 4);
      for (let t = 16; t < 64; t++) { const s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ (W[t - 15] >>> 3); const s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ (W[t - 2] >>> 10); W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0; }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0; const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  };
  const sha256 = async (t) => (window.crypto?.subtle
    ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('')
    : sha256js(t));

  window.DeckCheck = { render, diff, slideProblems, sha256, sha256js };
})();
