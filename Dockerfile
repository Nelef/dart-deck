# AI PPT 이미지 — 파이썬 서버(server/app.py) + 캡처용 크롬(playwright) + Claude Code CLI
# playwright 공식 이미지(node · 크롬 · 한글 글꼴 의존성 포함)를 바탕으로 한다 — 버전은 package.json 의 playwright 와 같아야 한다
FROM mcr.microsoft.com/playwright:v1.59.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-noto-cjk poppler-utils && rm -rf /var/lib/apt/lists/*
# LiteLLM — AI 패널의 gemma 엔진: Claude Code 도구 틀을 로컬 gemma-4-26b 로 돌리는 번역 서버(server/litellm.yaml, deckagent 가 필요할 때 띄운다)
RUN python3 -m venv /opt/litellm && /opt/litellm/bin/pip install --no-cache-dir 'litellm[proxy]==1.103.0'
# Claude Code — 쓰는 사람의 구독 토큰으로 덱을 만들고 고친다(server/deckagent.py)
RUN npm install -g @anthropic-ai/claude-code && claude --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server ./server
COPY engine ./engine
COPY web ./web

ENV PPT_PORT=8900 PPT_DATA_DIR=/data DISABLE_AUTOUPDATER=1 PYTHONUNBUFFERED=1 DECK_LITE_BIN=/opt/litellm/bin/litellm
EXPOSE 8900
VOLUME /data
CMD ["python3", "server/app.py"]
