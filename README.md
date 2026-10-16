# DART Deck

누구에게 무엇을 알려 줄지 알려 주면, **Claude Code 가 한국 발표 자료 규칙에 맞춰 발표 자료를 만들고**, 이후 AI 에게 부탁하거나 직접(✎ 편집) 고치는 웹 서비스.

- 계정(아이디 · 비밀번호)마다 발표 자료 저장, 관리자는 전부 열람
- 새 발표 자료: 간단 설문 또는 내용 통째로 붙여넣기 + 그림 → 열자마자 Claude Code 가 작성
- AI 패널: 한 페이지 수정은 바로, 여러 페이지 · 새 페이지는 계획 → [진행]. 고친 뒤 화면을 찍어 스스로 확인하고, 사람이 [적용]
- ✎ 편집: 끌어 옮기기 · 크기 · 글꼴 · 도형 · 그림, 페이지 추가 · 복제 · 삭제, 되돌리기
- Claude 는 **쓰는 사람의 Claude 구독**(Pro · Max)으로 돈다 — 계정 설정에서 한 번 연결

## 실행

```sh
npm install && npx playwright install chromium
npm i -g @anthropic-ai/claude-code
python3 server/app.py      # http://<이 컴퓨터>:8900 — 처음 계정 admin / admin
```

## 배포 (개인 NAS)

```sh
docker build -t dart-deck:latest . && docker compose up -d   # 데이터는 ./data (계정 · 세션 · 덱 — 커밋 금지)
```

환경 변수: `PPT_PORT`(8900) · `PPT_DATA_DIR`(./data, 이미지에서는 /data) · `DECK_ASK_URL` · `DECK_LLM_BASE`(로컬 LLM — 선택, 비우면 Claude 개인 구독만)
