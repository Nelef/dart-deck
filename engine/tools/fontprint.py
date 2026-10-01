# PDF 전용 글꼴 — 가변 글꼴(Noto Sans KR · JetBrains Mono)을 굵기마다 고정 글꼴로 뽑아 fonts/print/ 와 fonts/print/print.css 를 만든다.
# 쓰는 법: python3 engine/tools/fontprint.py        (fonttools · brotli 필요 — Docker 빌드가 돌린다. 결과는 git 에 넣지 않는다, 약 10MB)
# 왜: 크롬은 가변 글꼴을 PDF 에 Type 3(무겁고 보기 프로그램에서 흐림)로 넣는다 — 16쪽 덱에 글꼴만 1.2MB. 굵기별 고정 글꼴이면
#   TrueType 부분 글꼴로 들어가 PDF 가 절반 안팎(2.5 → 1.1MB, 6.6 → 3.4MB, 2026-10-01 실측). 글자 모양 · 폭은 화면의 가변 글꼴과 같다(같은 파일에서 굵기만 고정).
#   engine/tools/deck_pdf.cjs 가 PDF 를 만들 때만 이 CSS 를 덧붙인다 — 화면은 base.css(가변) 그대로
import os, re
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fonts')
OUT = os.path.join(FONTS, 'print')
FACE = re.compile(r"@font-face \{\s*font-family: '([^']+)';\s*font-style: normal;\s*font-weight: (\d+);.*?src: url\(([^)]+)\) format\('woff2'\);\s*unicode-range: ([^;]+);\s*\}", re.S)
VAR = ('Noto Sans KR', 'JetBrains Mono')

def main():
    os.makedirs(OUT, exist_ok=True); css = open(os.path.join(FONTS, 'base.css'), encoding='utf-8').read()
    L = ['/* fonts/print/print.css — engine/tools/fontprint.py 가 만든 PDF 전용 고정 글꼴(가변 → 굵기별). 손으로 고치지 않는다 */']
    n = 0
    for fam, w, url, rng in FACE.findall(css):
        if fam not in VAR: continue
        name = os.path.basename(url)[:-6]; rel = f'{name}-{w}.woff2'; dst = os.path.join(OUT, rel)
        if not os.path.exists(dst):
            f = TTFont(os.path.join(FONTS, url))
            if 'fvar' in f: f = instancer.instantiateVariableFont(f, {'wght': int(w)}, updateFontNames=False)
            f.flavor = 'woff2'; f.save(dst); n += 1
        L.append(f"@font-face {{ font-family: '{fam}'; font-style: normal; font-weight: {w}; font-display: block; src: url({rel}) format('woff2'); unicode-range: {rng}; }}")
    open(os.path.join(OUT, 'print.css'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'print.css {len(L) - 1}개 · 새로 뽑은 파일 {n}개')

if __name__ == '__main__': main()
