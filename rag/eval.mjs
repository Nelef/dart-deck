// 검색 평가 — rag/eval/questions.json(정답 = OpenDART 정형 값이 든 같은 회사 청크)
//   node rag/eval.mjs [--split dev|test] [--modes bm25,dense,hybrid] [--qdrant http://127.0.0.1:6333] [--out 이름]
// 지표: hit@1 · hit@5 · hit@10 · MRR(첫 정답 순위), 질문 종류별, 회사 필터 켬/끔, 지연(중앙값). 범위 밖 질문은 검색 지표에서 뺀다(답변 단계에서 거절을 잰다).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadIndex, search } from './lib/search.mjs';
import { embedQueries } from './lib/embed.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const split = arg('split', 'dev'), modes = arg('modes', 'bm25,dense,hybrid').split(','), qd = arg('qdrant', ''), outName = arg('out', `${split}-${Date.now()}`);
const DATA = new URL('./data/', import.meta.url).pathname, EVAL = new URL('./eval/', import.meta.url).pathname;
const qs = JSON.parse(readFileSync(EVAL + 'questions.json', 'utf8')).filter((q) => q.split === split && q.gold.length);
const idx = loadIndex(DATA, { log: (m) => console.error(m), vectors: modes.some((m) => m !== 'bm25') && !qd });
const qvecs = new Map();
if (modes.some((m) => m !== 'bm25')) {   // 질의 임베딩은 한 번만(설정끼리 같은 벡터로 비교)
  const t0 = Date.now(); const { vecs, dim } = await embedQueries('bge-m3', qs.map((q) => q.q));
  qs.forEach((q, j) => qvecs.set(q.id, vecs.subarray(j * dim, (j + 1) * dim)));
  console.error(`질의 임베딩 ${qs.length}개 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const rows = [];
for (const mode of modes) for (const filter of [false, true]) {
  const name = `${mode}${filter ? '+회사필터' : ''}${qd && mode !== 'bm25' ? '(qdrant)' : ''}`;
  let h1 = 0, h5 = 0, h10 = 0, mrr = 0; const lat = [], kinds = {};
  for (const q of qs) {
    const t = performance.now();
    const r = await search(idx, q.q, { mode, k: 10, filter, qvec: qvecs.get(q.id), dense: qd ? { url: qd, collection: 'dart' } : 'scan' });
    lat.push(performance.now() - t);
    const gold = new Set(q.gold); const rank = r.hits.find((h) => gold.has(h.chunk.id))?.rank ?? 0;
    h1 += rank === 1; h5 += rank && rank <= 5; h10 += rank && rank <= 10; mrr += rank ? 1 / rank : 0;
    const kd = (kinds[q.kind] ??= { n: 0, h5: 0 }); kd.n++; kd.h5 += rank && rank <= 5;
  }
  const n = qs.length, f = (x) => (x / n).toFixed(3);
  const row = { 설정: name, n, 'hit@1': f(h1), 'hit@5': f(h5), 'hit@10': f(h10), MRR: f(mrr), '지연 중앙값(ms)': med(lat).toFixed(1),
                종류별_hit5: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, (v.h5 / v.n).toFixed(2)])) };
  rows.push(row); console.log(JSON.stringify(row));
}
mkdirSync(EVAL + 'results/', { recursive: true });
writeFileSync(EVAL + `results/${outName}.json`, JSON.stringify({ split, n: qs.length, chunks: idx.N, rows, at: new Date().toISOString() }, null, 1));
