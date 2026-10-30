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


## Fashion Lab — /fashion/

2026-10-31 추가. 기존 uyai 첫 화면에서 들어가는 패션 이미지 쇼룸이다. awwwards 스킬의 Warm Editorial 방향으로 구현했다. 공개 페이지는 실제 로컬 생성 결과를 선택하고 비교하는 체험이며, 새 추론을 서버에서 실행하는 기능은 포함하지 않는다.

- `web/fashion/`: HTML·CSS·JS, 비교 슬라이더, 색상/소재 선택, 착장·공개 LoRA 비교, 확대 dialog, 이미지 저장, 실제 프롬프트·실패 사례·실행 조건.
- `server/app.py`: `/fashion` → `/fashion/` 리다이렉트와 HTML 진입만 추가. 정적 파일은 기존 `/web/` 처리 사용.
- `web/portal.html`, `web/fashion/portal.css`: 기존 첫 화면과 메뉴에 Fashion Lab 연결.
- `scripts/build_fashion_assets.py`: 별도 로컬 실험 저장소의 실제 샘플과 manifest를 검증하고, 픽셀이 같은 lossless WebP와 공개용 기록만 만든다. 모델·로그·실행 경로는 배포하지 않는다.
- 디자인 방향 `docs/fashion-design.md`, 브라우저 확인 결과 `docs/fashion-verification.json`.

이미지는 이미 저장돼 있어 NAS에서 GPU·추가 Python 패키지 없이 표시된다. 원본을 갱신할 때만 Pillow가 있는 Python으로 `scripts/build_fashion_assets.py --source <fashion-lab 폴더>`를 실행한다. `catalog.json`의 파일 경로·프롬프트는 이 변환 스크립트가 만든 제한된 공개 정보다.

로컬 확인(격리된 데이터):

```bash
PPT_HOST=127.0.0.1 PPT_PORT=18913 PPT_DATA_DIR=/private/tmp/uyai-fashion-preview python3 server/app.py
# http://127.0.0.1:18913/fashion/
```

배포는 기존 `./deploy.sh`를 사용한다. HEAD의 git archive로 배포하므로 수정 파일을 커밋한 뒤 실행한다.

이번처럼 `web/`와 `server/app.py`의 경로 처리만 바꾸고 의존성·engine·다른 서버 모듈을 바꾸지 않았다면 `./deploy.sh --web-only`로 배포할 수 있다. `Dockerfile.web`은 NAS의 현재 `uyai:latest` 실행 환경에 두 경로만 복사하므로 PDF 글꼴을 다시 생성하지 않는다. 의존성이나 engine을 바꾸면 기본 전체 빌드를 사용한다. 두 방식 모두 빌드 성공 후 교체하며 이전 이미지는 `uyai:prev`로 남긴다.
