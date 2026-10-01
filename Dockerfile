# AI PPT 이미지 — 파이썬 서버(server/app.py) + 캡처용 크롬(playwright) + Claude Code CLI
# playwright 공식 이미지(node · 크롬 · 한글 글꼴 의존성 포함)를 바탕으로 한다 — 버전은 package.json 의 playwright 와 같아야 한다
FROM mcr.microsoft.com/playwright:v1.59.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-noto-cjk poppler-utils libreoffice-impress python3-uno fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea && rm -rf /var/lib/apt/lists/*
# poppler-utils = PDF 글 · 쪽 그림, libreoffice-impress = 기존 PPT 가져오기(pptx → PDF, server/importer.py)
# LiteLLM — AI 패널의 gemma 엔진: Claude Code 도구 틀을 로컬 gemma-4-26b 로 돌리는 번역 서버(server/litellm.yaml, deckagent 가 필요할 때 띄운다)
RUN python3 -m venv /opt/litellm && /opt/litellm/bin/pip install --no-cache-dir 'litellm[proxy]==1.103.0'
# Claude Code — 쓰는 사람의 구독 토큰으로 덱을 만들고 고친다(server/deckagent.py)
RUN npm install -g @anthropic-ai/claude-code && claude --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server ./server
# 기존 PPT 가져오기 — 서버에 없는 윈도 글꼴(맑은 고딕 · Arial …)을 비슷한 글꼴로(없으면 중국어 글꼴로 바뀌어 줄이 겹쳤다)
RUN cp server/fonts-ko.conf /etc/fonts/local.conf && fc-cache -f >/dev/null
COPY engine ./engine
# PDF 로 받기 — 가변 글꼴을 굵기별 고정 글꼴로(engine/tools/fontprint.py · fonttools). 크롬이 가변 글꼴을 PDF 에 Type 3 로 넣어 커지고 흐려서
RUN python3 -m venv /opt/fonttools && /opt/fonttools/bin/pip install --no-cache-dir fonttools==4.60.2 brotli==1.2.0 && /opt/fonttools/bin/python engine/tools/fontprint.py
COPY web ./web

ENV PPT_PORT=8900 PPT_DATA_DIR=/data DISABLE_AUTOUPDATER=1 PYTHONUNBUFFERED=1 DECK_LITE_BIN=/opt/litellm/bin/litellm
EXPOSE 8900
VOLUME /data
CMD ["python3", "server/app.py"]
