# 웹 글꼴을 덱 폴더(fonts/)에 받아 두는 도구 — 덱이 Google Fonts 를 거치지 않게(2026-09-29).
# 왜: 덱이 Google 글꼴 CSS 를 받을 때까지 첫 화면을 안 그렸다. Google 이 5초 늦으면 첫 화면 5.8초, 응답이 없으면 20초(실측) —
#   느린 망의 Windows PC 에서 "처음 로딩이 엄청 오래"의 원인. 여기 두면 첫 화면이 곧바로 뜨고, Google 이 막혀도 Windows · Mac 이 같은 글꼴로 그린다.
# 한글 글꼴은 Google 처럼 글자 범위(unicode-range)별 조각으로 둔다 — 파일은 많지만(굵기 5개에 수백 개) 브라우저는 화면에 나온 글자가 든 조각만 받는다
# (첫 화면 기준 19개 · 약 200KB).
# 쓰는 법:
#   python3 engine/tools/fontcache.py base                 # 덱 기본 글꼴 → fonts/base.css
#   python3 engine/tools/fontcache.py "Noto Serif KR" 400;700;900   # 글꼴 하나 → fonts/<이름>.css (✎ 편집이 저장할 때 serve.py 가 부른다)
import os, re, sys, hashlib, urllib.request, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__)); FONTS = os.path.join(os.path.dirname(HERE), 'fonts')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'   # woff2 + unicode-range 를 받는 브라우저로
BASE = [('Noto Sans KR', '400;500;700;800;900'), ('JetBrains Mono', '400;500;700'), ('Noto Sans Symbols 2', None), ('Noto Sans Symbols', None)]

def slug(family): return re.sub(r'[^a-z0-9]+', '-', family.lower()).strip('-')

def fetch(families, css_name):
    """families = [(이름, '400;700' | None)] → fonts/<css_name>.css 와 fonts/<글꼴>/<해시>.woff2. 받은 파일 수 · 바이트를 돌려준다"""
    q = '&'.join(f"family={f.replace(' ', '+')}" + (f':wght@{w}' if w else '') for f, w in families)
    css = urllib.request.urlopen(urllib.request.Request(f'https://fonts.googleapis.com/css2?{q}&display=swap', headers={'User-Agent': UA}), timeout=60).read().decode('utf-8')
    jobs = []
    def local(m):
        url = m.group(1); fam = re.search(r"font-family: '([^']+)'", css[:m.start()][::-1][::-1].rsplit('@font-face', 1)[-1])
        d = slug(fam.group(1)) if fam else 'misc'; name = hashlib.sha1(url.encode()).hexdigest()[:16] + '.woff2'
        jobs.append((url, os.path.join(FONTS, d, name))); return f'url({d}/{name})'
    out = re.sub(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', local, css)
    def get(j):
        url, path = j
        if os.path.exists(path): return os.path.getsize(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = urllib.request.urlopen(url, timeout=60).read(); open(path, 'wb').write(data); return len(data)
    with cf.ThreadPoolExecutor(24) as ex: sizes = list(ex.map(get, jobs))
    head = f"/* {css_name}.css — tools/fontcache.py 가 Google Fonts 에서 받아 둔 사본({', '.join(f for f, _ in families)}). 손으로 고치지 말고 다시 굽는다 */\n"
    open(os.path.join(FONTS, f'{css_name}.css'), 'w', encoding='utf-8').write(head + out)
    return len(jobs), sum(sizes)

MONO_MARK = '/* ── 코드 글꼴의 한글 — JetBrains Mono 에는 한글이 없어 코드 칸 한글이 컴퓨터 글꼴(맥 Apple SD Gothic · 윈도 맑은 고딕)로 달라졌다.'
# 한글 · 한자 · 가나 · 전각 기호 영역만 — 문장부호 · 화살표 · 빼기표(U+2000 대)는 JetBrains Mono 제 글자를 그대로 쓴다
KO_BLOCKS = [(0x1100, 0x11FF), (0x2E80, 0x9FFF), (0xA960, 0xA97F), (0xAC00, 0xD7FF), (0xF900, 0xFAFF), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF)]
def _clip(r):
    a, _, b = r[2:].partition('-'); a = int(a, 16); b = int(b, 16) if b else a
    out = [(max(a, x), min(b, y)) for x, y in KO_BLOCKS if max(a, x) <= min(b, y)]
    return ', '.join(f'U+{x:X}' if x == y else f'U+{x:X}-{y:X}' for x, y in out)

def mono_ko():
    """base.css 끝에 'JetBrains Mono' 이름으로 Noto Sans KR 의 한글 · 한자 조각을 덧붙인다(U+1100 이상만 — 영문 · 숫자는 JetBrains Mono 그대로).
    덱을 고치지 않고 코드 칸 한글이 어느 컴퓨터에서나 Noto Sans KR 로 같게 그려진다(2026-10-01). 다시 돌려도 한 번만 붙는다"""
    f = os.path.join(FONTS, 'base.css'); css = open(f, encoding='utf-8').read()
    if MONO_MARK in css: css = css[:css.index(MONO_MARK)].rstrip() + '\n'
    faces = re.findall(r"@font-face \{\s*font-family: 'Noto Sans KR';\s*font-style: normal;\s*font-weight: (\d+);.*?src: url\(([^)]+)\) format\('woff2'\);\s*unicode-range: ([^;]+);\s*\}", css, re.S)
    L = [MONO_MARK + ' 우리 한글 글꼴로 채운다(fontcache.py mono_ko) ── */']
    for w, url, rng in faces:
        if w not in ('400', '500', '700'): continue
        keep = [x for r in rng.split(',') for x in [_clip(r.strip())] if x]
        if keep: L.append(f"@font-face {{\n  font-family: 'JetBrains Mono';\n  font-style: normal;\n  font-weight: {w};\n  font-display: swap;\n  src: url({url}) format('woff2');\n  unicode-range: {', '.join(keep)};\n}}")
    open(f, 'w', encoding='utf-8').write(css + '\n'.join(L) + '\n'); return len(L) - 1

if __name__ == '__main__':
    if sys.argv[1:2] == ['monoko']: print('코드 글꼴 한글', mono_ko(), '개'); sys.exit(0)
    if sys.argv[1:2] == ['base']: n, b = fetch(BASE, 'base'); mono_ko()
    else: fam = sys.argv[1]; n, b = fetch([(fam, sys.argv[2] if len(sys.argv) > 2 else None)], slug(fam))
    print(f'{n}개 · {b / 1e6:.1f}MB → {FONTS}')
