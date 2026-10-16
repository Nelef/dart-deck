// DART 공시 검색 — BM25(역색인) + 벡터(메모리 전수 검색 또는 Qdrant HNSW) 하이브리드(RRF), 질문 속 회사 이름으로 회사 필터.
// 토큰화는 법숲과 같다(어절의 문자 bigram). 법숲 BM25 는 문서마다 Map 이라 9만 청크에선 메모리가 커서 역색인(typed array)으로 다시 짰다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { embedQueries } from './embed.mjs';

export function tokenize(text) {
  const out = [];
  for (const w of String(text).toLowerCase().match(/[가-힣]+|[a-z0-9]+/g) ?? []) {
    if (w.length === 1) { out.push(w); continue; }
    for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
  }
  return out;
}

// ── BM25 역색인: 토큰 → (문서 번호 Int32Array, 빈도 Uint16Array) ──
class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1; this.b = b; this.N = docs.length; this.len = new Uint32Array(this.N);
    const post = new Map();   // token → [doc, tf, doc, tf, …](모으는 동안만 일반 배열)
    docs.forEach((d, i) => {
      const tf = new Map(); for (const t of tokenize(d)) tf.set(t, (tf.get(t) ?? 0) + 1);
      let n = 0;
      for (const [t, f] of tf) { n += f; let a = post.get(t); if (!a) post.set(t, (a = [])); a.push(i, f); }
      this.len[i] = n;
    });
    this.avg = this.len.reduce((a, c) => a + c, 0) / this.N;
    this.idx = new Map();
    for (const [t, a] of post) {
      const d = new Int32Array(a.length / 2), f = new Uint16Array(a.length / 2);
      for (let j = 0; j < a.length; j += 2) { d[j / 2] = a[j]; f[j / 2] = Math.min(a[j + 1], 65535); }
      this.idx.set(t, [d, f]);
    }
  }
  scores(query, allow) {   // allow: Uint8Array(N) — 1 인 문서만(회사 필터)
    const s = new Float32Array(this.N);
    for (const t of new Set(tokenize(query))) {
      const p = this.idx.get(t); if (!p) continue;
      const [d, f] = p, idf = Math.log(1 + (this.N - d.length + 0.5) / (d.length + 0.5));
      for (let j = 0; j < d.length; j++) {
        const i = d[j]; if (allow && !allow[i]) continue;
        s[i] += idf * (f[j] * (this.k1 + 1)) / (f[j] + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg));
      }
    }
    return s;
  }
}

const topK = (s, k, allow) => {
  const idx = []; for (let i = 0; i < s.length; i++) if ((!allow || allow[i]) && s[i] > 0) idx.push(i);
  return idx.sort((a, b) => s[b] - s[a]).slice(0, k);
};

/** 색인 읽기 — chunks.jsonl + vec/part-*.f32 + BM25. names: 회사 이름 목록(긴 것부터 — '삼성전자'가 '삼성'보다 먼저) */
export function loadIndex(dataDir, { log = () => {}, vectors = true, vecDir = 'vec/' } = {}) {
  const t0 = Date.now();
  const chunks = readFileSync(dataDir + 'chunks.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  log(`청크 ${chunks.length.toLocaleString()}개 읽음`);
  let vecs = null, dim = 1024;
  if (vectors && existsSync(dataDir + vecDir)) {
    const parts = readdirSync(dataDir + vecDir).filter((f) => /^part-\d+\.f32$/.test(f)).sort();
    vecs = new Float32Array(chunks.length * dim); let off = 0;
    for (const p of parts) { const b = readFileSync(dataDir + vecDir + p); const v = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); vecs.set(v, off); off += v.length; }
    if (off !== vecs.length) { log(`벡터 ${off / dim}/${chunks.length} — 덜 만들어짐(전수 검색은 만든 데까지)`); }
  }
  const bm25 = new BM25(chunks.map((c) => `${c.head}\n${c.text}`));
  const byName = new Map(); chunks.forEach((c, i) => { let a = byName.get(c.name); if (!a) byName.set(c.name, (a = [])); a.push(i); });
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  log(`색인 준비 ${((Date.now() - t0) / 1000).toFixed(1)}초 · 회사 ${names.length}곳`);
  return { chunks, vecs, dim, bm25, byName, names, N: chunks.length };
}

