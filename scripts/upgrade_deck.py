# 옛 덱을 지금 엔진 스크립트와 맞춘다 — ✎ 편집 · AI 고치기 · 페이지 목록(사용자 지정 2026-09-30 "모든 덱이 현재 스크립트와 호환되게").
# 이전 프로토타입 deck 에서 옮긴 덱은 AI 패널 · 편집이 생기기 전에 만든 것이라 deckedit 를 안 불러오거나(파이프라인 덱),
# deckkit 조차 없다(v2 한눈에 — 자막 · 자동 재생 덱). 여러 번 돌려도 같은 결과(이미 된 것은 건너뛴다).
# 쓰는 법: python3 scripts/upgrade_deck.py <덱 index.html>...   → 바뀐 것 목록을 찍고 제자리에 쓴다(원본은 .edits/ 에 백업)
import os, re, sys, time

TAGS = ['deckcheck.js', 'deckkit.js', 'deckedit.js', 'deckedit-ribbon.js']
HOME_CSS = "#bar #home { display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 15px; }"
EDIT_INIT = 'DeckEdit.init({ current: () => deck.slides[deck.cur], deck: () => deck }); '

def upgrade(html):
    done = []
    # 1) 엔진 스크립트 — deckviz.js 뒤에 없는 것만 순서대로
    have = set(re.findall(r'<script src="js/([^"]+)"', html))
    miss = [t for t in TAGS if t not in have]
    if miss:
        m = re.search(r'<script src="js/deckviz\.js"></script>\n?', html) or re.search(r'<script src="js/deck\.js"></script>\n?', html)
        if not m: raise ValueError('js/deck.js 를 불러오지 않는 덱 — 덱 엔진 덱이 아니다')
        html = html[:m.end()] + ''.join(f'<script src="js/{t}"></script>\n' for t in miss) + html[m.end():]; done.append('스크립트 ' + ' · '.join(miss))
    # 2) AI 패널 · 편집 켜기
    if 'DeckKit.init(' in html:
        if not re.search(r'DeckKit\.init\(\{[^}]*?editable:\s*true', html, re.S):
            html = html.replace('DeckKit.init({', 'DeckKit.init({ editable: true,', 1); done.append('AI 고치기(editable)')
        if 'DeckEdit.init(' not in html:
            html = re.sub(r'(\n?[ \t]*)DeckKit\.init\(\{', lambda m: f'{m.group(1)}{EDIT_INIT}DeckKit.init({{', html, count=1); done.append('✎ 편집')
    else:
        # deckkit 을 안 쓰던 덱 — Deck.create 에 onReady 를 붙여 편집 · AI 패널을 연다(코드 경로 없이 덱 전체를 문맥으로)
        m = re.search(r'const deck = Deck\.create\(\{', html)
        if not m: raise ValueError('const deck = Deck.create({ 를 찾지 못했다')
        if 'onReady' in html[m.end():m.end() + 3000]: raise ValueError('onReady 가 이미 있는데 DeckKit 이 없다 — 손으로 봐야 한다')
        title = (re.search(r'<title>([^<]*)', html) or [None, '덱'])[1]
        ready = ("\n  // ✎ 편집 · AI 패널(scripts/upgrade_deck.py 가 붙임) — 자막 덱이라 코드 경로 없이 덱 전체를 문맥으로\n"
                 f"  onReady: () => {{ {EDIT_INIT}DeckKit.init({{ deck: document.title, codemap: null, noCode: true, wholeDeck: true, editable: true,\n"
                 "    current: () => deck.slides[deck.cur], goto: (i) => deck.show(i, 0), stageOf: () => null, contextOf: () => '', suggest: () => [],\n"
                 f"    intro: '{title} — 처음 보는 사람이 따라오게 만든 설명 덱(자막 · 자동 재생). 답은 쉬운 한국어로 짧게, 덱에 있는 내용만 근거로.' }}); }},")
        html = html[:m.end()] + ready + html[m.end():]; done.append('AI 패널 · ✎ 편집(onReady)')
    # 3) 페이지 목록(#toc) — 자막 덱(v2 한눈에)은 조작줄에 목록 자리가 없어 아래에 페이지 이름이 안 보였다(사용자 지적 2026-09-30).
    #    다음(→) 단추 뒤에 넣고, 남는 폭을 먹던 쪽수 칸(.sp, flex:1)은 목록에 폭을 넘긴다
    if 'id="toc"' not in html and 'id="bar"' in html:
        html2 = re.sub(r'(<button class="nb" id="nx">[^<]*</button>)', r'\1<div id="toc"></div>', html, count=1)
        if html2 != html:
            html = re.sub(r'<span class="sp" id="cnt">', '<span id="cnt">', html2, count=1); done.append('페이지 목록')
    # 4) 조작줄의 글 링크(「자세한 원리 덱」 등) — 폰에서 한 글자씩 세로로 꺾이며 ✎ 편집을 화면 밖으로 밀었다(실측 390px). 한 줄로 · 좁으면 숨긴다
    bar = re.search(r'<div id="bar">.*', html)   # 조작줄은 한 줄 — 안에 #toc 의 </div> 가 있어 '</div> 까지'로 자르면 링크를 놓친다
    if bar and re.search(r'<a (?![^>]*class="nb")', bar.group(0)) and 'upgrade:barlink' not in html:
        html = html.replace('</style>', '/* upgrade:barlink */ #bar a:not(.nb) { white-space: nowrap; } @media (max-width: 640px) { #bar a:not(.nb) { display: none; } }\n</style>', 1); done.append('조작줄 링크 폰 정리')
    # (☰ 목록 단추는 이제 넣지 않는다 — 엔진(deck.js)이 왼쪽 위에 AI PPT 로고를 붙이고 조작줄 ☰ 는 숨긴다, 2026-09-30)
    return html, done

if __name__ == '__main__':
    for f in sys.argv[1:]:
        src = open(f, encoding='utf-8').read()
        new, done = upgrade(src)
        if not done: print(f'{f}: 이미 맞음'); continue
        bd = os.path.join(os.path.dirname(f), '.edits'); os.makedirs(bd, exist_ok=True)
        open(os.path.join(bd, f"index.{time.strftime('%Y%m%d-%H%M%S')}.bak"), 'w', encoding='utf-8').write(src)   # 편집의 [되돌리기]가 이 백업으로 돌린다
        open(f, 'w', encoding='utf-8').write(new)
        print(f'{f}: ' + ' / '.join(done))
