// 버전 기록 — 구글 문서의 「버전 기록」처럼(사용자 지정 2026-10-06 "ppt 수정이 일어나면 구글 되돌리기처럼 되돌릴 수 있게").
//   왼쪽 = 고른 버전의 덱(읽기 전용 미리보기 /v/<계정>/<덱>/<버전>/ — 넘겨 볼 수 있다), 오른쪽 = 날짜별 목록(시간 · 한 일 · 바뀐 페이지 · 누가).
//   위 탭 [현재와 비교] = 고른 버전 이후 쌓인 변경을 **합쳐서** — 수정 · 추가 · 삭제 페이지 목록(타일) → 누르면 「바뀐 곳 · 겹쳐 보기」 비교 화면(DeckKit.shotView, 이전 = 그 버전 · 이후 = 현재)
//   [이 버전 복원하기]는 복원 직전 상태도 새 버전으로 남기므로 복원도 되돌릴 수 있다. 서버: js/deckset.js 의 「버전 기록 보기」가 연다.
//   API GET /api/versions?file= · POST /api/versions {file, action: restore, id}. 저장은 server/versions.py(.versions/, gzip, 30일 전부 + 이후 하루 1개, 최대 200개)
(() => {
  if (window.DeckVer) return;
  const FILE = location.pathname; const m = FILE.match(/^\/d\/([^/]+)\/([^/]+)\//); if (!m) return;
  const OWN = m[1], DID = m[2];
  const CSS = `
  #dver { position: fixed; inset: 0; z-index: 80; display: none; flex-direction: column; background: #fff; color: #16181d; font: 500 14px/1.5 'Noto Sans KR', sans-serif; }
  #dver.on { display: flex; }
  #dver .vh { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e6e8ec; }
  #dver .vback { flex: none; width: 40px; height: 40px; border: 0; border-radius: 99px; background: transparent; font-size: 22px; cursor: pointer; color: #16181d; } #dver .vback:hover { background: #f2f3f6; }
  #dver .vt { flex: 1; min-width: 0; } #dver .vt b { display: block; font-size: 17px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #dver .vt span { display: block; color: #7a828e; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #dver .vrestore { flex: none; height: 44px; padding: 0 22px; border: 0; border-radius: 99px; background: #1a56db; color: #fff; font: 800 14.5px 'Noto Sans KR', sans-serif; cursor: pointer; transition: background .15s, transform .08s; }
  #dver .vrestore:hover { background: #1647b8; } #dver .vrestore:active { transform: scale(0.98); } #dver .vrestore:disabled { opacity: .55; cursor: default; } #dver .vrestore[hidden] { display: none; }
  #dver .vb { flex: 1; min-height: 0; display: flex; }
  #dver .vmain { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #0f1115; }
  #dver .vtabs { flex: none; display: flex; gap: 6px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #e6e8ec; overflow-x: auto; }
  #dver .vtabs button { flex: none; height: 34px; padding: 0 14px; border: 0; border-radius: 99px; background: #f2f3f6; color: #2b3038; font: 800 13px 'Noto Sans KR', sans-serif; cursor: pointer; white-space: nowrap; }
  #dver .vtabs button:hover { background: #e6e8ec; } #dver .vtabs button.on { background: #16181d; color: #fff; } #dver .vtabs button[hidden] { display: none; }
  #dver .vstage { flex: 1; min-height: 0; position: relative; } #dver .vfr { display: block; width: 100%; height: 100%; border: 0; }
  #dver .vcmp { position: absolute; inset: 0; overflow-y: auto; background: #f6f7f9; padding: 18px 20px 28px; display: none; } #dver .vcmp.on { display: block; }
  #dver .vcmp .vsum { background: #fff; border-radius: 14px; padding: 14px 18px; margin-bottom: 16px; } #dver .vcmp .vsum b { display: block; font-size: 15.5px; font-weight: 800; }
  #dver .vcmp .vsum .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } #dver .vcmp .vsum .chip { padding: 3px 11px; border-radius: 99px; background: #f2f3f6; font-size: 12.5px; font-weight: 800; color: #2b3038; }
  #dver .vcmp .vsum .chip.c { background: #e8eefd; color: #1a56db; } #dver .vcmp .vsum .chip.a { background: #e3f6ec; color: #15803d; } #dver .vcmp .vsum .chip.d { background: #fde8e8; color: #b91c1c; }
  #dver .vcmp .vsum small { display: block; margin-top: 8px; color: #7a828e; font-size: 12.5px; font-weight: 600; }
  #dver .vcmp .vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
  #dver .vct { position: relative; text-align: left; border: 0; padding: 0; background: #fff; border-radius: 14px; overflow: hidden; cursor: pointer; font: inherit; color: inherit; box-shadow: 0 1px 3px rgba(20,24,40,.08); transition: transform .08s, box-shadow .15s; }
  #dver .vct:hover { box-shadow: 0 4px 14px rgba(20,24,40,.14); } #dver .vct:active { transform: scale(0.99); } #dver .vct:disabled { cursor: default; }
  #dver .vct .vth { position: relative; aspect-ratio: 16 / 9; background: #e9ebef; display: flex; align-items: center; justify-content: center; color: #9aa1ab; font-size: 12px; font-weight: 700; } #dver .vct .vth img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #dver .vct .vtag { position: absolute; left: 8px; top: 8px; z-index: 1; padding: 2px 9px; border-radius: 99px; color: #fff; font: 800 11.5px 'Noto Sans KR', sans-serif; background: #1a56db; } #dver .vct .vtag.add { background: #15803d; } #dver .vct .vtag.del { background: #b91c1c; }
  #dver .vct .vnm { display: block; padding: 8px 12px 2px; font-size: 13.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #dver .vct .vps { display: block; padding: 0 12px 10px; color: #7a828e; font-size: 12px; font-weight: 600; }
  #dver .vcmp .vmore { display: block; margin: 16px auto 0; height: 40px; padding: 0 20px; border: 0; border-radius: 99px; background: #16181d; color: #fff; font: 800 13.5px 'Noto Sans KR', sans-serif; cursor: pointer; } #dver .vcmp .vmore:disabled { opacity: .6; cursor: default; }
  #dver .vcmp .vnote { margin-top: 12px; color: #7a828e; font-size: 12.5px; font-weight: 600; text-align: center; } #dver .vcmp .verr { color: #b91c1c; }
  #dver .vside { flex: none; width: 340px; display: flex; flex-direction: column; border-left: 1px solid #e6e8ec; background: #fff; }
  #dver .vside h4 { flex: none; margin: 0; padding: 16px 20px 10px; font-size: 16px; font-weight: 800; }
  #dver .vlist { flex: 1; overflow-y: auto; padding: 0 10px 20px; }
  #dver .vday { margin: 14px 10px 6px; color: #7a828e; font-size: 12.5px; font-weight: 800; }
  #dver .vi { display: block; width: 100%; text-align: left; border: 2px solid transparent; background: transparent; border-radius: 14px; padding: 10px 14px; margin: 2px 0; cursor: pointer; font: inherit; color: inherit; transition: background .12s; }
  #dver .vi:hover { background: #f4f6fa; } #dver .vi.on { border-color: #1a56db; background: #fff; }
  #dver .vi .vtm { font-size: 14.5px; font-weight: 800; } #dver .vi .vcur { margin-left: 8px; color: #1a56db; font-size: 12px; font-weight: 800; }
  #dver .vi .vlb { display: block; margin-top: 2px; color: #2b3038; font-size: 13px; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  #dver .vi .vcg { display: block; margin-top: 2px; color: #7a828e; font-size: 12px; font-weight: 700; }
  #dver .vi .vwho { display: flex; align-items: center; gap: 7px; margin-top: 4px; color: #545b66; font-size: 12.5px; font-weight: 600; } #dver .vi .vwho i { width: 9px; height: 9px; border-radius: 99px; flex: none; }
  #dver .vempty { padding: 24px 20px; color: #7a828e; }
  @media (max-width: 760px) { #dver .vb { flex-direction: column; } #dver .vmain { flex: none; height: 52%; } #dver .vside { width: auto; flex: 1; min-height: 0; border-left: 0; border-top: 1px solid #e6e8ec; } #dver .vrestore { padding: 0 14px; font-size: 13.5px; } }
  `;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COLORS = ['#2f8f83', '#6d3fc0', '#d9822b', '#2b6cd9', '#c0392b', '#7a8b2f', '#b04a8f'];
  const color = (u) => { let h = 0; for (const c of String(u || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const fmt = (t) => { const d = new Date(t * 1000), h = d.getHours(); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const day = (t) => { const d = new Date(t * 1000), n = new Date(), k = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; const y = new Date(n); y.setDate(n.getDate() - 1);
    return k(d) === k(n) ? '오늘' : k(d) === k(y) ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; };
  const chg = (v) => { const c = v.chg || {}, p = [], na = c.na ?? c.a?.length ?? 0, nr = c.nr ?? c.r?.length ?? 0; if (c.nc) p.push(`수정 ${c.nc}`); if (na) p.push(`추가 ${na}`); if (nr) p.push(`삭제 ${nr}`); if (c.o) p.push('공용 부분'); return p.join(' · '); };
  const more = (arr, n) => (n > arr.length ? ` 외 ${n - arr.length}개` : '');
  const chgTip = (v) => { const c = v.chg || {}, p = []; if (c.c?.length) p.push(`수정: ${c.c.join(', ')}${more(c.c, c.nc || 0)}`); if (c.a?.length) p.push(`추가: ${c.a.join(', ')}${more(c.a, c.na || 0)}`); if (c.r?.length) p.push(`삭제: ${c.r.join(', ')}${more(c.r, c.nr || 0)}`); return p.join('\n'); };
  const post = async (body) => { const r = await fetch('/api/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: FILE, ...body }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const S = { list: [], sel: '' }; let root = null;

  const build = () => {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'dver';
    root.innerHTML = '<div class="vh"><button class="vback" title="닫기 (Esc)">←</button><div class="vt"><b>버전 기록</b><span></span></div><button class="vrestore" hidden>이 버전 복원하기</button></div>'
      + '<div class="vb"><div class="vmain"><div class="vtabs"><button data-t="view" class="on">이 버전 보기</button><button data-t="cmp" hidden>현재와 비교</button></div><div class="vstage"><iframe class="vfr" title="버전 미리보기"></iframe><div class="vcmp"></div></div></div><aside class="vside"><h4>버전 기록</h4><div class="vlist"></div></aside></div>';
    document.body.appendChild(root);
    root.querySelector('.vback').onclick = () => close();
    root.querySelector('.vrestore').onclick = restore;
    root.querySelector('.vtabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) tab(b.dataset.t); };
    root.querySelector('.vcmp').onclick = onCmp;
    root.querySelector('.vlist').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) pick(b.dataset.id); };
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('on') && !document.querySelector('#kshotv.on')) { e.stopImmediatePropagation(); close(); } }, true);
  };
  const render = () => {
    const box = root.querySelector('.vlist'); let last = '', h = '';
    if (!S.list.length) h = '<div class="vempty">아직 기록이 없습니다.</div>';
    for (const v of S.list) {
      const dy = day(v.t); if (dy !== last) { h += `<div class="vday">${dy}</div>`; last = dy; }
      const cg = chg(v);
      h += `<button class="vi${v.id === S.sel ? ' on' : ''}" data-id="${esc(v.id)}"${chgTip(v) ? ` title="${esc(chgTip(v))}"` : ''}><span class="vtm">${fmt(v.t)}</span>${v.current ? '<span class="vcur">현재 버전</span>' : v.same ? '<span class="vcur">현재와 같음</span>' : ''}`
        + `${v.label ? `<span class="vlb">${esc(v.label)}</span>` : ''}${cg ? `<span class="vcg">${esc(cg)}</span>` : ''}<span class="vwho"><i style="background:${color(v.user || v.kind)}"></i>${esc(v.userName || '이전 기록')}</span></button>`;
    }
    box.innerHTML = h;
  };
  const pick = (id) => {
    const v = S.list.find((x) => x.id === id); if (!v) return; S.sel = id; render();
    root.querySelector('.vt b').textContent = fmt(v.t) + (v.current ? ' · 현재 버전' : v.same ? ' · 현재와 같은 내용' : '');
    root.querySelector('.vt span').textContent = [v.label, chg(v)].filter(Boolean).join(' · ') || '직전 상태 그대로';
    root.querySelector('.vrestore').hidden = !!(v.current || v.same);
    root.querySelector('.vfr').src = `/v/${OWN}/${DID}/${encodeURIComponent(v.id)}/#${v.first || 1}`;   // 처음 바뀐 페이지에서 연다
    initCmp(v);
  };

  // ── 현재와 비교 — 고른 버전 이후 쌓인 변경을 합쳐서 ──
  const C = { id: '', data: null, shots: {}, busy: false };
  const tab = (t) => {
    root.querySelectorAll('.vtabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    root.querySelector('.vcmp').classList.toggle('on', t === 'cmp'); root.querySelector('.vfr').style.visibility = t === 'cmp' ? 'hidden' : '';
    if (t === 'cmp') { drawCmp(); if (C.data && !Object.keys(C.shots).length && C.data.items.length) loadShots(); }
  };
  const initCmp = async (v) => {
    const cb = root.querySelector('.vtabs [data-t="cmp"]'); tab('view'); C.id = v.id; C.data = null; C.shots = {}; C.busy = false; C.err = '';
    cb.hidden = !!(v.current || v.same); if (cb.hidden) return;
    cb.textContent = '현재와 비교 …';
    try {
      const j = await post({ action: 'compare', id: v.id }); if (C.id !== v.id) return; C.data = j;
      const p = [j.nc && `수정 ${j.nc}`, j.na && `추가 ${j.na}`, j.nr && `삭제 ${j.nr}`].filter(Boolean).join(' · ');
      cb.textContent = `현재와 비교 · ${p || '페이지 변화 없음'}`;
    } catch (e) { if (C.id === v.id) cb.textContent = '현재와 비교'; C.err = e.message; }
  };
  const drawCmp = () => {
    const box = root.querySelector('.vcmp'), d = C.data, v = S.list.find((x) => x.id === C.id);
    if (C.err) { box.innerHTML = `<div class="vnote verr">비교하지 못했습니다 — ${esc(C.err)}</div>`; return; }
    if (!d || !v) { box.innerHTML = '<div class="vnote">비교하는 중…</div>'; return; }
    const chips = [d.nc && `<span class="chip c">수정 ${d.nc}</span>`, d.na && `<span class="chip a">추가 ${d.na}</span>`, d.nr && `<span class="chip d">삭제 ${d.nr}</span>`].filter(Boolean).join('');
    let h = `<div class="vsum"><b>「${fmt(v.t)}」 버전 → 현재</b><div class="chips">${chips || '<span class="chip">페이지 변화 없음</span>'}<span class="chip">${d.pagesThen}쪽 → ${d.pagesNow}쪽</span></div>`
      + `${d.other ? '<small>공용 부분(스타일 · 스크립트)도 바뀌었습니다.</small>' : ''}${d.items.length ? '<small>페이지를 누르면 이 버전과 현재를 겹쳐서 비교합니다.</small>' : ''}</div>`;
    const KT = { change: '수정', add: '추가', del: '삭제' };
    h += `<div class="vgrid">${d.items.map((x, i) => { const sh = C.shots[x.name]; const img = sh ? (sh.after || sh.before) : '';
      return `<button class="vct" data-i="${i}"${sh ? '' : ' disabled'}><span class="vth">${img ? `<img src="${img}" alt="">` : (C.busy && !sh ? '화면을 찍는 중…' : '')}<span class="vtag ${x.kind}">${KT[x.kind]}</span></span>`
        + `<span class="vnm">${esc(x.name)}</span><span class="vps">${x.o ? `그때 ${x.o}쪽` : '그때 없음'} → ${x.w ? `지금 ${x.w}쪽` : '지금 없음'}</span></button>`; }).join('')}</div>`;
    const left = d.items.filter((x) => !C.shots[x.name]).length;
    if (left) h += `<button class="vmore"${C.busy ? ' disabled' : ''} data-more="1">${C.busy ? '화면을 찍는 중…' : `화면 보기 (${Math.min(8, left)}개씩 · 남은 ${left}개)`}</button><div class="vnote">${C.busy ? '페이지마다 몇 초 걸립니다' : ''}</div>`;
    box.innerHTML = h;
  };
  const loadShots = async () => {
    const d = C.data; if (!d || C.busy) return; const id = C.id; const names = d.items.filter((x) => !C.shots[x.name]).slice(0, 8).map((x) => x.name); if (!names.length) return;
    C.busy = true; drawCmp();
    try { const j = await post({ action: 'shots', id, names }); if (C.id !== id) return; (j.shots || []).forEach((x) => { C.shots[x.name] = x; }); }
    catch (e) { C.err = e.message; }
    C.busy = false; if (C.id === id) drawCmp();
  };
  const onCmp = (e) => {
    if (e.target.closest('[data-more]')) { loadShots(); return; }
    const t = e.target.closest('.vct'); if (!t || t.disabled) return; const x = C.data?.items[Number(t.dataset.i)], sh = x && C.shots[x.name]; if (!sh) return;
    const v = S.list.find((y) => y.id === C.id), title = `${x.name} — ${fmt(v.t)} 버전과 현재`;
    const st = x.kind === 'change' ? { jpg: sh.after, base: sh.before, label: '', note: '' }
      : x.kind === 'add' ? { jpg: sh.after, base: '', label: '', note: '현재에만 있는 페이지입니다 — 이 버전 뒤에 추가됨' }
      : { jpg: sh.before, base: '', label: '이전', note: '지금은 없는 페이지입니다 — 이 버전 뒤에 삭제됨(이전 그림을 보여 줍니다)' };
    if (window.DeckKit?.shotView) window.DeckKit.shotView(st, title); else window.open(st.jpg, '_blank');
  };
  const restore = async () => {
    const v = S.list.find((x) => x.id === S.sel); if (!v || v.current || v.same) return;
    if (!confirm(`「${fmt(v.t)}」 버전으로 복원할까요?\n지금 상태도 버전 기록에 남아서, 복원한 뒤에도 다시 되돌릴 수 있어요.`)) return;
    const b = root.querySelector('.vrestore'); b.disabled = true; b.textContent = '복원하는 중…';
    try { await post({ action: 'restore', id: v.id }); location.reload(); }
    catch (e) { alert(`복원하지 못했습니다 — ${e.message}`); b.disabled = false; b.textContent = '이 버전 복원하기'; }
  };
  const close = () => { root.classList.remove('on'); root.querySelector('.vfr').src = 'about:blank'; };
  const open = async () => {
    if (!root) build();
    root.classList.add('on'); root.querySelector('.vlist').innerHTML = '<div class="vempty">불러오는 중…</div>';
    try {
      const r = await fetch('/api/versions?file=' + encodeURIComponent(FILE), { cache: 'no-store' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      S.list = j.versions || []; S.sel = ''; render(); pick((S.list.find((x) => x.current) || S.list[0] || {}).id);
    } catch (e) { root.querySelector('.vlist').innerHTML = `<div class="vempty">불러오지 못했습니다 — ${esc(e.message)}</div>`; }
  };
  window.DeckVer = { open, close };
})();
