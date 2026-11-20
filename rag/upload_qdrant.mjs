// 벡터를 Qdrant 에 올린다 — 컬렉션 dart(1024차원 · 코사인 · HNSW 기본값), payload = 회사 · 종목 · 연도 · 장(회사 필터용 색인).
//   (Qdrant 가 다른 서버 안에서만 열려 있으면 ssh -L 로 터널을 연 뒤 DART_QDRANT 로 주소를 넘긴다)
//   node rag/upload_qdrant.mjs http://127.0.0.1:16333 [--recreate]
// 점 id = chunks.jsonl 의 줄 번호(검색 결과를 같은 청크 배열로 바로 찾는다).
import { readFileSync, readdirSync } from 'node:fs';

const URL0 = process.argv[2] || 'http://127.0.0.1:16333', COL = 'dart', DIM = 1024, BATCH = 256;
const DATA = process.env.DART_DATA || new URL('./data/', import.meta.url).pathname;
const api = async (method, path, body) => {
  const r = await fetch(URL0 + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j;
};
const chunks = readFileSync(DATA + 'chunks.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const parts = readdirSync(DATA + 'vec/').filter((f) => /^part-\d+\.f32$/.test(f)).sort();   // q_torch.f32(검증용 질문 벡터)는 빼고
const vecs = new Float32Array(chunks.length * DIM); let off = 0;
for (const p of parts) { const b = readFileSync(DATA + 'vec/' + p); const v = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); vecs.set(v, off); off += v.length; }
const n = off / DIM; if (n !== chunks.length) console.warn(`벡터 ${n}/${chunks.length} — 있는 만큼만 올린다`);

const exists = (await api('GET', '/collections')).result.collections.some((c) => c.name === COL);
if (exists && process.argv.includes('--recreate')) { await api('DELETE', `/collections/${COL}`); }
if (!exists || process.argv.includes('--recreate')) {
  await api('PUT', `/collections/${COL}`, { vectors: { size: DIM, distance: 'Cosine' }, hnsw_config: { m: 16, ef_construct: 100 }, optimizers_config: { default_segment_number: 2 } });
  await api('PUT', `/collections/${COL}/index`, { field_name: 'name', field_schema: 'keyword' });
}
const t0 = Date.now();
for (let s = 0; s < n; s += BATCH) {
  const points = [];
  for (let i = s; i < Math.min(n, s + BATCH); i++) {
    const c = chunks[i];
    points.push({ id: i, vector: Array.from(vecs.subarray(i * DIM, (i + 1) * DIM)), payload: { name: c.name, stock: c.stock, year: c.year, sec1: c.sec1 } });
  }
  await api('PUT', `/collections/${COL}/points?wait=true`, { points });
  if ((s / BATCH) % 40 === 0) console.log(`${Math.min(n, s + BATCH).toLocaleString()}/${n.toLocaleString()} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
}
const info = (await api('GET', `/collections/${COL}`)).result;
console.log(`완료 — 점 ${info.points_count?.toLocaleString()} · 상태 ${info.status} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
