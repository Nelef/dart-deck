// 청크(rag/data/chunks.jsonl) → bge-m3 벡터(rag/data/vec/part-NNNN.f32, 2048개씩). 끊겨도 다시 돌리면 없는 조각만 만든다.
//   node rag/embed.mjs
// 모델 · 설정은 법숲과 같다(Xenova/bge-m3 · q8 · CLS 풀링 · 정규화) — 질의 임베딩도 반드시 같은 경로(rag/lib/embed)로.
// 임베딩할 글 = 머리(회사 · 연도 · 장 > 절) + 본문 — 회사 이름이 본문에 없는 청크도 회사로 찾히게.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { embedPassages } from './lib/embed.mjs';

const DATA = new URL('./data/', import.meta.url).pathname, VEC = DATA + 'vec/', PART = 2048;
mkdirSync(VEC, { recursive: true });
const chunks = readFileSync(DATA + 'chunks.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const parts = Math.ceil(chunks.length / PART), t0 = Date.now();
console.log(`청크 ${chunks.length.toLocaleString()}개 · 조각 ${parts}개`);
const [SI, SN] = (process.argv.find((a) => a.startsWith('--shard='))?.slice(8) || '0/1').split('/').map(Number);   // 여러 프로세스로 나눠 돌리기 — p % SN === SI 인 조각만
for (let p = 0; p < parts; p++) {
  if (p % SN !== SI) continue;
  const f = `${VEC}part-${String(p).padStart(4, '0')}.f32`;
  if (existsSync(f)) continue;
  const slice = chunks.slice(p * PART, (p + 1) * PART).map((c) => `${c.head}\n${c.text}`);
  const { vecs, dim } = await embedPassages('bge-m3', slice);
  writeFileSync(f, Buffer.from(vecs.buffer));
  const done = Math.min((p + 1) * PART, chunks.length), sec = (Date.now() - t0) / 1000;
  console.log(`${p + 1}/${parts} · ${done.toLocaleString()}개 · dim ${dim} · ${(sec / 60).toFixed(1)}분`);
}
if (SN === 1) writeFileSync(VEC + 'meta.json', JSON.stringify({ model: 'Xenova/bge-m3', dtype: 'q8', pooling: 'cls', normalize: true, dim: 1024, count: chunks.length, part: PART }));
console.log('완료');
