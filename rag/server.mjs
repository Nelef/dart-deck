// DART 공시 검색 서버 — 컨테이너 안에서만(127.0.0.1). 덱 에이전트의 MCP 도구(rag/mcp.mjs)가 부른다.
//   DART_DATA=/data/rag/ DART_QDRANT=http://dartqdrant:6333 node rag/server.mjs     (포트 DART_RAG_PORT, 기본 8787)
//   GET /health · /search?q=&k=&company= · /section?rcept_no=&sec1=&sec2= · /finance?name=&year=
// 벡터는 Qdrant(HNSW) — 없으면 메모리 전수 검색. BM25 는 메모리(역색인).
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { loadIndex, search, companiesIn } from './lib/search.mjs';

const PORT = +process.env.DART_RAG_PORT || 8787;
const DATA = process.env.DART_DATA || new URL('./data/', import.meta.url).pathname;
const QD = process.env.DART_QDRANT || '';
const KEY = process.env.DART_API_KEY || '';
const idx = loadIndex(DATA, { log: (m) => console.error(`[dart] ${m}`), vectors: !QD });
const reports = JSON.parse(readFileSync(DATA + 'reports.json', 'utf8'));
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const cite = (c) => ({ id: c.id, name: c.name, year: c.year, rcept_no: c.rcept_no, section: c.sec1 + (c.sec2 ? ` > ${c.sec2}` : ''),
                       url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${c.rcept_no}`, text: c.text });
const finCache = new Map();

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), p = u.searchParams;
    if (u.pathname === '/health') return send(res, 200, { ok: true, chunks: idx.N, companies: idx.names.length, dense: QD ? 'qdrant' : 'scan' });
    if (u.pathname === '/companies') return send(res, 200, { companies: reports.map((r) => ({ name: r.name, stock: r.stock, report: r.report_nm, rcept_no: r.rcept_no })) });
    if (u.pathname === '/search') {
      const q = String(p.get('q') || '').slice(0, 500); if (!q) return send(res, 400, { error: 'q 가 필요합니다' });
      const company = p.get('company'); const k = Math.min(20, +p.get('k') || 8);
      // 회사를 따로 주면 그 회사로만, 아니면 질문 속 회사 이름으로 거른다
      const r = await search(idx, company ? `${company} ${q}` : q, { k, filter: true, w: [0.25, 1], dense: QD ? { url: QD, collection: 'dart' } : 'scan' });   // 가중은 dev 로 고름(BM25 0.25 : 벡터 1)
      return send(res, 200, { companies: r.companies, hits: r.hits.map((h) => ({ rank: h.rank, ...cite(h.chunk) })), ms: r.ms });
    }
    if (u.pathname === '/section') {   // 한 장 · 절의 청크를 순서대로 이어 붙여 준다(긴 절은 앞 12개까지)
      const rc = p.get('rcept_no'), s1 = p.get('sec1') || '', s2 = p.get('sec2') || '';
      const cs = idx.chunks.filter((c) => c.rcept_no === rc && (!s1 || c.sec1.includes(s1)) && (!s2 || c.sec2.includes(s2))).slice(0, 12);
      return send(res, 200, { n: cs.length, chunks: cs.map(cite) });
    }
    if (u.pathname === '/finance') {   // OpenDART 정형 재무(주요 계정) — 숫자는 이 값을 우선 쓴다
      const name = String(p.get('name') || ''), year = String(p.get('year') || '2025');
      const r = reports.find((x) => x.name === name) ?? reports.find((x) => companiesIn(idx, name).includes(x.name));
      if (!r) return send(res, 404, { error: `코퍼스에 없는 회사: ${name}` });
      if (!KEY) return send(res, 503, { error: 'DART_API_KEY 가 없습니다' });
      const ck = `${r.corp_code}:${year}`;
      if (!finCache.has(ck)) {
        const j = await (await fetch(`https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${KEY}&corp_code=${r.corp_code}&bsns_year=${year}&reprt_code=11011`)).json();
        finCache.set(ck, j);
      }
      const j = finCache.get(ck); if (j.status !== '000') return send(res, 404, { error: j.message });
      const fs = j.list.some((x) => x.fs_div === 'CFS') ? 'CFS' : 'OFS';
      const rows = j.list.filter((x) => x.fs_div === fs).map((x) => ({ 계정: x.account_nm, 당기: x.thstrm_amount, 전기: x.frmtrm_amount, 전전기: x.bfefrmtrm_amount, 단위: '원' }));
      return send(res, 200, { name: r.name, year, 기준: fs === 'CFS' ? '연결' : '별도', rcept_no: j.list[0]?.rcept_no, rows });
    }
    send(res, 404, { error: '없는 주소' });
  } catch (e) { send(res, 500, { error: String(e.message || e).slice(0, 300) }); }
}).listen(PORT, '127.0.0.1', () => console.error(`[dart] 검색 서버 127.0.0.1:${PORT} · 벡터 ${QD ? 'Qdrant' : '전수 검색'}`));