// 질문 속 회사 — 정식 이름 그대로 또는 흔한 줄임(㈜ · 주식회사 · 홀딩스 · 지주 떼기). 못 찾으면 null(필터 없음)
const ALIAS = (n) => [n, n.replace(/\(주\)|㈜|주식회사/g, '').trim(), n.replace(/홀딩스$|지주$|금융지주$/, '')].filter((x) => x.length >= 2);
export function companiesIn(idx, q) {
  const hit = [];
  for (const n of idx.names) if (ALIAS(n).some((a) => q.includes(a)) && !hit.some((h) => h.includes(n))) hit.push(n);
  return hit;
}
function allowOf(idx, names) {
  if (!names?.length) return null;
  const a = new Uint8Array(idx.N); for (const n of names) for (const i of idx.byName.get(n) ?? []) a[i] = 1; return a;
}

function denseScan(idx, qv, allow) {
  const { vecs, dim, N } = idx, s = new Float32Array(N);
  const n = Math.min(N, vecs.length / dim);
  for (let i = 0; i < n; i++) {
    if (allow && !allow[i]) continue;
    let d = 0; const o = i * dim; for (let j = 0; j < dim; j++) d += vecs[o + j] * qv[j];
    s[i] = d + 1;   // topK 가 0 이하를 버리므로 코사인(-1~1)을 양수로
  }
  return s;
}

async function denseQdrant(idx, qv, names, k, { url, collection }) {
  const body = { vector: Array.from(qv), limit: k, with_payload: false };
  if (names?.length) body.filter = { should: names.map((n) => ({ key: 'name', match: { value: n } })) };
  const r = await fetch(`${url}/collections/${collection}/points/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`qdrant ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.result.map((x) => x.id);
}

/**
 * search(idx, q, opts) → { hits: [{i, chunk, rank}], companies, ms: {embed, bm25, dense} }
 * opts.mode = bm25 | dense | hybrid · opts.filter = true(질문 속 회사로 거름) · opts.dense = 'scan' | {url, collection}(Qdrant)
 */
export async function search(idx, q, { mode = 'hybrid', k = 10, pool = 50, rrfK = 60, w = [1, 1], filter = true, dense = 'scan', qvec } = {}) {
  const ms = {}; const companies = filter ? companiesIn(idx, q) : []; const allow = allowOf(idx, companies);
  let tb = performance.now(); let bOrder = [];
  if (mode !== 'dense') { bOrder = topK(idx.bm25.scores(q, allow), pool, allow); }
  ms.bm25 = performance.now() - tb;
  let dOrder = [];
  if (mode !== 'bm25') {
    let te = performance.now(); const qv = qvec ?? (await embedQueries('bge-m3', [q])).vecs; ms.embed = performance.now() - te;
    let td = performance.now();
    dOrder = dense === 'scan' ? topK(denseScan(idx, qv, allow), pool, allow) : await denseQdrant(idx, qv, companies, pool, dense);
    ms.dense = performance.now() - td;
  }
  let order;
  if (mode === 'bm25') order = bOrder; else if (mode === 'dense') order = dOrder;
  else {
    const f = new Map();
    bOrder.forEach((i, r) => f.set(i, (f.get(i) ?? 0) + w[0] / (rrfK + r + 1)));
    dOrder.forEach((i, r) => f.set(i, (f.get(i) ?? 0) + w[1] / (rrfK + r + 1)));
    order = [...f.keys()].sort((a, b) => f.get(b) - f.get(a));
  }
  return { hits: order.slice(0, k).map((i, r) => ({ i, chunk: idx.chunks[i], rank: r + 1 })), companies, ms };
}
