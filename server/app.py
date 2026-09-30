# AI PPT 서버(:8900, 0.0.0.0) — 계정마다 발표 자료(덱)를 저장하고, 관리자는 전부 본다. 사용자 지정 2026-09-30:
#   "새 포트로 계정별 PPT 저장 · 관리자는 전부 · 처음 만들 때 '어떤 사람에게 어떤 정보를?' 설문 또는 내용 붙여넣기 → Claude Code 가 엔진 규칙으로 만든다 · Claude Code 만"
# 뼈대는 이전 프로토타입 research/serve.py(덱 고치기 · 캡처 · AI 패널)를 옮긴 것이고, 여기서 더한 것은 계정 · 세션 · 덱 목록 · 권한 검사다.
#   주소: /            → web/index.html(로그인 · 목록 · 새 덱 · 계정 · 사용자 관리)
#         /d/<계정>/<덱>/ → 덱(data/decks/<계정>/<덱>/index.html). js/ css/ tools/ DECK.md 는 engine/ 에서, fonts/ 는 data/fonts → engine/fonts 순으로
#   권한: 덱 주인 또는 관리자만. 캡처 도구(서버 안에서 도는 크롬)는 이 컴퓨터에서 온 요청 + 서버가 켤 때 만든 캡처 키(x-shot-key)로 들어온다 —
#         localhost 라는 것만으로 열어 주면 같은 컴퓨터의 역방향 프록시를 거친 모든 요청이 로그인 없이 통과한다
#   Claude 구독 토큰은 계정에 묶어 서버에만 둔다(store.py) — 화면 · 응답 · 로그로 내보내지 않는다(로그에는 길이만)
import os, re, sys, json, glob, uuid, time, base64, hashlib, secrets, datetime, subprocess, shutil, socketserver, http.server, urllib.request, urllib.parse, mimetypes, html as htmlmod
import importlib.util as _ilu

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
ENGINE = os.path.join(ROOT, 'engine'); WEB = os.path.join(ROOT, 'web')
DATA_DIR = os.path.abspath(os.environ.get('PPT_DATA_DIR', os.path.join(ROOT, 'data')))
DECKS = os.path.join(DATA_DIR, 'decks'); FONT_DIR = os.path.join(DATA_DIR, 'fonts'); TMP_DIR = os.path.join(DATA_DIR, '.tmp')
PORT = int(os.environ.get('PPT_PORT', '8900'))
NODE_PATH = os.path.join(ROOT, 'node_modules')
# 캡처 키 — 캡처 도구(deck_shot.cjs)가 x-shot-key 머리글로 보낸다. 자식 프로세스(Claude Code → deck_shot)가 물려받게 환경에 둔다
SHOT_KEY = secrets.token_hex(16); os.environ['DECK_SHOT_KEY'] = SHOT_KEY
os.environ['NODE_PATH'] = NODE_PATH
os.environ.setdefault('PPT_DATA_DIR', DATA_DIR)
import store as storemod, deckagent
STORE = storemod.Store(DATA_DIR)
COOKIE = 'ppt_sid'

_fc_spec = _ilu.spec_from_file_location('fontcache', os.path.join(ENGINE, 'tools', 'fontcache.py')); FONTCACHE = _ilu.module_from_spec(_fc_spec); _fc_spec.loader.exec_module(FONTCACHE)
FONTCACHE.FONTS = FONT_DIR   # 편집에서 새로 받은 글꼴은 data/ 에(엔진 폴더는 배포 이미지 안이라 다시 배포하면 사라진다)

ASK_URL = os.environ.get('DECK_ASK_URL', 'http://gpu-server:8002/v1/chat/completions')
ASK_MODEL = os.environ.get('DECK_ASK_MODEL', 'gemma-4-26b')
ASK_MAX_BODY = 200_000      # 덱이 싣는 문맥(코드 발췌 + 실행 기록) 최대치 — 한 장 분량은 40KB 안팎
ASK_MAX_REQ = 3_000_000     # 요청 본문 상한 — 자가검증은 캡처 그림(JPEG base64 약 150KB)을 싣는다
ASK_MAX_IMAGES = 2
ASK_MAX_TOKENS = 6000       # 장을 통째로 새로 쓰는 고치기 답(마크업+스크립트 수천 자)이 잘리지 않게 — 보통 답은 이보다 훨씬 짧다
ASK_MAX_TURNS = 8           # 이어 묻기로 싣는 앞 턴(질문+답) 수 — 오래된 것부터 버린다
ASK_TURN_CHARS = 6000       # 앞 턴 하나당 글자 상한(긴 답 여러 개가 문맥을 다 먹지 않게)
ASK_SYSTEM = (
    '너는 슬라이드 덱을 설명하는 조수다. 아래 [문맥]에 있는 것 — 덱의 장 내용(지금 장, 또는 덱이 보내면 덱 전체), 실제 기록, '
    '코드 발췌(파일:줄과 주석 원문) — 만 근거로 한국어로 답한다. 코드 이야기를 할 때는 근거가 된 `파일:줄` 을 괄호로 붙인다. '
    '[문맥]에 없는 것은 추측하지 말고 "덱의 기록·코드 발췌에는 없습니다"라고 말한다. [문맥]의 "답하는 방식"이 있으면 그대로 따른다. 처음 보는 사람도 이해하게 쉬운 말로, '
    '짧은 단락과 목록으로 답한다. 수치는 문맥에 있는 값만 쓴다. '
    '앞선 대화가 있으면 이어서 답하고, "그거"·"방금" 같은 말은 앞선 대화를 보고 해석한다.'
)

