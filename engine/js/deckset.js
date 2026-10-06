// 문서 설정 — 오른쪽 위 ⚙ 단추와 판(사용자 지정 2026-10-01 "화면 우측상단에 문서 설정 · 거기서 PDF 다운로드, 예상 시간도").
//   · 읽기 공유: 링크를 만들면 받은 누구나 로그인 없이 이 자료를 보기만 한다(서버 /s/<토큰>/, 고치기 · AI 없음). 새 주소로 바꾸기 · 끄기
//   · 버전 기록: 저장할 때마다 남은 옛 버전을 보고 복원(js/deckver.js)
//   · PDF 로 받기: 서버가 페이지마다 화면 그대로 찍어 묶는다(/pdf/<계정>/<덱>.pdf). 예상 시간은 서버가 쪽수 + 그 덱에서 전에 잰 속도로 알려 준다
// js/deck.js 가 주인 · 관리자의 /d/ 주소에서만 불러온다. 서버 API = POST /api/docset {file, action: get | share_on | share_off | share_renew}
(() => {
  if (window.DeckSet) return;
  const FILE = location.pathname; const m = FILE.match(/^\/d\/([^/]+)\/([^/]+)\//); if (!m) return;
  const CSS = `
  #dset { position: fixed; right: 14px; top: 46px; z-index: 60; width: min(372px, calc(100vw - 28px)); max-height: calc(100dvh - 60px); overflow-y: auto; display: none; background: #fff; color: #16181d; border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,.35); font: 500 13.5px/1.55 'Noto Sans KR', sans-serif; padding: 6px 18px 16px; }
  #dset.on { display: block; }
  #dset h3 { margin: 12px 0 2px; font-size: 16px; font-weight: 800; }
  #dset .ds-sec { padding: 12px 0; border-top: 1px solid #eceef2; } #dset h3 + .ds-sec { border-top: 0; }
  #dset h4 { margin: 0 0 3px; font-size: 14px; font-weight: 800; }
  #dset p { margin: 0 0 9px; color: #5a6070; font-size: 12.5px; }
  #dset small { display: block; margin-top: 7px; color: #6b7280; font-size: 12px; }
  #dset button { font: 700 13px 'Noto Sans KR', sans-serif; cursor: pointer; border-radius: 10px; border: 1px solid #d5d9e2; background: #fff; color: #16181d; padding: 8px 13px; }
  #dset button:hover { background: #f3f5f9; } #dset button:disabled { opacity: .55; cursor: default; }
  #dset button.pri { background: #416AF0; border-color: #416AF0; color: #fff; } #dset button.pri:hover { background: #3459d6; }
  #dset button.warn { color: #c2272d; }
  #dset .url { display: flex; gap: 6px; } #dset .url input { flex: 1; min-width: 0; font: 500 12.5px ui-monospace, Menlo, monospace; padding: 8px 10px; border: 1px solid #d5d9e2; border-radius: 10px; background: #f7f8fa; color: #16181d; }
  #dset .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } #dset .row a { align-self: center; color: #416AF0; font-weight: 700; text-decoration: none; padding: 0 6px; }
  #dset .est { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } #dset .est b { color: #416AF0; }
  #dset .bar { height: 7px; border-radius: 99px; background: #e8ebf2; overflow: hidden; margin-top: 9px; } #dset .bar i { display: block; height: 100%; width: 0; background: #416AF0; transition: width .4s linear; }
  #dset .err { margin-top: 8px; color: #c2272d; font-size: 12.5px; }
  `;
  const fmt = (s) => (s < 60 ? `${Math.round(s)}초` : `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`);
  const post = async (action) => {
    const r = await fetch('/api/docset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: FILE, action }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j;
  };
  const S = { st: null, busy: false, pdf: null, err: '' };
  const btn = document.createElement('button'); btn.id = 'ppt-set'; btn.title = '문서 설정 — 읽기 공유 · PDF'; btn.innerHTML = '<b>⚙</b><span>문서 설정</span>';
  const pop = document.createElement('div'); pop.id = 'dset';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  document.body.appendChild(btn); document.body.appendChild(pop);
  const shareUrl = () => (S.st && S.st.share ? location.origin + S.st.share : '');

  const draw = () => {
    const s = S.st; const url = shareUrl(); const p = S.pdf;
    let h = '<h3>문서 설정</h3>';
    h += '<div class="ds-sec"><h4>버전 기록</h4><p>직접 고치거나 AI 가 고칠 때마다 그 시점의 발표 자료가 기록됩니다. 옛 버전을 보고 그 버전으로 되돌릴 수 있어요.</p><button class="pri" data-a="ver">버전 기록 보기</button></div>';
    h += '<div class="ds-sec"><h4>읽기 공유</h4><p>링크를 받은 누구나 로그인 없이 이 자료를 <b>보기만</b> 할 수 있습니다. 고치기 · AI 는 쓸 수 없습니다.</p>';
    if (!s) h += '<small>불러오는 중…</small>';
    else if (!url) h += '<button class="pri" data-a="share_on">읽기 링크 만들기</button>';
    else h += '<div class="url"><input readonly value=""><button data-a="copy" class="pri">복사</button></div><div class="row"><a href="" target="_blank" rel="noopener">열어 보기 ↗</a><button data-a="share_renew">새 주소로 바꾸기</button><button data-a="share_off" class="warn">공유 끄기</button></div><small>새 주소로 바꾸거나 끄면 이전 링크는 바로 막힙니다.</small>';
    h += '</div><div class="ds-sec"><h4>PDF 로 받기</h4><p>보이는 화면 그대로, 페이지마다 한 쪽으로 묶습니다. 글자는 선택 · 검색할 수 있습니다.</p>';
    if (!s) h += '<small>불러오는 중…</small>';
    else {
      const e = s.pdf;
      h += `<div class="est"><button class="pri" data-a="pdf" ${p ? 'disabled' : ''}>${p ? 'PDF 만드는 중…' : 'PDF 받기'}</button>`;
      if (p) h += `<span data-k="prog"></span>`;
      else h += e.cached ? `<span>이미 만들어 둔 PDF 가 있어 <b>바로</b> 받습니다 · ${e.pages}쪽</span>` : `<span>예상 약 <b>${fmt(e.estSec)}</b> · ${e.pages}쪽</span>`;
      h += '</div>';
      if (p) h += '<div class="bar"><i></i></div>';
      else if (!e.cached) h += '<small>쪽수가 많을수록 오래 걸립니다. 만든 뒤 덱이 바뀌지 않았으면 다음부터는 바로 받습니다.</small>';
    }
    if (S.err) h += `<div class="err"></div>`;
    h += '</div>';
    pop.innerHTML = h;
    const inp = pop.querySelector('.url input'); if (inp) inp.value = url; const a = pop.querySelector('.row a'); if (a) a.href = url;
    const er = pop.querySelector('.err'); if (er) er.textContent = S.err;
    tickPdf();
  };
  const tickPdf = () => {
    const p = S.pdf; if (!p) return; const el = pop.querySelector('[data-k="prog"]'); const bar = pop.querySelector('.bar i'); if (!el) return;
    const sec = (Date.now() - p.t0) / 1000; const est = p.est || 0;
    el.textContent = est ? (sec <= est ? `${fmt(sec)} 경과 · 예상 약 ${fmt(est)}` : `${fmt(sec)} 경과 · 예상보다 조금 더 걸리는 중`) : `${fmt(sec)} 경과`;
    if (bar) bar.style.width = `${est ? Math.min(96, (sec / est) * 100) : 30}%`;
  };
  const load = async () => { try { S.st = await post('get'); S.err = ''; } catch (e) { S.err = `불러오지 못했습니다 — ${e.message}`; S.st = S.st || { share: '', pdf: { pages: 0, cached: false, estSec: 0 } }; } draw(); };
  const act = async (a) => {
    if (S.busy) return;
    if (a === 'copy') {
      const inp = pop.querySelector('.url input'); inp.select();
      let ok = false; try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { /* 아래 안내 */ } }   // http 주소에선 clipboard API 가 막혀 있다
      const b = pop.querySelector('[data-a="copy"]'); b.textContent = ok ? '복사됨 ✓' : '선택됨 — Ctrl+C'; setTimeout(() => { if (b.isConnected) b.textContent = '복사'; }, 2200); return;
    }
    if (a === 'share_off' && !confirm('읽기 공유를 끌까요? 지금 링크로는 더 볼 수 없게 됩니다.')) return;
    if (a === 'share_renew' && !confirm('새 주소로 바꿀까요? 이전 링크는 바로 막힙니다.')) return;
    if (a === 'ver') {   // 버전 기록 — 전체 화면 보기(js/deckver.js, 처음 누를 때 불러온다)
      toggle(false); const go = () => window.DeckVer?.open();
      if (window.DeckVer) return go(); const z = document.createElement('script'); z.src = 'js/deckver.js'; z.onload = go; z.onerror = () => alert('버전 기록을 불러오지 못했습니다'); document.body.appendChild(z); return;
    }
    if (a === 'pdf') return pdf();
    S.busy = true; S.err = '';
    try { S.st = await post(a); } catch (e) { S.err = e.message; }
    S.busy = false; draw();
  };
  const pdf = async () => {
    if (S.pdf) return; S.err = ''; const cached = S.st?.pdf?.cached;
    S.pdf = { t0: Date.now(), est: cached ? 0 : S.st?.pdf?.estSec || 0 }; draw(); const iv = setInterval(tickPdf, 500);
    try {
      const r = await fetch(`/pdf/${m[1]}/${m[2]}.pdf`, { cache: 'no-store' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${document.title || 'deck'}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    } catch (e) { S.err = `PDF 를 만들지 못했습니다 — ${e.message}`; }
    clearInterval(iv); S.pdf = null; await load();
  };
  const toggle = (on) => { pop.classList.toggle('on', on); if (on) { draw(); load(); } };
  btn.onclick = (e) => { e.stopPropagation(); toggle(!pop.classList.contains('on')); };
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  pop.addEventListener('keydown', (e) => e.stopPropagation());   // 덱의 방향키 · 스페이스 넘김이 판 안 입력칸에서 일어나지 않게
  document.addEventListener('pointerdown', (e) => { if (pop.classList.contains('on') && !e.target.closest('#dset, #ppt-set')) toggle(false); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.classList.contains('on') && !S.pdf) toggle(false); });
  window.DeckSet = { open: () => toggle(true), close: () => toggle(false) };
})();
