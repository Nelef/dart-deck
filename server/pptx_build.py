# 페이지 그림(JPEG)들 → .pptx(사용자 지정 2026-10-07 "ppt 로 변환") — python-pptx. 쓰는 법: python pptx_build.py <폴더(pages.json + p001.jpg …)> <나갈 .pptx> <제목>
# 한 페이지 = 슬라이드 한 장(16:9, 13.33×7.5in)에 그림을 꽉 채워 넣는다. 화면과 같은 모양이 먼저라 글은 그림 안에 있다(수정 불가).
# 다만 글은 잃지 않게 — 발표자 메모에 「페이지 이름 + 그 페이지 글」을 넣고, 슬라이드 이름도 페이지 이름으로 둔다(PowerPoint 개요 · 검색 · 접근성)
import sys, os, json
from pptx import Presentation
from pptx.util import Inches, Emu

folder, out, title = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
pages = json.load(open(os.path.join(folder, 'pages.json'), encoding='utf-8'))
prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
prs.core_properties.title = title[:200]; prs.core_properties.author = 'DART Deck'; prs.core_properties.comments = '화면 그대로 한 장씩 그림으로 넣은 발표 자료'
blank = prs.slide_layouts[6]
for i, pg in enumerate(pages, 1):
    s = prs.slides.add_slide(blank)
    pic = s.shapes.add_picture(os.path.join(folder, pg['img']), 0, 0, width=prs.slide_width, height=prs.slide_height)
    pic.name = f"{pg['name']} — 화면"; pic._element.nvPicPr.cNvPr.set('descr', (pg.get('text') or pg['name'])[:250])   # 대체 텍스트 = 페이지 글
    s.name = pg['name'][:60]
    s.notes_slide.notes_text_frame.text = f"{pg['name']}\n\n{pg.get('text') or ''}".strip()
prs.save(out)
print(json.dumps({'pages': len(pages), 'bytes': os.path.getsize(out)}))