EDIT_MAX = 20                # 한 번에 바꾸는 곳 상한 — "간단한 수정"용이다
SMALL_MAX = 800              # 2026-09-30 600→800: 이 덱은 표 한 줄을 만드는 템플릿 줄이 500자 가까이 된다(한 줄 수정이 막혔다, bench/ui_run E2) · 작은 수정(찾기/바꾸기)의 찾기 상한. 레이아웃을 크게 바꾸는 건 아래 통째 바꾸기로 **지금 장만**(2026-09-29 사용자 지정)

def slide_parts(text, name):
    # 덱의 장 한 개 = <section data-name="이름"> … </section> + 그 장을 그리는 INIT['이름'] = … }; — 덱 AI 패널(deckkit)과 같은 규칙으로 자른다
    q = re.escape(name)
    sec = re.search(r'<section[^>]*data-name="' + q + r'"[\s\S]*?</section>', text)
    # 한 줄짜리(굳혀 비운) INIT 먼저 — '줄바꿈 뒤 };'까지 자르면 다음 장 INIT 까지 삼켜 다른 장이 바뀐 것으로 보였다(2026-09-30 정답률 ↔ 서식별 차이)
    ini = re.search(r"^INIT\['" + q + r"'\] = [^\n]*\};[ \t]*$", text, re.M) or re.search(r"INIT\['" + q + r"'\] = [\s\S]*?\n};", text)
    return (sec.group(0) if sec else None), (ini.group(0) if ini else None)

# ── 덱 경로 — 덱이 보내는 file 은 location.pathname(/d/<계정>/<덱>/ 또는 …/index.html) ──
DECK_RE = re.compile(r'^/d/([a-z0-9][a-z0-9_.-]{1,31})/(\d{8}-[0-9a-f]{6})(/.*)?$')
ENGINE_TOP = ('js', 'css', 'tools', 'DECK.md')   # 덱 폴더 안에 없고 engine/ 에서 주는 것
def deck_of(url_path):
    """/d/o/d/… → (계정, 덱, 나머지 경로) — 꼴이 아니면 None"""
    m = DECK_RE.match(urllib.parse.unquote(str(url_path or '').split('?')[0]))
    return (m.group(1), m.group(2), (m.group(3) or '/').lstrip('/')) if m else None

def edit_target(rel):
    """덱 주소 → 그 덱의 index.html 절대 경로. 덱 index.html 만 고칠 수 있다(사본 · 그림 · 다른 파일 금지)"""
    d = deck_of(rel)
    if not d or d[2] not in ('', 'index.html'): raise ValueError('고칠 수 있는 덱 주소가 아닙니다')
    p = os.path.join(STORE.deck_dir(d[0], d[1]), 'index.html')
    if not os.path.isfile(p): raise ValueError('없는 덱입니다')
    return p

def url_of(path):
    """덱 폴더 안 파일 경로 → 웹 주소(/d/<계정>/<덱>/…). 캡처 도구 · Claude Code 가 사본을 여는 주소"""
    rel = os.path.relpath(os.path.abspath(path), DECKS).replace(os.sep, '/')
    if rel.startswith('..'): raise ValueError('덱 폴더 밖')
    return '/d/' + rel + ('/' if path.endswith(os.sep) else '')

def backup_name(path):
    # 백업은 덱 폴더 안 .edits/(숨김 — 웹으로는 안 보인다). 이름은 index.<시각>.bak
    return os.path.join(os.path.dirname(path), '.edits', 'index')

def link_engine(deck_dir):
    """덱 폴더에 engine/ 을 가리키는 링크(js · css · tools · DECK.md) — Claude Code 는 덱 폴더에서 돌며 js/deckviz.js 를 읽고
    `node tools/deck_shot.cjs` 를 부른다. 웹은 링크를 거치지 않고 engine/ 에서 바로 준다. 배포 위치가 바뀌어도 서버가 켤 때마다 다시 건다"""
    for n in ENGINE_TOP:
        l = os.path.join(deck_dir, n); t = os.path.join(ENGINE, n)
        try:
            if os.path.islink(l) and os.readlink(l) == t: continue
            if os.path.islink(l): os.remove(l)
            if not os.path.exists(l): os.symlink(t, l)
        except OSError as e: sys.stderr.write(f'링크 실패 {l}: {e}\n')

