// 로컬 임베딩(@huggingface/transformers, ONNX). Claude 에는 임베딩 API 가 없어 로컬 모델을 쓴다 — 외부 API 키 없이 로컬 CPU 에서 돈다.
import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = new URL('../models/', import.meta.url).pathname;   // rag/models/Xenova/bge-m3 (법숲과 같은 파일)
if (process.env.DART_OFFLINE) env.allowRemoteModels = false; // 배포 이미지: 포함된 모델만 쓴다

export const MODELS = {
  'e5-small': { id: 'Xenova/multilingual-e5-small', q: 'query: ', p: 'passage: ' },
  'e5-base': { id: 'Xenova/multilingual-e5-base', q: 'query: ', p: 'passage: ' },
  'bge-m3': { id: 'Xenova/bge-m3', q: '', p: '', pooling: 'cls' }, // bge-m3 는 CLS 풀링이 표준(처음 mean 으로 돌려 점수가 낮게 나왔다 → 고침)
};

const pipes = new Map();
async function getPipe(name) {
  if (!pipes.has(name)) pipes.set(name, pipeline('feature-extraction', MODELS[name].id, { dtype: 'q8' }));
  return pipes.get(name);
}

async function embed(name, texts, prefix, batch = 16, onProgress) {
  const pipe = await getPipe(name);
  const pooling = MODELS[name].pooling ?? 'mean';
  let dim = 0, out = null;
  for (let i = 0; i < texts.length; i += batch) {
    const part = texts.slice(i, i + batch).map((t) => prefix + t);
    const t = await pipe(part, { pooling, normalize: true });
    if (!out) { dim = t.dims[1]; out = new Float32Array(texts.length * dim); }
    out.set(t.data, i * dim);
    onProgress?.(Math.min(i + batch, texts.length), texts.length);
  }
  return { vecs: out ?? new Float32Array(0), dim };
}

export const embedPassages = (name, texts, onProgress) => embed(name, texts, MODELS[name].p, 16, onProgress);
export const embedQueries = (name, texts) => embed(name, texts, MODELS[name].q, 32);
