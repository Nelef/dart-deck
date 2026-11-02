# DART Deck 이미지 — 파이썬 서버(server/app.py) + 캡처용 크롬(playwright) + Claude Code CLI
# playwright 공식 이미지(node · 크롬 · 한글 글꼴 의존성 포함)를 바탕으로 한다 — 버전은 package.json 의 playwright 와 같아야 한다
FROM mcr.microsoft.com/playwright:v1.59.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-noto-cjk poppler-utils libreoffice-impress python3-uno fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea && rm -rf /var/lib/apt/lists/*
# poppler-utils = PDF 글 · 쪽 그림, libreoffice-impress = 기존 PPT 가져오기(pptx → PDF, server/importer.py)
# Claude Code — 쓰는 사람의 구독 토큰으로 덱을 만들고 고친다(server/deckagent.py)
RUN npm install -g @anthropic-ai/claude-code && claude --version

# 대체 엔진(LiteLLM) — Claude 한도가 차면 Codex(ChatGPT 구독) · Gemini 로 이어 간다(server/alt_llm.py, 2026-11-02). 이 맥에서 시험한 판으로 고정
RUN python3 -m venv /opt/litellm && /opt/litellm/bin/pip install --no-cache-dir 'litellm[proxy]==1.103.0' && /opt/litellm/bin/litellm --version >/dev/null

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server ./server
# 기존 PPT 가져오기 — 서버에 없는 윈도 글꼴(맑은 고딕 · Arial …)을 비슷한 글꼴로(없으면 중국어 글꼴로 바뀌어 줄이 겹쳤다)
RUN cp server/fonts-ko.conf /etc/fonts/local.conf && fc-cache -f >/dev/null
COPY engine ./engine
# PDF 로 받기 — 가변 글꼴을 굵기별 고정 글꼴로(engine/tools/fontprint.py · fonttools). 크롬이 가변 글꼴을 PDF 에 Type 3 로 넣어 커지고 흐려서
RUN python3 -m venv /opt/fonttools && /opt/fonttools/bin/pip install --no-cache-dir fonttools==4.60.2 brotli==1.2.0 && /opt/fonttools/bin/python engine/tools/fontprint.py
# PPT 로 받기(화면 그대로) — 페이지 그림을 .pptx 로 묶는다(server/pptx_build.py · python-pptx). 글자 편집 가능 PPT 는 위의 LibreOffice 가 PDF 를 바꾼다
RUN python3 -m venv /opt/pptx && /opt/pptx/bin/pip install --no-cache-dir python-pptx==1.0.2
COPY web ./web
# 공시 검색(rag/server.mjs · mcp.mjs · lib) — 데이터 · 모델은 이미지가 아니라 /data/rag(볼륨)에
COPY rag/server.mjs rag/mcp.mjs ./rag/
COPY rag/lib ./rag/lib

ENV PPT_PORT=8900 PPT_DATA_DIR=/data DISABLE_AUTOUPDATER=1 PYTHONUNBUFFERED=1 DECK_LITE_BIN=/opt/litellm/bin/litellm ALT_LLM_HOST=0.0.0.0
EXPOSE 8900
VOLUME /data
CMD ["python3", "server/app.py"]