def apply_edits(req):
    path = edit_target(req.get('file'))
    text = open(path, encoding='utf-8').read()
    if hashlib.sha256(text.encode('utf-8')).hexdigest() != req.get('sha'):
        raise ValueError('미리 본 뒤 파일이 바뀌었습니다 — 다시 물어보세요')
    edits = req.get('edits') or []
    if not edits or len(edits) > EDIT_MAX:
        raise ValueError(f'바꿀 곳은 1~{EDIT_MAX}개')
    new = text
    slide = str(req.get('slide') or '')
    for i, e in enumerate(edits):
        f, r = str(e.get('find') or ''), str(e.get('replace') if e.get('replace') is not None else '')
        kind = e.get('kind') or 'small'
        if kind == 'delete-slide':
            # 페이지 삭제(✎ 편집 페이지 목록, 사용자 지정 2026-09-30) — 지우는 건 지금 페이지 <section> 통째만. 그 페이지 스크립트(INIT)는 남긴다
            # (덱 엔진이 없는 페이지의 INIT 은 건너뛴다 — 백업 없이도 되살릴 때 그리기 코드가 그대로 있게). 마지막 한 페이지는 못 지운다
            sec, _ = slide_parts(new, slide)
            if not slide or not sec or f != sec: raise ValueError(f'{i + 1}번째: 지울 페이지「{slide}」가 원본과 다릅니다')
            if len(re.findall(r'<section[^>]*class="[^"]*\bslide\b', new)) <= 1: raise ValueError('마지막 페이지는 지울 수 없습니다')
            new = re.sub(r'\n?[ \t]*' + re.escape(sec) + r'[ \t]*\n?', '\n', new, count=1)
            continue
        if kind in ('slide', 'script'):
            # 통째 바꾸기는 **지금 장**의 마크업 · 스크립트 그 자체일 때만 — 찾을 글이 원본에서 자른 그 장과 한 글자라도 다르면 거부
            sec, ini = slide_parts(new, slide)
            want = sec if kind == 'slide' else ini
            if not slide or not want or f != want:
                raise ValueError(f'{i + 1}번째: 지금 장「{slide}」의 {"마크업" if kind == "slide" else "스크립트"} 전체가 아닙니다')
            if kind == 'slide' and (not re.match(r'<section[^>]*data-name="' + re.escape(slide) + r'"[\s\S]*</section>$', r.strip()) or re.search(r'<script', r, re.I)):
                raise ValueError(f'{i + 1}번째: 새 마크업은 같은 이름의 <section> 하나여야 하고 <script> 를 넣을 수 없습니다')
            if kind == 'script' and not (r.strip().startswith(f"INIT['{slide}'] = ") and r.strip().endswith('};')):
                raise ValueError(f"{i + 1}번째: 새 스크립트는 INIT['{slide}'] = … }}; 꼴이어야 합니다")
        elif len(f) > SMALL_MAX:
            raise ValueError(f'{i + 1}번째 찾을 글이 {len(f)}자 — 작은 수정이 아닙니다(장을 크게 바꾸려면 지금 장 통째 바꾸기로)')
        n = new.count(f) if f else 0
        if n != 1:
            raise ValueError(f'{i + 1}번째 찾을 글이 파일에 {n}번 있습니다(정확히 1번이어야 바꿉니다)')
        new = new.replace(f, r, 1)
    os.makedirs(os.path.dirname(backup_name(path)), exist_ok=True)
    bak = f"{backup_name(path)}.{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.bak"
    open(bak, 'w', encoding='utf-8').write(text)
    open(path, 'w', encoding='utf-8').write(new)
    return {'ok': True, 'backup': os.path.basename(bak), 'changed': len(edits)}

def undo_edit(req):
    path = edit_target(req.get('file'))
    baks = sorted(glob.glob(backup_name(path) + '.*.bak'))
    if not baks:
        raise ValueError('되돌릴 백업이 없습니다')
    text = open(baks[-1], encoding='utf-8').read()
    open(path, 'w', encoding='utf-8').write(text)
    os.rename(baks[-1], baks[-1] + '.restored')   # 한 번 쓴 백업은 다음 되돌리기에서 빠지게(지우지는 않는다)
    return {'ok': True, 'restored': os.path.basename(baks[-1])}

SHOT_TOOL = os.path.join(ENGINE, 'tools', 'deck_shot.cjs')
NODE = shutil.which('node') or next((p for p in ('/opt/homebrew/bin/node', '/usr/local/bin/node') if os.path.exists(p)), 'node')

def shot(req, port):
    path = edit_target(req.get('file'))
    html = str(req.get('html') or '')
    if not html or len(html) > 2_000_000: raise ValueError('html 이 없거나 너무 큽니다')
    tag = uuid.uuid4().hex[:10]
    tmp = os.path.join(os.path.dirname(path), f'.deckpreview-{tag}.html')
    img = os.path.join(TMP_DIR, f'shot-{tag}.jpg')
    os.makedirs(TMP_DIR, exist_ok=True)
    try:
        open(tmp, 'w', encoding='utf-8').write(html)
        url = f"http://127.0.0.1:{port}{url_of(tmp)}"
        # slides: [번호…] 면 여러 장을 한 번에(여러 장 고치기) — jpgs: {번호: 그림}
        many = [int(x) for x in (req.get('slides') or []) if str(x).isdigit()][:8]
        arg = ','.join(map(str, many)) if len(many) > 1 else str(int(req.get('slide') or (many[0] if many else 1)))
        r = subprocess.run([NODE, SHOT_TOOL, url, arg, img], capture_output=True, text=True, timeout=180, env={**os.environ, 'NODE_PATH': NODE_PATH})
        out = json.loads(r.stdout or '{}')
        if os.path.exists(img): out['jpg'] = 'data:image/jpeg;base64,' + base64.b64encode(open(img, 'rb').read()).decode()
        if out.get('shots'):
            out['jpgs'] = {}
            for n in out['shots']:
                f = img.replace('.jpg', f'-{n}.jpg')
                if os.path.exists(f): out['jpgs'][str(n)] = 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode(); os.remove(f)
            out['jpg'] = out['jpgs'].get(str(out['shots'][0]), '')
        return {'ok': True, **out}
    finally:
        for f in (tmp, img):
            try: os.remove(f)
            except OSError: pass

