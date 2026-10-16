// DART 공시 검색을 MCP 도구로(stdio) — 덱 에이전트(Claude Code)가 근거를 직접 찾아 쓴다. 실제 검색은 rag/server.mjs(127.0.0.1)가 한다.
//   DART_RAG_URL=http://127.0.0.1:8787 node rag/mcp.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.DART_RAG_URL || 'http://127.0.0.1:8787';
const get = async (path, q) => { const r = await fetch(`${BASE}${path}?${new URLSearchParams(q)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const src = (h) => `[${h.name} ${h.year} 사업보고서 · ${h.section} · 접수번호 ${h.rcept_no}]`;

const server = new McpServer({ name: 'dart', version: '0.1.0' });

server.registerTool('dart_search', {
  description: '유가증권시장 대형사 95곳의 2025 사업보고서(DART)에서 질문과 관련된 문단 · 표를 찾는다(BM25 + bge-m3 하이브리드, 질문 속 회사로 거름). '
             + '결과마다 출처(회사 · 장 > 절 · 접수번호)가 붙는다 — 발표 자료에 넣는 사실 · 숫자는 반드시 이 출처를 각주로 단다.',
  inputSchema: { query: z.string().describe('자연어 질문 또는 키워드'), company: z.string().optional().describe('회사 이름(알면 넣으면 그 회사로만 찾는다)'),
                 k: z.number().int().min(1).max(15).default(8) },
}, async ({ query, company, k }) => {
  const j = await get('/search', { q: query, k, ...(company ? { company } : {}) });
  if (!j.hits.length) return text('결과 없음 — 코퍼스에 없는 회사이거나 관련 문단이 없습니다. 지어내지 말고 "공시에서 찾지 못했다"고 답한다.');
  return text(j.hits.map((h) => `${h.rank}. ${src(h)}\n${h.text.slice(0, 900)}${h.text.length > 900 ? ' …' : ''}`).join('\n\n'));
});

server.registerTool('dart_finance', {
  description: '회사의 주요 재무(매출액 · 영업이익 · 당기순이익 · 자산 · 부채 · 자본, 당기 · 전기 · 전전기)를 OpenDART 정형 값으로 가져온다. 숫자는 이 값을 우선 쓰고 단위(원)를 바꿔 적을 때 틀리지 않게 한다.',
  inputSchema: { name: z.string().describe('회사 이름'), year: z.string().default('2025') },
}, async ({ name, year }) => {
  const j = await get('/finance', { name, year });
  return text(`${j.name} ${j.year} 주요 재무(${j.기준}, 단위 원, 접수번호 ${j.rcept_no})\n` + j.rows.map((r) => `${r.계정}: 당기 ${r.당기} · 전기 ${r.전기} · 전전기 ${r.전전기}`).join('\n'));
});

server.registerTool('dart_section', {
  description: '사업보고서의 한 장 · 절을 순서대로 읽는다(검색 결과의 접수번호와 장 이름으로). 예: sec1="II. 사업의 내용", sec2="1. 사업의 개요".',
  inputSchema: { rcept_no: z.string(), sec1: z.string().optional(), sec2: z.string().optional() },
}, async (q) => {
  const j = await get('/section', Object.fromEntries(Object.entries(q).filter(([, v]) => v)));
  return text(j.chunks.map((c) => `${src(c)}\n${c.text}`).join('\n\n') || '해당 절 없음');
});

await server.connect(new StdioServerTransport());