ASSET_EXT = {'.png': '.png', '.jpg': '.jpg', '.jpeg': '.jpg', '.gif': '.gif', '.webp': '.webp'}

def save_asset(req):
    deck = edit_target(req.get('file'))
    ext = ASSET_EXT.get(os.path.splitext(str(req.get('name') or ''))[1].lower())
    if not ext: raise ValueError('png · jpg · gif · webp 만 넣을 수 있습니다')
    raw = base64.b64decode(str(req.get('data') or ''), validate=True)
    if not raw or len(raw) > 8_000_000: raise ValueError('그림이 비었거나 8MB 를 넘습니다')
    d = os.path.join(os.path.dirname(deck), 'img', 'uploads'); os.makedirs(d, exist_ok=True)
    name = hashlib.sha1(raw).hexdigest()[:16] + ext
    open(os.path.join(d, name), 'wb').write(raw)
    return {'ok': True, 'src': f'img/uploads/{name}'}

FONT_OK = {'Noto Serif KR': '400;700;900', 'Nanum Gothic': '400;700;800', 'Nanum Myeongjo': '400;700;800', 'Nanum Pen Script': None, 'Gowun Dodum': None,
           'Gowun Batang': '400;700', 'IBM Plex Sans KR': '400;500;700', 'Gothic A1': '400;700;900', 'Hahmlet': '400;700;900', 'Black Han Sans': None,
           'Do Hyeon': None, 'Jua': None, 'Sunflower': '300;500;700'}

def cache_font(req):
    fam = str(req.get('family') or '')
    if fam not in FONT_OK: raise ValueError('받을 수 없는 글꼴')
    os.makedirs(FONT_DIR, exist_ok=True)
    n, b = FONTCACHE.fetch([(fam, FONT_OK[fam])], FONTCACHE.slug(fam))
    return {'ok': True, 'css': f'fonts/{FONTCACHE.slug(fam)}.css', 'files': n, 'bytes': b}

def build_messages(req):
    # 앞 턴(질문·답)을 그대로 싣고, 이번 질문에만 [문맥]을 붙인다
    q = str(req.get('question') or '').strip()[:2000]
    ctx = str(req.get('context') or '')[:ASK_MAX_BODY]
    msgs = [{'role': 'system', 'content': ASK_SYSTEM}]
    hist = [m for m in (req.get('history') or []) if isinstance(m, dict) and m.get('role') in ('user', 'assistant') and str(m.get('content') or '').strip()]
    for m in hist[-ASK_MAX_TURNS * 2:]:
        msgs.append({'role': m['role'], 'content': str(m['content'])[:ASK_TURN_CHARS]})
    text = f'[문맥]\n{ctx}\n\n[질문]\n{q}'
    imgs = [u for u in (req.get('images') or []) if isinstance(u, str) and u.startswith('data:image/')][:ASK_MAX_IMAGES]
    # 그림이 있으면 OpenAI 식 여러 조각 내용 — gemma-4-26b(vLLM)는 그림을 읽는다
    msgs.append({'role': 'user', 'content': [{'type': 'text', 'text': text}] + [{'type': 'image_url', 'image_url': {'url': u}} for u in imgs] if imgs else text})
    return q, msgs

# ── 새 덱 ──
BRIEF_KEYS = ('audience', 'info', 'key', 'pages', 'tone', 'material', 'text')
def new_deck(user, req):
    """제목 + 받은 정보(설문 또는 통째 붙여넣기) + 그림 → 표지 한 페이지짜리 덱과 brief.json. 만들기는 덱을 연 뒤 Claude Code 가(?new=1)"""
    if not STORE.claude_token(user['id']): raise ValueError('새 발표 자료는 Claude Code 가 만듭니다 — 먼저 계정 설정에서 Claude 구독을 연결해 주세요')
    title = re.sub(r'\s+', ' ', str(req.get('title') or '')).strip()[:80]
    if not title: raise ValueError('제목을 적어 주세요')
    b = req.get('brief') or {}
    brief = {'mode': 'paste' if b.get('mode') == 'paste' else 'survey', **{k: str(b.get(k) or '')[:40_000 if k in ('text', 'material') else 2000] for k in BRIEF_KEYS}}
    if not any(brief[k].strip() for k in BRIEF_KEYS): raise ValueError('어떤 사람에게 어떤 정보를 줄지 한 가지 이상 적어 주세요')
    tpl = open(os.path.join(ENGINE, 'template.html'), encoding='utf-8').read()
    did, d = STORE.create_deck(user['id'], title, tpl.replace('{{TITLE}}', htmlmod.escape(title)).replace('{{SUB}}', htmlmod.escape(brief['key'][:120] or brief['audience'][:120])))
    link_engine(d)
    files = []
    for f in (req.get('files') or [])[:6]:
        try: files.append(save_asset({'file': f'/d/{user["id"]}/{did}/', 'name': f.get('name'), 'data': f.get('data')})['src'])
        except Exception as e: sys.stderr.write(f'새 덱 그림 실패: {e}\n')
    brief.update({'title': title, 'files': files, 'at': int(time.time()), 'by': user['id']})
    STORE._save(os.path.join(d, 'brief.json'), brief)
    return {'ok': True, 'id': did, 'url': f'/d/{user["id"]}/{did}/?new=1'}

def build_prompt(deck_dir):
    """brief.json → Claude Code 에게 줄 '처음 만들기' 부탁. 지시문(deckagent.system_prompt)이 DECK.md 2~7장 규칙을 늘 싣는다 —
    여기서는 받은 정보와 만드는 순서만. 숫자 · 사실을 지어내지 않게 '자료에 없는 것은 자리표시'를 못 박는다(덱 규칙: 숫자는 기록에서)"""
    b = json.load(open(os.path.join(deck_dir, 'brief.json'), encoding='utf-8'))
    L = [f'새 발표 자료 「{b.get("title")}」를 처음부터 만든다. 지금 파일에는 표지 한 페이지만 있다.',
         '먼저 DECK.md 전체(1장 엔진 사용법 포함)와 js/deckviz.js 의 Viz.* 인자 모양을 Read 로 읽고, 그 엔진 · 규칙대로 만든다.', '', '[받은 정보]']
    NM = {'audience': '누가 보나', 'info': '무엇을 알려 주나', 'key': '꼭 남길 한 줄', 'pages': '분량', 'tone': '형식 · 분위기', 'material': '자료 · 숫자'}
    for k, n in NM.items():
        if (b.get(k) or '').strip(): L.append(f'- {n}: {b[k].strip()}')
    if (b.get('text') or '').strip(): L += ['- 사용자가 붙여 넣은 내용(이것이 재료다):', '"""', b['text'].strip(), '"""']
    if b.get('files'): L.append(f'- 첨부 그림: {", ".join(b["files"])} — Read 로 열어 보고, 내용이면 재료로 · 덱에 넣을 만하면 <img src="그 경로"> 로')
    L += ['', '[만드는 순서]',
          '1. 듣는 사람과 목적에 맞춰 흐름을 정한다: 표지 → 목차 → (부분마다 간지 → 본문 페이지) → 정리. 한 페이지에 메시지 하나. 분량을 말하지 않았으면 본문 6~10페이지.',
          '2. 페이지마다 명사형 제목 · 개조식 설명(2~4줄) · 그림(표 · 막대 · 순서도 · 비교 카드 등 인포그래픽)을 먼저 생각한다. 글만 있는 페이지는 피한다.',
          '3. 숫자 · 이름 · 사실은 받은 정보에 있는 것만 쓴다. 없는 숫자를 지어내지 않는다 — 꼭 필요하면 「(자료 필요)」 로 자리만 둔다.',
          '4. 표지의 제목 · 부제는 알맞게 다듬어도 된다. data-name 은 페이지 이름(짧게)으로.',
          '5. 다 만들면 모든 페이지를 한 번에 찍어(장 번호 쉼표 목록) errors · problems 와 그림을 보고 넘침 · 겹침 · 빈 곳을 고친다.',
          '마지막 답: 만든 페이지 목록(번호. 제목)과, 자료가 부족해 자리표시로 둔 곳.']
    return '\n'.join(L)

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    timeout = 30

    # ── 공용 ──
    def reply(self, code, obj, headers=()):
        payload = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(payload))); self.send_header('Cache-Control', 'no-store')
        for k, v in headers: self.send_header(k, v)
        self.end_headers(); self.wfile.write(payload)
    def body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > limit: raise ValueError('본문 크기')
        return json.loads(self.rfile.read(n).decode('utf-8'))
    def sid(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == COOKIE: return v
        return ''
    def me(self): return STORE.who(self.sid())
    def is_shot(self):
        # 서버 안의 캡처 도구 — 이 컴퓨터에서 + 캡처 키. 둘 다여야 한다
        return self.client_address[0] in ('127.0.0.1', '::1') and secrets.compare_digest(self.headers.get('x-shot-key') or '', SHOT_KEY)
    def can(self, user, owner): return bool(user) and (user['role'] == 'admin' or user['id'] == owner)
    def deck_access(self, user, file):
        d = deck_of(file)
        if not d or not self.can(user, d[0]): raise PermissionError('이 발표 자료를 고칠 권한이 없습니다')
        return d
    def send_file(self, path, head_only=False):
        try: st = os.stat(path)
        except OSError: return self.send_error(404)
        tag = f'"{int(st.st_mtime)}-{st.st_size}"'
        if self.headers.get('If-None-Match') == tag:
            self.send_response(304); self.send_header('ETag', tag); self.send_header('Content-Length', '0'); self.end_headers(); return
        t = 'font/woff2' if path.endswith('.woff2') else (mimetypes.guess_type(path)[0] or 'application/octet-stream')
        if t.startswith('text/') or t in ('application/javascript', 'application/json'): t += '; charset=utf-8'
        self.send_response(200)
        # 덱은 js · css 를 자주 고친다 — 늘 새로 확인(no-cache 는 '바뀌었나 묻기'라 안 바뀐 파일은 304 로 가볍다)
        self.send_header('Content-Type', t); self.send_header('Content-Length', str(st.st_size)); self.send_header('ETag', tag); self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        if not head_only:
            with open(path, 'rb') as f: shutil.copyfileobj(f, self.wfile)
    def log_error(self, fmt, *args):
        if 'timed out' in (fmt % args): return   # 쉬던 연결이 30초 뒤 닫히는 것 — 오류가 아니다
        self.log_message(fmt, *args)
    def log_message(self, fmt, *args):
        sys.stderr.write(f"{datetime.datetime.now().strftime('%H:%M:%S')} {self.client_address[0]} {fmt % args}\n"); sys.stderr.flush()

    # ── GET ──
    def do_HEAD(self): self.do_GET(head_only=True)
    def do_GET(self, head_only=False):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/me':
            u = self.me(); return self.reply(200, {'user': STORE.public(u) if u else None})
        if path == '/api/decks':
            u = self.me()
            if not u: return self.reply(401, {'error': '로그인이 필요합니다'})
            names = {x['id']: x.get('name') or x['id'] for x in STORE.users}
            ds = STORE.decks(None if u['role'] == 'admin' else u['id'])
            for x in ds: x['ownerName'] = names.get(x['owner'], x['owner'])
            return self.reply(200, {'decks': ds})
        if path == '/api/users':
            u = self.me()
            if not u or u['role'] != 'admin': return self.reply(403, {'error': '관리자만 볼 수 있습니다'})
            counts = {}
            for x in STORE.decks(): counts[x['owner']] = counts.get(x['owner'], 0) + 1
            return self.reply(200, {'users': [{**STORE.public(x), 'decks': counts.get(x['id'], 0)} for x in STORE.users]})
        if path in ('/', '/index.html'): return self.send_file(os.path.join(WEB, 'index.html'), head_only)
        if path.startswith('/web/'):
            p = os.path.realpath(os.path.join(WEB, path[5:]))
            if not p.startswith(WEB + os.sep): return self.send_error(404)
            return self.send_file(p, head_only)
        if path.startswith('/fonts/'):   # 목록 화면도 덱과 같은 글꼴(로그인 없이 — 글꼴 파일뿐)
            rest = path[7:]; base = FONT_DIR if os.path.exists(os.path.join(FONT_DIR, rest)) else os.path.join(ENGINE, 'fonts')
            p = os.path.realpath(os.path.join(base, rest))
            if not p.startswith(os.path.realpath(base) + os.sep): return self.send_error(404)
            return self.send_file(p, head_only)
        d = deck_of(path)
        if d:
            owner, did, rest = d
            if not self.is_shot():
                u = self.me()
                if not u:
                    self.send_response(302); self.send_header('Location', '/?next=' + urllib.parse.quote(self.path)); self.send_header('Content-Length', '0'); self.end_headers(); return
                if not self.can(u, owner): return self.send_error(403, 'no access')
                # 숨김 파일(고치는 중인 사본 · 미리보기 · 백업)은 캡처 도구만
                if any(seg.startswith('.') for seg in rest.split('/')): return self.send_error(404)
            if not path.endswith('/') and rest == '':
                self.send_response(301); self.send_header('Location', path + '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
            top = rest.split('/', 1)[0]
            if top in ENGINE_TOP: base = ENGINE
            elif top == 'fonts':
                base, rest = (FONT_DIR, rest[6:]) if os.path.exists(os.path.join(FONT_DIR, rest[6:])) else (ENGINE, rest)
            else: base = STORE.deck_dir(owner, did)
            p = os.path.realpath(os.path.join(base, rest or 'index.html'))
            if not (p.startswith(os.path.realpath(base) + os.sep)) or os.path.isdir(p): return self.send_error(404)
            if rest in ('meta.json',) : return self.send_error(404)
            return self.send_file(p, head_only)
        if path == '/favicon.ico': return self.send_error(404)
        return self.send_error(404)

    # ── POST ──
    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path == '/api/login':
                req = self.body(10_000); sid = STORE.login(req.get('id'), req.get('pw'))
                return self.reply(200, {'ok': True, 'user': STORE.public(STORE.who(sid))}, [('Set-Cookie', f'{COOKIE}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age={storemod.SESSION_SEC}')])
            if path == '/api/loadlog':
                try:
                    j = self.body(20_000); slow = ' · '.join(f"{x[0]} {x[2]}ms" for x in (j.get('slow') or [])[:12])
                    sys.stderr.write(f"{self.client_address[0]} 불러오기 {j.get('page')} {'완료' if j.get('ok') else '실패'} {j.get('total')}ms{(' · 느린 파일: ' + slow) if slow else ''}\n")
                except Exception: pass
                return self.reply(200, {'ok': True})
            u = self.me()
            if not u: return self.reply(401, {'error': '로그인이 필요합니다 — 새로고침해 다시 로그인해 주세요'})
            if path == '/api/logout':
                STORE.logout(self.sid()); return self.reply(200, {'ok': True}, [('Set-Cookie', f'{COOKIE}=; Path=/; Max-Age=0')])
            if path == '/api/me/password':
                req = self.body(10_000)
                if not STORE.check_pw(u, str(req.get('old') or '')): raise ValueError('지금 비밀번호가 맞지 않습니다')
                STORE.set_pw(u['id'], req.get('new')); return self.reply(200, {'ok': True})
            if path == '/api/me/claude/disconnect':
                STORE.set_claude(u['id'], ''); return self.reply(200, {'ok': True})
            if path == '/api/users':
                if u['role'] != 'admin': return self.reply(403, {'error': '관리자만 할 수 있습니다'})
                req = self.body(10_000); a = req.get('action')
                if a == 'add': STORE.add_user(req.get('id'), req.get('pw'), req.get('role'), str(req.get('name') or '')[:40])
                elif a == 'password': STORE.set_pw(req.get('id'), req.get('pw')); STORE.user(req.get('id'))['mustChange'] = True; STORE.save_users()
                elif a == 'delete':
                    if req.get('id') == u['id']: raise ValueError('자기 계정은 지울 수 없습니다')
                    STORE.del_user(req.get('id'))
                else: raise ValueError('모르는 작업')
                return self.reply(200, {'ok': True})
            if path == '/api/decks':
                req = self.body(40_000_000); a = req.get('action')
                if a == 'create': return self.reply(200, new_deck(u, req))
                owner, did = str(req.get('owner') or ''), str(req.get('id') or '')
                if not self.can(u, owner) or not re.fullmatch(r'\d{8}-[0-9a-f]{6}', did): return self.reply(403, {'error': '권한이 없습니다'})
                if a == 'rename': STORE.rename_deck(owner, did, re.sub(r'\s+', ' ', str(req.get('title') or '')).strip()[:80] or '제목 없음')
                elif a == 'delete': STORE.delete_deck(owner, did)
                else: raise ValueError('모르는 작업')
                return self.reply(200, {'ok': True})
            if path == '/api/classify': return self.classify(self.body(20_000))
            if path == '/api/ask': return self.ask(self.body(ASK_MAX_REQ))
            if path in ('/api/edit', '/api/edit/undo', '/api/shot', '/api/asset', '/api/font'):
                req = self.body(12_000_000); self.deck_access(u, req.get('file'))
                fn = {'/api/shot': lambda: shot(req, PORT), '/api/asset': lambda: save_asset(req), '/api/font': lambda: cache_font(req),
                      '/api/edit': lambda: apply_edits(req), '/api/edit/undo': lambda: undo_edit(req)}[path]
                return self.reply(200, fn())
            if path.startswith('/api/agent/'): return self.agent(u, path, self.body(200_000))
            return self.reply(404, {'error': '없는 주소'})
        except PermissionError as e:
            return self.reply(403, {'error': str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            return self.reply(409, {'error': str(e)})

    # ── Claude Code — 토큰은 이 계정의 것을 서버가 꺼내 붙인다(브라우저가 보낸 token 은 무시) ──
    def agent(self, u, path, req):
        req.pop('token', None)
        if path == '/api/agent/run':
            self.deck_access(u, req.get('file'))
            tok = STORE.claude_token(u['id'])
            if not tok: raise ValueError('Claude 구독이 연결돼 있지 않습니다 — 계정 설정에서 연결해 주세요')
            req.update({'token': tok, '_cfg': f"cfg-{u['id']}"})
            if req.get('build'):
                req.update({'prompt': build_prompt(os.path.dirname(edit_target(req.get('file')))), 'plan': False, 'model': req.get('model') or 'opus', 'effort': req.get('effort') or 'high'})
            return self.agent_stream(req, u)
        if path in ('/api/agent/apply', '/api/agent/discard'):
            r = deckagent.RUNS.get(str(req.get('rid') or ''))
            if r:
                self.deck_access(u, url_of(r['file']))
            if path == '/api/agent/discard': return self.reply(200, deckagent.discard(req))
            if not r: raise ValueError('이 수정안이 서버에 없습니다(서버를 다시 켰거나 오래됨) — 다시 부탁해 주세요')
            return self.reply(200, deckagent.apply(req, backup_name, os.path.dirname(backup_name(r['file']))))
        if path == '/api/agent/login/start':
            j = deckagent.login_start(req); deckagent.LOGINS[j['id']]['uid'] = u['id']; return self.reply(200, j)
        if path in ('/api/agent/login/finish', '/api/agent/login/poll'):
            l = deckagent.LOGINS.get(str(req.get('id') or ''))
            if l and l.get('uid') != u['id']: raise PermissionError('다른 계정의 로그인입니다')
            if path == '/api/agent/login/finish': return self.reply(200, deckagent.login_finish(req))
            j = deckagent.login_poll(req)
            if j.get('token'):
                tok = j.pop('token'); STORE.set_claude(u['id'], tok)
                sys.stderr.write(f"Claude 연결 {u['id']} (토큰 {len(tok)}자)\n")
                return self.reply(200, {'ok': True, 'connected': True})
            return self.reply(200, j)
        if path == '/api/agent/usage':
            req['token'] = STORE.claude_token(u['id']); return self.reply(200, deckagent.usage(req))
        return self.reply(404, {'error': '없는 주소'})

    def agent_stream(self, req, u):
        self.close_connection = True
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8'); self.send_header('Cache-Control', 'no-cache'); self.send_header('Connection', 'close')
        self.end_headers()
        send = lambda o: (self.wfile.write((json.dumps(o, ensure_ascii=False) + '\n').encode('utf-8')), self.wfile.flush())
        try:
            deckagent.run(req, send, PORT, edit_target, slide_parts, lambda q, _p: shot(q, PORT), url_of)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try: send({'error': str(e)})
            except Exception: pass
        sys.stderr.write(f"{datetime.datetime.now().strftime('%H:%M:%S')} {u['id']} agent {req.get('file')} {req.get('slide')}{' 새로 만들기' if req.get('build') else ''}\n"); sys.stderr.flush()

    # ── LLM(gemma) — 부탁 종류 판단 · 빠른 설명. 없는 환경이면 판단은 '작은 수정'으로 떨어지고 패널이 Claude 로 간다 ──
    def classify(self, req):
        sysm = ('너는 분류기다. 슬라이드 덱에 대한 사용자 부탁을 보고 숫자 하나만 답한다. 다른 말은 쓰지 않는다.\n'
                '1 = 설명 · 질문 · 요약(덱을 바꾸지 않음)\n2 = 작은 수정: 문구 · 색 · 글자 크기 · 요소 한두 개 고치기 · 지우기\n'
                '3 = 큰 수정: 한 장 안에서 배치 · 레이아웃 · 그래프 모양 바꾸기 · 새 그림 · 여러 요소를 다시 짜기\n'
                '4 = 여러 장 · 새 내용: 두 장 이상을 고치거나(「2장과 5장」 · 「모든 간지」), 새 장을 넣거나(「장을 추가해줘」), 덱에 새 자료 · 내용을 넣고 싶다는 부탁'
                '(「이 내용을 ppt 에 넣고 싶어」 · 「이걸 덱에 반영해줘」 — 어느 장에 넣을지 정하지 않았으면 4). 새 자료가 문장 · 그림으로 길게 따라와도 4\n'
                '앞 답이 수정을 제안했고 부탁이 「그래 해줘」 류면 그 수정의 크기로.')
        user = (f"앞 답(일부): {str(req.get('last') or '')[:400]}\n" if req.get('last') else '') + f"부탁: {str(req.get('q') or '')[:1000]}"
        body = json.dumps({'model': ASK_MODEL, 'temperature': 0, 'max_tokens': 4, 'chat_template_kwargs': {'enable_thinking': False},
                           'messages': [{'role': 'system', 'content': sysm}, {'role': 'user', 'content': user}]}).encode('utf-8')
        try:
            out = json.loads(urllib.request.urlopen(urllib.request.Request(ASK_URL, data=body, headers={'Content-Type': 'application/json'}), timeout=20).read().decode('utf-8'))
        except Exception as e:
            return self.reply(502, {'error': str(e)[:200]})
        t = out['choices'][0]['message'].get('content') or ''
        m = re.search(r'[1234]', t)
        return self.reply(200, {'kind': {'1': '설명', '2': '작은 수정', '3': '큰 수정', '4': '여러 장'}[m.group(0)] if m else '작은 수정', 'raw': t[:20]})

    def ask(self, req):
        q, msgs = build_messages(req)
        if not q: raise ValueError('질문이 비었습니다')
        think = bool(req.get('thinking'))
        body = json.dumps({'model': ASK_MODEL, 'temperature': 0.2, 'max_tokens': ASK_MAX_TOKENS * 2 if think else ASK_MAX_TOKENS,
                           'chat_template_kwargs': {'enable_thinking': think}, 'messages': msgs, 'stream': bool(req.get('stream'))}).encode('utf-8')
        if req.get('stream'): return self.relay_stream(body)
        out = json.loads(urllib.request.urlopen(urllib.request.Request(ASK_URL, data=body, headers={'Content-Type': 'application/json'}), timeout=120).read().decode('utf-8'))
        return self.reply(200, {'answer': out['choices'][0]['message'].get('content') or '', 'model': ASK_MODEL})

    def relay_stream(self, body):
        self.close_connection = True   # 길이를 모르는 흘려보내기 — 끝을 알리려면 연결을 닫아야 한다(HTTP/1.1 에서도)
        r = urllib.request.urlopen(urllib.request.Request(ASK_URL, data=body, headers={'Content-Type': 'application/json'}), timeout=120)
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache'); self.send_header('Connection', 'close')
        self.end_headers()
        send = lambda o: (self.wfile.write((json.dumps(o, ensure_ascii=False) + '\n').encode('utf-8')), self.wfile.flush())
        stat = {'r': 0, 'c': 0, 'fin': None}   # 로그용 — 생각 · 답 글자 수, 끝난 이유(빈 답 진단)
        try:
            for raw in r:
                line = raw.decode('utf-8', 'replace').strip()
                if not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if data == '[DONE]':
                    break
                ch = (json.loads(data).get('choices') or [{}])[0]
                if ch.get('finish_reason'): stat['fin'] = ch['finish_reason']
                delta = ch.get('delta', {})
                d = delta.get('content')
                if d:
                    send({'d': d}); stat['c'] += len(d)
                elif delta.get('reasoning_content') or delta.get('reasoning'):
                    stat['r'] += len(delta.get('reasoning_content') or delta.get('reasoning'))
                    send({'r': len(delta.get('reasoning_content') or delta.get('reasoning'))})   # 생각은 글자 수만 — 화면이 멈춰 보이지 않게
            send({'done': True, 'model': ASK_MODEL, 'fin': stat['fin']})   # 끝난 이유 — 'length' 면 덱이 '잘렸다'고 AI 에게 알려 다시 쓰게 한다
            sys.stderr.write(f"ask stream: 생각 {stat['r']}자 · 답 {stat['c']}자 · 끝 {stat['fin']}\n"); sys.stderr.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # 덱에서 "멈춤"을 누르면 연결이 끊긴다 — LLM 쪽 연결도 같이 닫는다
        except Exception as e:
            try: send({'error': str(e)})
            except Exception: pass
        finally:
            r.close()


class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128   # 덱 한 장을 열 때 몰리는 연결(글꼴 조각 · 스크립트 30여 개) — 기본 5 로는 넘쳐 Windows 가 21초 뒤 다시 시도했다(이전 프로토타입 실측)

if __name__ == '__main__':
    os.makedirs(DECKS, exist_ok=True)
    for dd in glob.glob(os.path.join(DECKS, '*', '*')):
        if os.path.isdir(dd): link_engine(dd)
    with S(('0.0.0.0', PORT), H) as s:
        sys.stderr.write(f'AI PPT http://0.0.0.0:{PORT} · 데이터 {DATA_DIR}\n'); sys.stderr.flush()
        s.serve_forever()
