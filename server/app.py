# DART Deck 서버(:8900, 0.0.0.0) — 계정마다 발표 자료(덱)를 저장하고, 관리자는 전부 본다. 사용자 지정 2026-09-30:
#   "새 포트로 계정별 PPT 저장 · 관리자는 전부 · 처음 만들 때 '어떤 사람에게 어떤 정보를?' 설문 또는 내용 붙여넣기 → Claude Code 가 엔진 규칙으로 만든다 · Claude Code 만"
# 뼈대는 덱 고치기 · 캡처 · AI 패널이고, 여기에 더한 것은 계정 · 세션 · 덱 목록 · 권한 검사다.
#   주소: /            → web/index.html(로그인 · 목록 · 새 덱 · 계정 · 사용자 관리)
#         /d/<계정>/<덱>/ → 덱(data/decks/<계정>/<덱>/index.html). js/ css/ tools/ DECK.md 는 engine/ 에서, fonts/ 는 data/fonts → engine/fonts 순으로
#   권한: 덱 주인 또는 관리자만. 캡처 도구(서버 안에서 도는 크롬)는 이 컴퓨터에서 온 요청 + 서버가 켤 때 만든 캡처 키(x-shot-key)로 들어온다 —
#         localhost 라는 것만으로 열어 주면 같은 컴퓨터의 역방향 프록시를 거친 모든 요청이 로그인 없이 통과한다
#   Claude 구독 토큰은 계정에 묶어 서버에만 둔다(store.py) — 화면 · 응답 · 로그로 내보내지 않는다(로그에는 길이만)
import os, re, sys, json, glob, uuid, time, base64, hashlib, secrets, datetime, subprocess, shutil, tempfile, socketserver, http.server, urllib.request, urllib.error, urllib.parse, mimetypes, html as htmlmod
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
import store as storemod, deckagent, importer, versions as vers, notify, alt_llm
STORE = storemod.Store(DATA_DIR)
_dropped = STORE.drop_importing()   # 가져오다 서버가 꺼진 반쪽 덱 정리
if _dropped: sys.stderr.write(f'가져오던 중이던 덱 {_dropped}개를 지웠습니다\n')
COOKIE = 'ppt_sid'

# ── uyai 사이트(2026-10-16) — 첫 화면(/) · 발표 자료(/deck/) · 법숲(/law/ → LAW_URL 로 중계) · 데모 체험 ──
LAW_URL = os.environ.get('LAW_URL', '').rstrip('/')          # 법숲 컨테이너(같은 도커 네트워크) — 비우면 /law/ 는 404
RADAR_URL = os.environ.get('RADAR_URL', '').rstrip('/')      # 청약 레이더 데모 컨테이너(개인 데이터 뺀 별도 인스턴스, 같은 도커 네트워크) — 비우면 /radar/ 는 404
GATEWAY_KEY = os.environ.get('GATEWAY_KEY', '')              # 법숲이 이 서버가 보낸 요청인지 확인하는 비밀 값
SHARED_TOKEN = os.environ.get('DECK_SHARED_TOKEN', '')       # 주인(개인) Claude 구독 토큰 — 데모 · 구독을 따로 연결하지 않은 계정이 쓴다
SHARED_TOKEN_2 = os.environ.get('DECK_SHARED_TOKEN_2', '')   # 예비 Claude 토큰 — 위 토큰이 한도면 이어 쓴다(alt_llm)
DEMO_SAMPLES = [x.strip() for x in os.environ.get('DECK_DEMO_SAMPLES', '').split(',') if x.strip()]   # 데모에 줄 예시 덱 '계정/덱ID'(첫 것이 열린다)
DEMO_RUNS = int(os.environ.get('DECK_DEMO_RUNS', '8'))       # 데모 세션 하나가 AI 에 부탁할 수 있는 횟수
DEMO_DAILY = int(os.environ.get('DECK_DEMO_DAILY', '60'))    # 서버 전체 하루 데모 부탁 상한(구독 한도 보호)
CONTACT = os.environ.get('DECK_CONTACT', '')   # 한도에 걸린 방문자에게 안내할 연락처(시연 요청)
DEMO_OK = ('/api/logout', '/api/edit', '/api/edit/undo', '/api/shot', '/api/versions', '/api/classify', '/api/ask')   # 데모가 쓸 수 있는 POST(+ /api/agent/*)
_demo_day = {'d': '', 'n': 0}
def _kst_day(): return time.strftime('%Y-%m-%d', time.gmtime(time.time() + 9 * 3600))   # 하루 = 한국 시간 0시 기준
def _demo_day_take():
    d = _kst_day()
    if _demo_day['d'] != d: _demo_day.update(d=d, n=0)
    if _demo_day['n'] >= DEMO_DAILY: return False
    _demo_day['n'] += 1; return True
def _demo_day_used(): return _demo_day['n'] if _demo_day['d'] == _kst_day() else 0
def demo_cleanup_loop():
    while True:
        try: STORE.drop_demos((deckagent.ADIR,))
        except Exception as e: sys.stderr.write(f'데모 정리 실패: {e}\n')
        time.sleep(600)

_fc_spec = _ilu.spec_from_file_location('fontcache', os.path.join(ENGINE, 'tools', 'fontcache.py')); FONTCACHE = _ilu.module_from_spec(_fc_spec); _fc_spec.loader.exec_module(FONTCACHE)
FONTCACHE.FONTS = FONT_DIR   # 편집에서 새로 받은 글꼴은 data/ 에(엔진 폴더는 배포 이미지 안이라 다시 배포하면 사라진다)

ASK_URL = os.environ.get('DECK_ASK_URL', '')
ASK_MODEL = os.environ.get('DECK_ASK_MODEL', 'local')
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

def deck_file(owner, did, rest, engine_top=ENGINE_TOP):
    """덱 주소의 나머지 경로 → 실제 파일(없거나 폴더 · 바깥이면 None). engine_top 이름은 engine/ 에서, fonts/ 는 data/fonts → engine/fonts 순으로"""
    top = rest.split('/', 1)[0]
    if top in engine_top: base = ENGINE
    elif top == 'fonts': base, rest = (FONT_DIR, rest[6:]) if os.path.exists(os.path.join(FONT_DIR, rest[6:])) else (ENGINE, rest)
    else: base = STORE.deck_dir(owner, did)
    p = os.path.realpath(os.path.join(base, rest or 'index.html'))
    return None if not p.startswith(os.path.realpath(base) + os.sep) or os.path.isdir(p) else p

# 읽기 공유(2026-10-01 사용자 지정 "외부 사람이 볼 수 있는 읽기 모드") — /s/<토큰>/ 은 로그인 없이 덱을 읽기만 한다
SHARE_RE = re.compile(r'^/s/([A-Za-z0-9_-]{16,64})(/.*)?$')
VIEW_RE = re.compile(r'^/v/([a-z0-9][a-z0-9_.-]{1,31})/(\d{8}-[0-9a-f]{6})/(current|\d{9,11}-[0-9a-f]{4})(/.*)?$')   # /v/<계정>/<덱>/<버전>/ — 버전 미리보기
SHARE_ENGINE_TOP = ('js', 'css')   # 읽기에 필요한 엔진만(tools · DECK.md 는 안 준다)
VIEW_FLAG = '<script>window.DECK_VIEW = 1;</script><meta name="robots" content="noindex,nofollow">'   # 엔진(deck · deckedit · deckkit)이 이걸 보고 편집 · AI 를 끈다

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

# ── 버전 기록(사용자 지정 2026-10-06 "구글 되돌리기처럼") — 저장이 일어나는 곳마다 ver_snap 으로 그 시점의 덱을 남긴다(server/versions.py) ──
def ver_chg(prev, new):
    """두 버전 사이 바뀐 페이지 요약 — 목록에 「수정 2 · 추가 1」로 보인다. f = 처음 바뀐 페이지(미리보기를 거기서 연다)"""
    ch, other = deckagent.changed_parts(prev, new, slide_parts); on, nn = deckagent.slide_names(prev), deckagent.slide_names(new)
    add = [x for x in nn if x not in on]; rem = [x for x in on if x not in nn]
    first = next((i + 1 for i, x in enumerate(nn) if x in ch or x in add), 0)
    return {'c': ch[:6], 'nc': len(ch), 'a': add[:6], 'na': len(add), 'r': rem[:6], 'nr': len(rem), 'o': bool(other), 'f': first}   # 이름은 6개까지, 개수(nc · na · nr)는 전부

def ver_snap(path, new, before, who, kind, label=''):
    try: vers.snapshot(os.path.dirname(path), new, before, who, kind, label, diff=ver_chg)
    except Exception as e: sys.stderr.write(f'버전 기록 실패 {path}: {e}\n')   # 기록이 실패해도 저장은 그대로 된다

deckagent.VERSION_HOOK = ver_snap   # AI 수정 적용(deckagent.apply)이 부른다

def ver_restore(owner, did, vid, who):
    """고른 버전으로 되돌린다. 복원 직전 상태도 버전으로 남는다(복원도 되돌릴 수 있게) — 옛 되돌리기용 .edits 백업도 평소처럼 하나 만든다"""
    d = STORE.deck_dir(owner, did); path = os.path.join(d, 'index.html'); it = vers.get(d, vid); new = vers.read(d, vid)
    if not it or new is None: raise ValueError('그 버전을 찾을 수 없습니다(보관 기간이 지났을 수 있습니다)')
    cur = open(path, encoding='utf-8').read()
    if vers.sha(new) == vers.sha(cur): raise ValueError('이미 현재 버전입니다')
    os.makedirs(os.path.dirname(backup_name(path)), exist_ok=True)
    open(f"{backup_name(path)}.{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.bak", 'w', encoding='utf-8').write(cur)
    open(path, 'w', encoding='utf-8').write(new)
    lt = time.localtime(it['t'])
    ver_snap(path, new, cur, who, 'restore', f"「{lt.tm_mon}월 {lt.tm_mday}일 {'오전' if lt.tm_hour < 12 else '오후'} {lt.tm_hour % 12 or 12}:{lt.tm_min:02d}」 버전으로 복원")
    return {'ok': True}

def ver_compare(owner, did, vid):
    """고른 버전 ↔ 지금 덱을 **합쳐서** 비교(사용자 지정 2026-10-06) — 그 버전 이후 쌓인 변경 전부. 페이지 이름으로 짝지어 수정 · 추가 · 삭제를 센다.
    o = 그 버전에서의 번호, w = 지금 덱에서의 번호(없으면 0). 옛 버전에 있던 페이지가 지금은 없으면 삭제, 지금만 있으면 추가"""
    d = STORE.deck_dir(owner, did); old = vers.read(d, vid)
    if old is None: raise ValueError('그 버전을 찾을 수 없습니다(보관 기간이 지났을 수 있습니다)')
    cur = open(os.path.join(d, 'index.html'), encoding='utf-8').read()
    ch, other = deckagent.changed_parts(old, cur, slide_parts); on, nn = deckagent.slide_names(old), deckagent.slide_names(cur)
    items = [{'name': nm, 'kind': 'change' if nm in on else 'add', 'o': on.index(nm) + 1 if nm in on else 0, 'w': k} for k, nm in enumerate(nn, 1) if nm in ch or nm not in on]
    items += [{'name': nm, 'kind': 'del', 'o': k, 'w': 0} for k, nm in enumerate(on, 1) if nm not in nn]
    cnt = lambda k: sum(1 for x in items if x['kind'] == k)
    return {'ok': True, 'same': vers.sha(old) == vers.sha(cur), 'other': bool(other), 'nc': cnt('change'), 'na': cnt('add'), 'nr': cnt('del'), 'pagesThen': len(on), 'pagesNow': len(nn), 'items': items[:300]}

def ver_shots(owner, did, vid, names):
    """비교 목록에서 고른 페이지(8개까지)의 화면 — 그 버전 · 지금을 나란히 찍는다(비교 화면 「바뀐 곳 · 겹쳐 보기」 재료)"""
    d = STORE.deck_dir(owner, did); cmp = ver_compare(owner, did, vid); want = [str(x) for x in (names or [])][:8]
    items = [x for x in cmp['items'] if x['name'] in want]
    if not items: return {'ok': True, 'shots': []}
    old = vers.read(d, vid); cur = open(os.path.join(d, 'index.html'), encoding='utf-8').read(); rel = f'/d/{owner}/{did}/'
    def run(html, nums):
        nums = [n for n in nums if n]
        if not nums: return {}
        r = shot({'file': rel, 'html': html, 'slide': nums[0], 'slides': nums}, PORT)
        return r.get('jpgs') or ({str(nums[0]): r.get('jpg', '')} if r.get('jpg') else {})
    got = {}; t = _th.Thread(target=lambda: got.__setitem__('w', run(cur, [x['w'] for x in items])), daemon=True); t.start()
    before = run(old, [x['o'] for x in items]); t.join(); after = got.get('w') or {}
    return {'ok': True, 'shots': [{**x, 'before': before.get(str(x['o']), '') if x['o'] else '', 'after': after.get(str(x['w']), '') if x['w'] else ''} for x in items]}

def _link_or_copy(src, dst):
    """덱의 사진 · 쪽 그림은 한 번 쓰면 안 바뀌는 파일이라 같은 디스크면 하드링크(용량 0), 안 되면 복사"""
    try: os.link(src, dst)
    except OSError: shutil.copy2(src, dst)

def ver_copy(user, owner, did, vid, title):
    """고른 버전을 **새 발표 자료**로(사용자 지정 2026-10-07) — 그 버전의 HTML + 사진 · 데이터 폴더. 새 덱은 이 사람 것이고 버전 기록은 새로 시작한다(brief · 옛 기록은 안 가져옴)"""
    d = STORE.deck_dir(owner, did); html = vers.read(d, vid); it = ver_item(d, vid)
    if html is None or not it: raise ValueError('그 버전을 찾을 수 없습니다(보관 기간이 지났을 수 있습니다)')
    meta = STORE._load(os.path.join(d, 'meta.json'), {}) or {}; t0 = meta.get('title') or did
    lt = time.localtime(it['t']); when = f"{lt.tm_mon}월 {lt.tm_mday}일 {'오전' if lt.tm_hour < 12 else '오후'} {lt.tm_hour % 12 or 12}:{lt.tm_min:02d}"
    title = re.sub(r'\s+', ' ', str(title or '')).strip()[:80] or f'{t0} (복사본)'
    new_did, nd = STORE.create_deck(user['id'], title, html)
    for sub in sorted(os.listdir(d)):
        sp = os.path.join(d, sub)
        if sub.startswith('.') or sub in ('index.html', 'meta.json', 'brief.json') or os.path.islink(sp) or not os.path.isdir(sp): continue   # 숨김 · 엔진 링크 · 설문 자료는 제외
        shutil.copytree(sp, os.path.join(nd, sub), copy_function=_link_or_copy, symlinks=True, dirs_exist_ok=True)
    link_engine(nd)
    m = STORE._load(os.path.join(nd, 'meta.json'), {}); m['copiedFrom'] = {'owner': owner, 'deck': did, 'ver': vid, 'at': int(time.time())}; STORE._save(os.path.join(nd, 'meta.json'), m)
    ver_snap(os.path.join(nd, 'index.html'), html, None, user['id'], 'copy', f'「{t0}」 {when} 버전에서 복사')
    return {'ok': True, 'id': new_did, 'url': f'/d/{user["id"]}/{new_did}/', 'title': title}

def ver_list(owner, did):
    d = STORE.deck_dir(owner, did); names = {x['id']: x.get('name') or x['id'] for x in STORE.users}
    out = []
    for x in vers.listing(d, diff=ver_chg):
        out.append({'id': x['id'], 't': x['t'], 'user': x.get('u') or '', 'userName': names.get(x.get('u') or '', x.get('u') or ''), 'kind': x.get('k'), 'label': x.get('l') or '',
                    'current': bool(x.get('current')), 'same': bool(x.get('same')), 'pinned': bool(x.get('pin')), 'chg': x.get('chg') or {}, 'first': x.get('f') or 0, 'size': x.get('z') or 0})
    return {'ok': True, 'versions': out}

def apply_edits(req, by=''):
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
    note = re.sub(r'\s+', ' ', str(req.get('note') or '')).strip()[:70]
    ver_snap(path, new, text, by, 'ai' if req.get('src') == 'ai' else 'edit', ('AI 수정' + (f' — {note}' if note else '')) if req.get('src') == 'ai' else ('직접 수정' + (f' — {slide}' if slide else '')))
    return {'ok': True, 'backup': os.path.basename(bak), 'changed': len(edits)}

def undo_edit(req, by=''):
    path = edit_target(req.get('file'))
    baks = sorted(glob.glob(backup_name(path) + '.*.bak'))
    if not baks:
        raise ValueError('되돌릴 백업이 없습니다')
    text = open(baks[-1], encoding='utf-8').read(); cur = open(path, encoding='utf-8').read()
    open(path, 'w', encoding='utf-8').write(text)
    ver_snap(path, text, cur, by, 'undo', '직전으로 되돌리기')
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
        r = subprocess.run([NODE, SHOT_TOOL, url, arg, img] + (['all'] if req.get('all') else []), capture_output=True, text=True, timeout=180, env={**os.environ, 'NODE_PATH': NODE_PATH})
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
# 문서 첨부(사용자 지정 2026-09-30 "ppt, pdf 같은 거 첨부 가능한가") — 덱 폴더 files/ 에 두고 Claude Code 가 읽는다.
#   PDF 는 Claude 의 Read 가 페이지를 직접 본다(그림 · 표까지). 글도 grep 할 수 있게 pdftotext 가 있으면 옆에 .txt 를 둔다.
#   PPTX · DOCX 는 Claude 가 못 연다 → 올릴 때 슬라이드 · 문단 글을 뽑아 .txt 로(표준 라이브러리 zipfile + XML 만, 글자만 — 도형 배치 · 그림은 빠진다)
DOC_EXT = {'.pdf': '.pdf', '.pptx': '.pptx', '.docx': '.docx'}
DOC_MAX = 25_000_000

def _xml_text(xml, para_tag, text_tag):
    import re as _re, html as _h
    out = []
    for p in _re.findall(rf'<{para_tag}[ >].*?</{para_tag}>', xml, _re.S):
        t = ''.join(_h.unescape(x) for x in _re.findall(rf'<{text_tag}(?: [^>]*)?>(.*?)</{text_tag}>', p, _re.S)).strip()
        if t: out.append(t)
    return out

def doc_text(path):
    """문서 → 글(.txt 옆에 저장한 경로, 없으면 ''). pptx = 슬라이드마다 「## 슬라이드 n」 + 글 + 발표자 메모, docx = 문단, pdf = pdftotext -layout"""
    import zipfile, re as _re, subprocess, shutil
    ext = os.path.splitext(path)[1].lower(); out = path[:-len(ext)] + '.txt'; L = []
    try:
        if ext == '.pptx':
            z = zipfile.ZipFile(path); names = z.namelist()
            num = lambda n: int(_re.search(r'(\d+)\.xml$', n).group(1))
            for n in sorted([n for n in names if _re.fullmatch(r'ppt/slides/slide\d+\.xml', n)], key=num):
                k = num(n); L.append(f'## 슬라이드 {k}'); L += _xml_text(z.read(n).decode('utf-8', 'replace'), 'a:p', 'a:t')
                note = f'ppt/notesSlides/notesSlide{k}.xml'
                if note in names:
                    nt = [t for t in _xml_text(z.read(note).decode('utf-8', 'replace'), 'a:p', 'a:t') if not t.isdigit()]
                    if nt: L += ['(발표자 메모)'] + nt
                L.append('')
        elif ext == '.docx':
            L = _xml_text(zipfile.ZipFile(path).read('word/document.xml').decode('utf-8', 'replace'), 'w:p', 'w:t')
        elif ext == '.pdf' and shutil.which('pdftotext'):
            subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', path, out], timeout=120, check=True)
            return out if os.path.getsize(out) > 0 else ''
    except Exception:
        return ''
    if not any(x.strip() for x in L): return ''
    open(out, 'w', encoding='utf-8').write('\n'.join(L)); return out

def pdf_pages(path):
    import subprocess, shutil, re as _re
    if not shutil.which('pdfinfo'): return 0
    try: return int(_re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True, timeout=30).stdout).group(1))
    except Exception: return 0

def doc_line(dc):
    """첨부 문서 한 줄 설명 — 새 덱 부탁 · 패널 부탁이 같이 쓴다"""
    return deckagent.doc_line(dc)

def save_asset(req):
    deck = edit_target(req.get('file'))
    x = os.path.splitext(str(req.get('name') or ''))[1].lower(); ext = ASSET_EXT.get(x); dext = DOC_EXT.get(x)
    if not ext and not dext: raise ValueError('그림(png · jpg · gif · webp)이나 문서(pdf · pptx · docx)만 넣을 수 있습니다')
    raw = base64.b64decode(str(req.get('data') or ''), validate=True)
    if dext:
        if not raw or len(raw) > DOC_MAX: raise ValueError('문서가 비었거나 25MB 를 넘습니다')
        d = os.path.join(os.path.dirname(deck), 'files'); os.makedirs(d, exist_ok=True)
        name = hashlib.sha1(raw).hexdigest()[:16] + dext; fp = os.path.join(d, name)
        open(fp, 'wb').write(raw); txt = doc_text(fp)
        orig = re.sub(r'[^\w.\- ]+', '_', os.path.basename(str(req.get('name'))))[:80]
        return {'ok': True, 'src': f'files/{name}', 'kind': 'doc', 'name': orig, 'text': f'files/{os.path.basename(txt)}' if txt else '', 'pages': pdf_pages(fp) if dext == '.pdf' else 0}
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
    # 그림이 있으면 OpenAI 식 여러 조각 내용 — 로컬 LLM(vLLM 등 OpenAI 호환)는 그림을 읽는다
    msgs.append({'role': 'user', 'content': [{'type': 'text', 'text': text}] + [{'type': 'image_url', 'image_url': {'url': u}} for u in imgs] if imgs else text})
    return q, msgs

# ── 목록 썸네일 — 덱의 실제 첫 화면(사용자 지정 2026-09-30 "메인 화면이 실제 첫 화면이 아니라 커스텀") ──
# 덱 폴더의 .thumb.jpg(숨김 — 웹으로는 /thumb/ 로만). 덱(index.html)이 썸네일보다 새로우면 다시 찍는다(저장 · AI 적용 뒤).
# 찍는 동안에는 옛 썸네일을 준다 — 없으면 기다렸다가(첫 목록). 크롬을 한꺼번에 여럿 띄우지 않게 동시에 2개까지
import threading as _th
THUMB_TOOL = os.path.join(ENGINE, 'tools', 'deck_thumb.cjs')
PDF_TOOL = os.path.join(ENGINE, 'tools', 'deck_pdf.cjs')
PDF_LOCKS = {}; PDF_SEM = _th.Semaphore(2)   # 크롬이 하나에 300MB 안팎 — 동시에 두 개까지(나머지는 줄을 선다)

def pdf_key(d, index=True):
    """PDF 가 옛것인지 — 덱 파일(index.html · data · img) 중 가장 늦게 바뀐 시각 + 엔진(js · css · tools · 글꼴 CSS)이 바뀐 시각. index=False 면 index.html 은 뺀다(버전 내보내기는 HTML 내용 해시를 따로 쓴다)"""
    ts = [os.path.getmtime(os.path.join(d, 'index.html'))] if index else [0]
    for sub in ('data', 'img', 'fonts'):
        for root, _, fs in os.walk(os.path.join(d, sub)):
            ts += [os.path.getmtime(os.path.join(root, f)) for f in fs if not f.startswith('.')]
    for sub in ('js', 'css', 'tools'):   # PDF 도구 · 엔진이 바뀌면 다시 만든다
        for root, _, fs in os.walk(os.path.join(ENGINE, sub)): ts += [os.path.getmtime(os.path.join(root, f)) for f in fs]
    for f in ('fonts/base.css', 'fonts/print/print.css'):
        if os.path.exists(os.path.join(ENGINE, f)): ts.append(os.path.getmtime(os.path.join(ENGINE, f)))
    return str(round(max(ts), 3))

def make_pdf(owner, did):
    """덱 → PDF(engine/tools/deck_pdf.cjs — 페이지마다 화면 그대로 찍어 한 쪽씩). 바뀌지 않았으면 전에 만든 것을 쓴다(덱 폴더 .export.pdf).
    같은 덱을 동시에 두 번 만들지 않게 덱마다 잠금"""
    d = STORE.deck_dir(owner, did); out = os.path.join(d, '.export.pdf'); kf = os.path.join(d, '.export.key')
    lock = PDF_LOCKS.setdefault((owner, did), _th.Lock())
    with lock:
        key = pdf_key(d)
        if os.path.exists(out) and os.path.exists(kf) and open(kf).read() == key: return out, {'cached': True}
        tmp = out + '.tmp'
        with PDF_SEM:
            t0 = time.time(); r = subprocess.run([NODE, PDF_TOOL, f'http://127.0.0.1:{PORT}/d/{owner}/{did}/', tmp], capture_output=True, text=True, timeout=900, env={**os.environ, 'NODE_PATH': NODE_PATH}); took = time.time() - t0
        info = json.loads(r.stdout or '{}')
        if not os.path.exists(tmp) or not info.get('pages'): raise ValueError('PDF 를 만들지 못했습니다 — ' + '; '.join(info.get('errors') or [r.stderr[-200:]]))
        os.replace(tmp, out); open(kf, 'w').write(key)
        try: json.dump({'pages': info['pages'], 'sec': round(took, 1)}, open(os.path.join(d, '.export.info'), 'w'))   # 다음 예상 시간에 쓴다(이 서버의 속도)
        except OSError: pass
        return out, info

# ── 내보내기(사용자 지정 2026-10-07 "ppt 로 변환 · 버전별") — 현재 덱이든 옛 버전이든 같은 방식: 그 HTML 을 숨김 미리보기 파일로 두고 캡처 도구가 연다 ──
#   pdf = 벡터 PDF(위와 같음) · pptx = 페이지마다 화면 그림 한 장(deck_pptx.cjs → pptx_build.py, 화면과 같은 모양) ·
#   pptx-edit = 글자 편집 가능(베타): 그림자를 뺀 벡터 PDF → LibreOffice(PDF 가져오기 → pptx). 글상자 · 도형으로 나오지만 굵은 글씨 · 글자 간격이 조금 달라진다(실측 2026-10-07)
EXPORTS = {'pdf': ('pdf', 'application/pdf'), 'pptx': ('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'pptx-edit': ('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}
PPTX_PY = os.environ.get('PPTX_PY') or ('/opt/pptx/bin/python' if os.path.exists('/opt/pptx/bin/python') else sys.executable)
PPTX_BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pptx_build.py'); PPTX_TOOL = os.path.join(ENGINE, 'tools', 'deck_pptx.cjs')
EXPORT_KEEP = 8   # 덱마다 만들어 둔 내보내기 파일은 가장 최근 8개까지

def export_key(d, html): return vers.sha(html)[:16] + '-' + pdf_key(d, index=False)

def _run_tool(cmd, timeout, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env={**os.environ, 'NODE_PATH': NODE_PATH, **(env or {})})
    try: return json.loads(r.stdout or '{}'), r
    except ValueError: return {}, r

def make_export(owner, did, vid, kind):
    """덱의 한 버전(또는 current)을 kind 로 내보낸다 → (파일 경로, 정보). 같은 내용 · 같은 엔진이면 전에 만든 것을 쓴다(덱 폴더 .export/)"""
    if kind not in EXPORTS: raise ValueError('모르는 형식')
    d = STORE.deck_dir(owner, did); html = vers.read(d, vid)
    if html is None: raise ValueError('그 버전을 찾을 수 없습니다(보관 기간이 지났을 수 있습니다)')
    ext = EXPORTS[kind][0]; exp = os.path.join(d, '.export'); os.makedirs(exp, exist_ok=True)
    out = os.path.join(exp, f'{kind}-{vid}.{ext}'); kf = out + '.key'; lock = PDF_LOCKS.setdefault((owner, did, vid, kind), _th.Lock())
    title = (STORE._load(os.path.join(d, 'meta.json'), {}) or {}).get('title') or did
    with lock:
        key = export_key(d, html)
        if os.path.exists(out) and os.path.exists(kf) and open(kf).read() == key: return out, {'cached': True}
        tag = uuid.uuid4().hex[:10]; page = os.path.join(d, f'.deckpreview-exp-{tag}.html'); work = tempfile.mkdtemp(prefix='export-', dir=TMP_DIR if os.path.isdir(TMP_DIR) else None); tmp = out + '.tmp'
        open(page, 'w', encoding='utf-8').write(html); url = f'http://127.0.0.1:{PORT}{url_of(page)}'
        try:
            with PDF_SEM:
                t0 = time.time(); pages = 0
                if kind == 'pdf':
                    info, r = _run_tool([NODE, PDF_TOOL, url, tmp], 900); pages = info.get('pages') or 0
                    if not os.path.exists(tmp) or not pages: raise ValueError('PDF 를 만들지 못했습니다 — ' + '; '.join(info.get('errors') or [r.stderr[-200:]]))
                elif kind == 'pptx':
                    info, r = _run_tool([NODE, PPTX_TOOL, url, work], 900); pages = info.get('pages') or 0
                    if not pages: raise ValueError('페이지 그림을 찍지 못했습니다 — ' + '; '.join(info.get('errors') or [r.stderr[-200:]]))
                    b = subprocess.run([PPTX_PY, PPTX_BUILD, work, tmp, title], capture_output=True, text=True, timeout=600)
                    if b.returncode != 0 or not os.path.exists(tmp): raise ValueError('PPT 로 묶지 못했습니다 — ' + (b.stderr or b.stdout)[-200:])
                else:
                    if not importer.SOFFICE: raise ValueError('이 서버에는 PPT 변환 도구(LibreOffice)가 없습니다')
                    pdf = os.path.join(work, 'flat.pdf'); info, r = _run_tool([NODE, PDF_TOOL, url, pdf], 900, {'FLAT': '1'}); pages = info.get('pages') or 0
                    if not os.path.exists(pdf) or not pages: raise ValueError('PDF 를 만들지 못했습니다 — ' + '; '.join(info.get('errors') or [r.stderr[-200:]]))
                    c = subprocess.run([importer.SOFFICE, f'-env:UserInstallation=file://{os.path.join(work, "lo-profile")}', '--headless', '--norestore', '--infilter=impress_pdf_import', '--convert-to', 'pptx', '--outdir', work, pdf], capture_output=True, text=True, timeout=600)
                    made = os.path.join(work, 'flat.pptx')
                    if not os.path.exists(made): raise ValueError('PPT 로 바꾸지 못했습니다 — ' + (c.stderr or c.stdout)[-200:])
                    shutil.move(made, tmp)
                took = time.time() - t0
            os.replace(tmp, out); open(kf, 'w').write(key)
            try:   # 다음 예상 시간에 쓴다(이 서버의 속도) + 오래된 파일 정리
                ip = os.path.join(exp, 'info.json'); inf = STORE._load(ip, {}) or {}; inf[kind] = {'pages': pages, 'sec': round(took, 1)}; json.dump(inf, open(ip, 'w'))
                fs = sorted([f for f in os.listdir(exp) if f.endswith(('.pdf', '.pptx'))], key=lambda f: -os.path.getmtime(os.path.join(exp, f)))
                for f in fs[EXPORT_KEEP:]:
                    for g in (f, f + '.key'):
                        try: os.remove(os.path.join(exp, g))
                        except OSError: pass
            except Exception: pass
            return out, {'cached': False, 'pages': pages, 'sec': round(took, 1)}
        finally:
            shutil.rmtree(work, ignore_errors=True)
            for f in (page, tmp):
                try: os.remove(f)
                except OSError: pass

# 내보내기 예상 시간 = 고정 + 페이지당(맥 실측으로 정한 기본값 — 만든 뒤에는 그 덱에서 잰 실제 속도로 맞춘다)
EXP_BASE = {'pdf': (5.0, 1.0), 'pptx': (5.0, 1.0), 'pptx-edit': (6.0, 0.85)}   # 서버 실측(24쪽): PDF 25.7초 · PPT 그림 29.6초 · PPT 편집 26.3초 — 만든 뒤에는 실제 속도로 보정
def exp_cached(d, kind):
    """지금 덱의 kind 내보내기를 이미 만들어 뒀나(내용 · 엔진이 같으면 바로 받는다)"""
    try:
        out = os.path.join(d, '.export', f'{kind}-current.{EXPORTS[kind][0]}'); kf = out + '.key'
        return os.path.exists(out) and os.path.exists(kf) and open(kf).read() == export_key(d, open(os.path.join(d, 'index.html'), encoding='utf-8').read())
    except OSError: return False

def exp_est(d, kind, pages):
    fx, pp = EXP_BASE[kind]; base = fx + pp * pages; k = 1.0; last = ((STORE._load(os.path.join(d, '.export', 'info.json'), {}) or {}).get(kind))
    if last and last.get('pages') and last.get('sec'): k = max(0.4, min(4.0, last['sec'] / (fx + pp * last['pages'])))
    return max(3, round(base * k))

# PDF 예상 시간 = 고정(크롬 켜기 · 글꼴 불러오기) + 페이지당. 처음엔 아래 기본값, 한 번 만들고 나면 그 덱에서 잰 실제 시간으로 이 서버 속도에 맞춘다
PDF_FIXED_SEC, PDF_PAGE_SEC = 5.0, 1.0   # 실측(2026-10-01 맥, 덱 3개): 11쪽 12초 · 13쪽 17초 · 16쪽 15초 — 서버가 느리면 첫 PDF 뒤부터 그 덱은 실제 속도로 맞춘다
def slide_count(idx):
    try: return len(re.findall(r'<section[^>]*class="[^"]*\bslide\b', open(idx, encoding='utf-8').read()))
    except OSError: return 0
def pdf_status(owner, did):
    d = STORE.deck_dir(owner, did); out = os.path.join(d, '.export.pdf'); kf = os.path.join(d, '.export.key')
    pages = slide_count(os.path.join(d, 'index.html')); base = PDF_FIXED_SEC + PDF_PAGE_SEC * pages
    cached = os.path.exists(out) and os.path.exists(kf) and open(kf).read() == pdf_key(d)
    k = 1.0; last = STORE._load(os.path.join(d, '.export.info'), None)
    if last and last.get('pages') and last.get('sec'): k = max(0.4, min(4.0, last['sec'] / (PDF_FIXED_SEC + PDF_PAGE_SEC * last['pages'])))
    return {'pages': pages, 'cached': bool(cached), 'estSec': 0 if cached else max(3, round(base * k)), 'bytes': os.path.getsize(out) if cached else 0}

def ver_post(d, req, who):
    owner, did, _ = d; a = req.get('action'); who_user = STORE.user(who)
    if a == 'restore': return ver_restore(owner, did, str(req.get('id') or ''), who)
    if a == 'list': return ver_list(owner, did)
    if a == 'compare': return ver_compare(owner, did, str(req.get('id') or ''))
    if a == 'copy': return ver_copy(who_user, owner, did, str(req.get('id') or ''), req.get('title'))
    if a == 'shots': return ver_shots(owner, did, str(req.get('id') or ''), req.get('names') if isinstance(req.get('names'), list) else [])
    raise ValueError('모르는 작업')

def docset(d, req, who=''):
    """문서 설정 — 읽기 공유 켜기 · 끄기 · 새 주소 + PDF 상태. d = deck_of(file) (권한은 호출 쪽에서 확인)"""
    owner, did, _ = d; a = req.get('action') or 'get'; newpin = ''
    if a == 'share_on': STORE.share_set(owner, did, True)
    elif a == 'share_renew': STORE.share_set(owner, did, True, renew=True)
    elif a == 'share_off': STORE.share_set(owner, did, False)
    elif a == 'pin_on': newpin = pin_on(owner, did, str(req.get('ver') or ''), who)
    elif a == 'pin_off': pin_off(owner, did, str(req.get('token') or ''))
    elif a != 'get': raise ValueError('모르는 작업')
    tok = STORE.share_of(owner, did)
    pst = pdf_status(owner, did); dd = STORE.deck_dir(owner, did)
    return {'ok': True, 'share': f'/s/{tok}/' if tok else '', 'pin': newpin, 'pins': pins_info(owner, did), 'pdf': pst, 'export': {k: {'estSec': exp_est(dd, k, pst['pages']), 'cached': exp_cached(dd, k)} for k in ('pptx', 'pptx-edit')}}

# ── 버전별 공유 링크(사용자 지정 2026-10-07 "링크 공유는 버전별로 저장") — /s/<토큰>/ 이 그 버전의 덱을 읽기 전용으로 보여 준다. 그 뒤에 덱을 고쳐도 링크는 안 바뀐다 ──
def ver_item(d, vid):
    """버전 id → 목록 항목. 'current' 는 지금 덱을 나타내는 항목(기록의 마지막과 같으면 그 항목, 아니면 기록 없는 현재 상태)"""
    if vid == 'current': return next((x for x in vers.listing(d) if x.get('current')), None)
    return vers.get(d, vid)

def pin_on(owner, did, vid, who):
    d = STORE.deck_dir(owner, did); it = ver_item(d, vid)
    if not it: raise ValueError('그 버전을 찾을 수 없습니다(보관 기간이 지났을 수 있습니다)')
    vid = it['id']
    if vid == 'current':   # 기록 없는 지금 상태 — 먼저 한 버전으로 남겨 그 id 에 고정한다
        cur = open(os.path.join(d, 'index.html'), encoding='utf-8').read(); vid = vers.snapshot(d, cur, None, who, 'share', '공유 링크용 저장', diff=ver_chg)
    tok = STORE.pin_add(owner, did, vid, who); vers.set_pin(d, vid, True); return tok

def pin_off(owner, did, token):
    ver, still = STORE.pin_remove(owner, did, token)
    if not still: vers.set_pin(STORE.deck_dir(owner, did), ver, False)   # 같은 버전을 가리키는 링크가 더 없으면 보관 정리 대상으로 돌린다

def pins_info(owner, did):
    d = STORE.deck_dir(owner, did); names = {x['id']: x.get('name') or x['id'] for x in STORE.users}; by_id = {x['id']: x for x in vers.listing(d)}; out = []
    for x in STORE.pins_of(owner, did):
        v = by_id.get(x.get('ver')) or {}
        out.append({'token': x['token'], 'path': f"/s/{x['token']}/", 'ver': x.get('ver'), 'at': x.get('at'), 'versionAt': v.get('t'), 'label': v.get('l') or '', 'by': names.get(x.get('by') or '', x.get('by') or '')})
    return sorted(out, key=lambda x: -(x['at'] or 0))
THUMB_SEM = _th.Semaphore(2); THUMB_BUSY = {}; THUMB_LOCK = _th.Lock()
def thumb_path(owner, did): return os.path.join(STORE.deck_dir(owner, did), '.thumb.jpg')
def thumb_fresh(owner, did):
    t = thumb_path(owner, did); idx = os.path.join(STORE.deck_dir(owner, did), 'index.html')
    return os.path.exists(t) and os.path.getmtime(t) >= os.path.getmtime(idx)
def make_thumb(owner, did):
    """찍는다(같은 덱을 두 번 동시에 찍지 않는다) — 끝나면 True"""
    key = f'{owner}/{did}'
    with THUMB_LOCK:
        ev = THUMB_BUSY.get(key)
        if ev: mine = False
        else: ev = THUMB_BUSY[key] = _th.Event(); mine = True
    if not mine: return ev.wait(60)
    try:
        with THUMB_SEM:
            out = thumb_path(owner, did); tmp = out + '.tmp.jpg'
            r = subprocess.run([NODE, THUMB_TOOL, f'http://127.0.0.1:{PORT}/d/{owner}/{did}/', tmp], capture_output=True, text=True, timeout=60, env={**os.environ, 'NODE_PATH': NODE_PATH})
            if r.returncode == 0 and os.path.exists(tmp): os.replace(tmp, out); return True
            sys.stderr.write(f'썸네일 실패 {key}: {(r.stderr or r.stdout)[-300:]}\n')
            try: os.remove(tmp)
            except OSError: pass
            return False
    except Exception as e:
        sys.stderr.write(f'썸네일 실패 {key}: {e}\n'); return False
    finally:
        with THUMB_LOCK: THUMB_BUSY.pop(key, None)
        ev.set()

# ── 새 덱 ──
BRIEF_KEYS = ('audience', 'info', 'key', 'pages', 'tone', 'material', 'text')
# ── PPT 가져오기: 백그라운드 작업 + 남은 시간(사용자 지정 2026-10-01 "가져오기 누르면 몇 초 남았는지") ──
# 올리는 동안은 브라우저가 바이트로 계산한다. 올린 뒤에는 서버가 작업(스레드)으로 돌리고 브라우저는 GET /api/import?job=… 으로 단계 · 남은 초를 받는다.
# 단계 길이 어림 = 고정 + 쪽당(GPU 서버 서버 실측 2026-10-01, 80쪽 18MB: PPT→PDF 23초 · 쪽 그림 18초 · 합 41초). 끝날 때마다 실제/어림 비율을 data/import-stats.json 에 이어 적어 이 서버 속도에 맞춘다
IMPORTS = {}; IMPORT_SEM = _th.Semaphore(2)   # 변환(LibreOffice)이 무거워 동시에 두 개까지
IMP_BASE = {'pdf': (5.0, 0.23), 'pages': (1.0, 0.2), 'build': (1.0, 0.03)}   # 단계: (고정초, 쪽당 초)
IMP_STAT_F = os.path.join(DATA_DIR, 'import-stats.json')
IMP_LABEL = {'queue': '앞 작업을 기다리는 중', 'pdf': 'PPT 를 PDF 로 바꾸는 중', 'pages': '쪽 그림을 만드는 중', 'build': '덱을 만드는 중', 'done': '완료', 'error': '실패'}
def imp_k(): return STORE._load(IMP_STAT_F, {}) or {}
def imp_est(stage, pages, k): fx, pp = IMP_BASE[stage]; return (fx + pp * pages) * (k.get(stage) or 1.0)
def imp_snap(J):
    """작업 상태 → 브라우저가 그릴 값(단계 · 한 일/전체 · 남은 초 · 비율)"""
    now = time.time(); st = J['stage']
    if st in ('done', 'error'): return {'stage': st, 'label': IMP_LABEL[st], 'pct': 100 if st == 'done' else 0, 'etaSec': 0, 'url': J.get('url'), 'pages': J.get('pages'), 'error': J.get('error')}
    order = [x for x in ('pdf', 'pages', 'build') if not (x == 'pdf' and J['ext'] == '.pdf')]
    k = J['k']; pages = J.get('total') or J['pages']; rem = 0.0; late = False
    for i, x in enumerate(order):
        if st == 'queue' or (st in order and i > order.index(st)): rem += imp_est(x, pages, k); continue   # 아직 안 한 단계
        if x != st: continue                                                                               # 끝낸 단계
        e = imp_est(x, pages, k); el = now - J['stageT0']
        if x in ('pages', 'build') and J['done'] > 0 and J['total']: r = el / J['done'] * (J['total'] - J['done'])   # 쪽 단위로 진행하는 단계는 지금까지의 실제 속도로
        else: r = e - el                                                                                   # 길이를 모르는 단계(PPT→PDF)는 어림에서 지난 시간을 뺀다
        if x == 'pdf' and r < 2: late = el > e; r = 2                                                      # 어림을 넘겨도 0초로 보이지 않게(late 면 「예상보다 오래」)
        rem += max(r, 0.5)
    el_all = now - J['t0']
    return {'stage': st, 'label': IMP_LABEL[st], 'done': J['done'], 'total': J['total'], 'etaSec': None if st == 'queue' else int(round(rem)), 'late': late,
            'pct': 0 if st == 'queue' else int(min(99, 100 * el_all / max(el_all + rem, 1))), 'elapsed': int(el_all)}

def import_start(user, req):
    """기존 PPT · PDF → 쪽마다 원본 그림 한 장인 덱(server/importer.py). AI 없이 열린다 — Claude 구독이 없어도 된다. 파일을 받으면 곧바로 작업 번호를 돌려주고 변환은 뒤에서"""
    name = os.path.basename(str(req.get('name') or '')); raw = base64.b64decode(str(req.pop('data', '') or ''), validate=True)   # pop — base64 글(133MB)을 풀자마자 놓는다
    ext = importer.check(name, raw)
    title = re.sub(r'\s+', ' ', str(req.get('title') or os.path.splitext(name)[0])).strip()[:80] or '가져온 발표 자료'
    tpl = open(os.path.join(ENGINE, 'template.html'), encoding='utf-8').read()
    did, d = STORE.create_deck(user['id'], title, tpl.replace('{{TITLE}}', htmlmod.escape(title)).replace('{{SUB}}', ''), importing=True)
    now = time.time(); job = secrets.token_urlsafe(9)
    for j in [j for j, v in IMPORTS.items() if v['stage'] in ('done', 'error') and now - v['t0'] > 3600]: IMPORTS.pop(j, None)
    IMPORTS[job] = {'owner': user['id'], 'did': did, 'ext': ext, 'stage': 'queue', 't0': now, 'stageT0': now, 'done': 0, 'total': 0, 'pages': importer.guess_pages(raw, ext), 'k': imp_k(), 'dur': {}}
    _th.Thread(target=import_run, args=(job, user['id'], did, d, tpl, title, name, raw), daemon=True).start()
    return {'ok': True, 'job': job, 'url': f'/d/{user["id"]}/{did}/'}

def import_run(job, uid, did, d, tpl, title, name, raw):
    J = IMPORTS[job]
    def prog(stage, done=0, total=0):
        t = time.time()
        if stage != J['stage']:
            if J['stage'] in IMP_BASE: J['dur'][J['stage']] = t - J['stageT0']
            J['stage'] = stage; J['stageT0'] = t
        J['done'] = done
        if total: J['total'] = total
    try:
        with IMPORT_SEM:
            J['t0'] = J['stageT0'] = time.time()   # 기다린 시간은 세지 않는다
            html, n, src = importer.build(tpl, title, d, name, raw, prog)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(html)
        m = STORE._load(os.path.join(d, 'meta.json'), {}); m.pop('importing', None); m.update({'from': name, 'imported': src, 'pages': n}); STORE._save(os.path.join(d, 'meta.json'), m)
        link_engine(d)
        ver_snap(os.path.join(d, 'index.html'), html, None, uid, 'import', f'「{name}」에서 가져옴 — {n}쪽')
        J['dur']['build'] = time.time() - J['stageT0']; J.update(stage='done', url=f'/d/{uid}/{did}/', pages=n)
        try:   # 이번 실제/어림 비율을 이어 적는다(쪽 5장 넘을 때만 — 고정 시간이 큰 작은 파일은 비율이 흔들린다)
            if n >= 5:
                k = imp_k()
                for x, sec in J['dur'].items():
                    r = sec / max(imp_est(x, n, {}), 0.5); k[x] = round(max(0.3, min(5.0, (k.get(x, 1.0) + r) / 2)), 3)
                STORE._save(IMP_STAT_F, k)
        except Exception: pass
    except Exception as e:
        shutil.rmtree(d, ignore_errors=True); J.update(stage='error', error=str(e)[:300])

def new_deck(user, req):
    """제목 + 받은 정보(설문 또는 통째 붙여넣기) + 그림 → 표지 한 페이지짜리 덱과 brief.json. 만들기는 덱을 연 뒤 Claude Code 가(?new=1)"""
    if not (STORE.claude_token(user['id']) or SHARED_TOKEN): raise ValueError('새 발표 자료는 Claude Code 가 만듭니다 — 먼저 계정 설정에서 Claude 구독을 연결해 주세요')
    title = re.sub(r'\s+', ' ', str(req.get('title') or '')).strip()[:80]
    if not title: raise ValueError('제목을 적어 주세요')
    b = req.get('brief') or {}
    brief = {'mode': 'paste' if b.get('mode') == 'paste' else 'survey', **{k: str(b.get(k) or '')[:40_000 if k in ('text', 'material') else 2000] for k in BRIEF_KEYS}, 'web': bool(b.get('web')),
             'effort': 'medium' if b.get('effort') == 'medium' else 'high'}   # 만들기 방식 — 빠르게(Sonnet medium) · 자세하게(Sonnet high)
    has_doc = any(os.path.splitext(str((f or {}).get('name') or ''))[1].lower() in DOC_EXT for f in (req.get('files') or []))   # 문서만 올려도 된다
    if not has_doc and not any(brief[k].strip() for k in BRIEF_KEYS): raise ValueError('어떤 사람에게 어떤 정보를 줄지 한 가지 이상 적어 주세요')
    tpl = open(os.path.join(ENGINE, 'template.html'), encoding='utf-8').read()
    did, d = STORE.create_deck(user['id'], title, tpl.replace('{{TITLE}}', htmlmod.escape(title)).replace('{{SUB}}', htmlmod.escape(brief['key'][:120] or brief['audience'][:120])))
    link_engine(d)
    ver_snap(os.path.join(d, 'index.html'), open(os.path.join(d, 'index.html'), encoding='utf-8').read(), None, user['id'], 'create', '새 발표 자료 — 표지')
    files = []; docs = []
    for f in (req.get('files') or [])[:6]:
        try:
            j = save_asset({'file': f'/d/{user["id"]}/{did}/', 'name': f.get('name'), 'data': f.get('data')})
            (docs.append({k: j[k] for k in ('src', 'name', 'text', 'pages')}) if j.get('kind') == 'doc' else files.append(j['src']))
        except Exception as e: sys.stderr.write(f'새 덱 그림 실패: {e}\n')
    brief.update({'title': title, 'files': files, 'docs': docs, 'at': int(time.time()), 'by': user['id']})
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
    imgs = [f for f in (b.get('files') or []) if f.startswith('img/')]; docs = b.get('docs') or []
    if imgs: L.append(f'- 첨부 그림: {", ".join(imgs)} — Read 로 열어 보고, 내용이면 재료로 · 덱에 넣을 만하면 <img src="그 경로"> 로')
    for dc in docs: L.append('- ' + doc_line(dc))
    if deckagent.DART_RAG_URL: L.append('- 공시 도구(dart_search · dart_finance · dart_section) 사용 가능: 회사 · 실적 · 사업 · 리스크는 이 도구로 2025 사업보고서에서 찾아 쓰고, 그 숫자 · 사실이 들어간 페이지에는 각주로 출처(회사 · 장 · 접수번호)를 단다. 도구 결과도 「받은 정보」로 본다')
    if b.get('web'): L.append('- 웹 검색 켜짐: 받은 정보만으로 부족한 배경 · 최신 사실 · 공개 통계는 웹에서 찾아 보강하고 출처를 단다(받은 정보와 어긋나면 받은 정보를 따른다)')
    L += ['', '[만드는 순서]',
          '1. 듣는 사람과 목적에 맞춰 흐름을 정한다: 표지 → 목차 → (부분마다 간지 → 본문 페이지) → 정리. 한 페이지에 메시지 하나. 분량을 말하지 않았으면 본문 6~10페이지.',
          '2. 페이지마다 명사형 제목 · 개조식 설명(2~4줄) · 그림(표 · 막대 · 순서도 · 비교 카드 등 인포그래픽)을 먼저 생각한다. 글만 있는 페이지는 피한다.',
          '3. 숫자 · 이름 · 사실은 받은 정보(공시 도구 결과 포함)에 있는 것만 쓴다. 없는 숫자를 지어내지 않는다 — 꼭 필요하면 「(자료 필요)」 로 자리만 둔다.',
          '4. 표지의 제목 · 부제는 알맞게 다듬어도 된다. data-name 은 페이지 이름(짧게)으로.',
          '5. 다 만들면 모든 페이지를 한 번에 찍어(장 번호 쉼표 목록) errors · problems 와 그림을 보고 넘침 · 겹침 · 빈 곳을 고친다.',
          '마지막 답: 만든 페이지 목록(번호. 제목)과, 자료가 부족해 자리표시로 둔 곳.']
    return '\n'.join(L)

IMPORT_MAX = importer.MAX            # PPT 가져오기 파일 상한(100MB, 2026-10-01 사용자 지정 — 40MB 에서 올림)
MAX_BODY = IMPORT_MAX * 4 // 3 + 1_000_000   # 가져오기 본문 = base64(×4/3) + 제목 등 — /api/decks 만 이만큼 받는다. 새 덱(그림 6장)은 이보다 작다
def body_cap(path, logged_in):
    """요청 본문 상한 — 본문을 먼저 다 읽으므로(아래 do_POST) 길을 먼저 좁힌다: 로그인 전엔 작게(로그인 · 불러오기 기록뿐), 로그인 뒤에도 큰 본문은 /api/decks · /api/asset 만"""
    if not logged_in: return 100_000
    return {'/api/decks': MAX_BODY, '/api/asset': 36_000_000}.get(path, 12_000_000)

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
        n = len(self._raw)
        if n <= 0 or n > limit: raise ValueError('본문 크기')
        j = json.loads(self._raw.decode('utf-8')); self._raw = b''   # 큰 본문(가져오기 100MB)이 요청 내내 메모리를 쥐지 않게
        return j
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
        t = 'font/woff2' if path.endswith('.woff2') else 'image/webp' if path.endswith('.webp') else (mimetypes.guess_type(path)[0] or 'application/octet-stream')
        if t.startswith('text/') or t in ('application/javascript', 'application/json'): t += '; charset=utf-8'
        # 영상은 Range(부분 요청)로 받는다 — Safari 는 206 이 없으면 재생하지 않는다
        size, start, end = st.st_size, 0, st.st_size - 1
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range') or '')
        if m and (m[1] or m[2]):
            if m[1]: start = int(m[1]); end = min(int(m[2]), size - 1) if m[2] else size - 1
            else: start = max(0, size - int(m[2]))
            if start > end or start >= size:
                self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.send_header('Content-Length', '0'); self.end_headers(); return
            self.send_response(206); self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        else:
            self.send_response(200)
        # 덱은 js · css 를 자주 고친다 — 늘 새로 확인(no-cache 는 '바뀌었나 묻기'라 안 바뀐 파일은 304 로 가볍다). 첫 화면 소개 미디어(web/media)는 하루 캐시
        cc = 'public, max-age=86400' if os.sep + 'media' + os.sep in path else 'no-cache'
        self.send_header('Content-Type', t); self.send_header('Content-Length', str(end - start + 1)); self.send_header('Accept-Ranges', 'bytes'); self.send_header('ETag', tag); self.send_header('Cache-Control', cc)
        self.end_headers()
        if not head_only:
            with open(path, 'rb') as f:
                f.seek(start); left = end - start + 1
                while left > 0:
                    b = f.read(min(65536, left))
                    if not b: break
                    self.wfile.write(b); left -= len(b)
    def log_error(self, fmt, *args):
        if 'timed out' in (fmt % args): return   # 쉬던 연결이 30초 뒤 닫히는 것 — 오류가 아니다
        self.log_message(fmt, *args)
    def log_message(self, fmt, *args):
        sys.stderr.write(f"{datetime.datetime.now().strftime('%H:%M:%S')} {self.client_address[0]} {fmt % args}\n"); sys.stderr.flush()

    def serve_view(self, owner, did, rest, head_only, html_src=None):
        """덱을 읽기 전용으로 준다(공유 주소 · 버전 미리보기 공용). 숨김 파일 · 덱 폴더 맨 위의 index.html 말고 다른 파일(meta.json · brief.json = 설문 · 올린 자료)은 주지 않는다.
        html_src 가 있으면 index.html 대신 그 내용(옛 버전)"""
        if any(seg.startswith('.') for seg in rest.split('/')) or ('/' not in rest and rest not in ('', 'index.html')): return self.send_error(404)
        p = deck_file(owner, did, rest, SHARE_ENGINE_TOP)
        if not p: return self.send_error(404)
        if os.path.basename(p) == 'index.html' and rest in ('', 'index.html'):
            html = html_src if html_src is not None else open(p, encoding='utf-8').read(); mh = re.search(r'<head[^>]*>', html, re.I)
            html = html[:mh.end()] + VIEW_FLAG + html[mh.end():] if mh else VIEW_FLAG + html
            data = html.encode('utf-8'); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store'); self.send_header('Referrer-Policy', 'no-referrer'); self.send_header('X-Robots-Tag', 'noindex, nofollow'); self.end_headers()
            if not head_only: self.wfile.write(data)
            return
        return self.send_file(p, head_only)

    # ── GET ──
    def do_HEAD(self): self.do_GET(head_only=True)
    def do_GET(self, head_only=False):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/law': self.send_response(301); self.send_header('Location', '/law/'); self.send_header('Content-Length', '0'); self.end_headers(); return
        if path.startswith('/law/'): return self.law_proxy('GET', head_only)
        if path == '/radar': self.send_response(301); self.send_header('Location', '/radar/'); self.send_header('Content-Length', '0'); self.end_headers(); return
        if path.startswith('/radar/'): return self.radar_proxy('GET', head_only)
        if path == '/api/site':   # 첫 화면 — 발표 자료 데모를 열 수 있는지(예시 덱이 실제로 있는지)
            ok = any(re.fullmatch(r'[a-z0-9][a-z0-9_.-]{1,31}/\d{8}-[0-9a-f]{6}', x) and os.path.isfile(os.path.join(STORE.deck_dir(*x.split('/')), 'index.html')) for x in DEMO_SAMPLES)
            return self.reply(200, {'demoDeck': ok})
        if path == '/api/me':
            u = self.me(); pu = STORE.public(u) if u else None
            if pu:
                pu['local'] = bool(deckagent.LLM_BASE)   # 로컬 LLM 이 없으면 화면에서 그 엔진 단추를 숨긴다
                if not pu['claude'] and SHARED_TOKEN: pu.update(claude=True, shared=True)   # 주인 구독을 같이 쓰는 계정 · 데모
                if u['role'] == 'demo':   # 데모 한도 — 화면 오른쪽 아래 위젯용(조회만)
                    dm = STORE.demos.get(u['id']) or {}
                    pu['demo'] = {'runs': dm.get('runs', 0), 'runsMax': DEMO_RUNS, 'expIn': max(0, int(dm.get('exp', 0) - time.time())),
                                  'day': _demo_day_used(), 'dayMax': DEMO_DAILY, 'contact': CONTACT}
            return self.reply(200, {'user': pu})
        if path == '/api/decks':
            u = self.me()
            if not u: return self.reply(401, {'error': '로그인이 필요합니다'})
            names = {x['id']: x.get('name') or x['id'] for x in STORE.users}
            ds = STORE.decks(None if u['role'] == 'admin' else u['id'])
            busy = deckagent.busy_files()
            for x in ds:
                x['ownerName'] = names.get(x['owner'], x['owner'])
                x['busy'] = os.path.join(STORE.deck_dir(x['owner'], x['id']), 'index.html') in busy   # Claude 가 고치거나 만드는 중
                x['thumb'] = f"/thumb/{x['owner']}/{x['id']}.jpg?v={x['updated'] or 0}"   # 덱이 바뀌면 주소가 바뀌어 브라우저가 새로 받는다
            return self.reply(200, {'decks': ds})
        if path == '/api/versions':
            u = self.me()
            if not u: return self.reply(401, {'error': '로그인이 필요합니다'})
            try: d = self.deck_access(u, (urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('file') or [''])[0])
            except PermissionError as e: return self.reply(403, {'error': str(e)})
            return self.reply(200, ver_list(d[0], d[1]))
        if path == '/api/import':
            u = self.me(); J = IMPORTS.get((urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('job') or [''])[0])
            if not u: return self.reply(401, {'error': '로그인이 필요합니다'})
            if not J or not self.can(u, J['owner']): return self.reply(404, {'error': '가져오기 작업을 찾을 수 없습니다(서버가 다시 켜졌을 수 있습니다)'})
            return self.reply(200, {'ok': True, **imp_snap(J)})
        if path == '/api/users':
            u = self.me()
            if not u or u['role'] != 'admin': return self.reply(403, {'error': '관리자만 볼 수 있습니다'})
            counts = {}
            for x in STORE.decks(): counts[x['owner']] = counts.get(x['owner'], 0) + 1
            return self.reply(200, {'users': [{**STORE.public(x), 'decks': counts.get(x['id'], 0)} for x in STORE.users]})
        if path in ('/', '/index.html'): return self.send_file(os.path.join(WEB, 'portal.html'), head_only)
        if path == '/deck': self.send_response(301); self.send_header('Location', '/deck/'); self.send_header('Content-Length', '0'); self.end_headers(); return
        if path == '/deck/': return self.send_file(os.path.join(WEB, 'index.html'), head_only)
        if path.startswith('/web/'):
            p = os.path.realpath(os.path.join(WEB, path[5:]))
            if not p.startswith(WEB + os.sep): return self.send_error(404)
            return self.send_file(p, head_only)
        m = re.fullmatch(r'/thumb/([a-z0-9][a-z0-9_.-]{1,31})/(\d{8}-[0-9a-f]{6})\.jpg', path)
        if m:
            owner, did = m.groups(); u = self.me()
            if not self.can(u, owner) or not os.path.isfile(os.path.join(STORE.deck_dir(owner, did), 'index.html')): return self.send_error(404)
            t = thumb_path(owner, did)
            if not thumb_fresh(owner, did):
                if os.path.exists(t): _th.Thread(target=make_thumb, args=(owner, did), daemon=True).start()   # 옛 것을 주고 뒤에서 새로
                elif not make_thumb(owner, did): return self.send_error(404)
            return self.send_file(t, head_only)
        # 내보내기(사용자 지정 2026-10-07) — /export/<계정>/<덱>/<버전|current>/<pdf|pptx|pptx-edit>: 현재든 옛 버전이든. 덱 주인 · 관리자만
        m = re.fullmatch(r'/export/([a-z0-9][a-z0-9_.-]{1,31})/(\d{8}-[0-9a-f]{6})/(current|\d{9,11}-[0-9a-f]{4})/(pdf|pptx|pptx-edit)', path)
        if m:
            owner, did, vid, kind = m.groups(); u = self.me()
            if not self.can(u, owner) or not os.path.isfile(os.path.join(STORE.deck_dir(owner, did), 'index.html')): return self.send_error(404)
            try: f, info = make_export(owner, did, vid, kind)
            except Exception as e: return self.reply(500, {'error': str(e)})
            d = STORE.deck_dir(owner, did); title = (STORE._load(os.path.join(d, 'meta.json'), {}) or {}).get('title') or did; tag = ''
            if vid != 'current':
                it = vers.get(d, vid)
                if it: lt = time.localtime(it['t']); tag = f" ({lt.tm_mon}월 {lt.tm_mday}일 {'오전' if lt.tm_hour < 12 else '오후'} {lt.tm_hour % 12 or 12}.{lt.tm_min:02d} 버전)"
            name = re.sub(r'[\\/:*?"<>|]+', ' ', title).strip()[:70] + tag + ('' if kind != 'pptx-edit' else ' (편집용)') + '.' + EXPORTS[kind][0]
            data = open(f, 'rb').read()
            self.send_response(200); self.send_header('Content-Type', EXPORTS[kind][1]); self.send_header('Content-Length', str(len(data)))
            self.send_header('Content-Disposition', "attachment; filename=\"deck." + EXPORTS[kind][0] + "\"; filename*=UTF-8''" + urllib.parse.quote(name)); self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Export-Info', urllib.parse.quote(json.dumps({k: info.get(k) for k in ('cached', 'pages', 'sec')}))); self.end_headers()
            if not head_only: self.wfile.write(data)
            return
        # PDF 로 받기(사용자 지정 2026-10-01) — 덱 주인 · 관리자만. 화면 그대로 찍은 PDF(engine/tools/deck_pdf.cjs)
        m = re.fullmatch(r'/pdf/([a-z0-9][a-z0-9_.-]{1,31})/(\d{8}-[0-9a-f]{6})\.pdf', path)
        if m:
            owner, did = m.groups(); u = self.me()
            if not self.can(u, owner) or not os.path.isfile(os.path.join(STORE.deck_dir(owner, did), 'index.html')): return self.send_error(404)
            try: f, info = make_pdf(owner, did)
            except Exception as e: return self.reply(500, {'error': str(e)})
            title = (STORE._load(os.path.join(STORE.deck_dir(owner, did), 'meta.json'), {}) or {}).get('title') or did
            name = re.sub(r'[\\/:*?"<>|]+', ' ', title).strip()[:80] + '.pdf'
            data = open(f, 'rb').read()
            self.send_response(200); self.send_header('Content-Type', 'application/pdf'); self.send_header('Content-Length', str(len(data)))
            self.send_header('Content-Disposition', "attachment; filename=\"deck.pdf\"; filename*=UTF-8''" + urllib.parse.quote(name)); self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Pdf-Info', urllib.parse.quote(json.dumps({k: info.get(k) for k in ('cached', 'pages', 'ms', 'bytes')}))); self.end_headers()
            if not head_only: self.wfile.write(data)
            return
        if path.startswith('/fonts/'):   # 목록 화면도 덱과 같은 글꼴(로그인 없이 — 글꼴 파일뿐)
            rest = path[7:]; base = FONT_DIR if os.path.exists(os.path.join(FONT_DIR, rest)) else os.path.join(ENGINE, 'fonts')
            p = os.path.realpath(os.path.join(base, rest))
            if not p.startswith(os.path.realpath(base) + os.sep): return self.send_error(404)
            return self.send_file(p, head_only)
        m = SHARE_RE.match(path)
        if m:
            tok, rest = m.group(1), (m.group(2) or '/').lstrip('/'); t = STORE.share_find(tok)
            if not t:
                msg = '공유가 끝났거나 없는 주소입니다'.encode('utf-8'); self.send_response(404); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.send_header('Content-Length', str(len(msg))); self.send_header('Cache-Control', 'no-store'); self.end_headers()
                if not head_only: self.wfile.write(msg)
                return
            if m.group(2) is None: self.send_response(301); self.send_header('Location', path + '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
            pv = STORE.share_ver(tok); html = None
            if pv:   # 그 버전에 고정된 링크 — 덱을 그 뒤에 고쳐도 이 링크는 그때 모습
                html = vers.read(STORE.deck_dir(t[0], t[1]), pv)
                if html is None: return self.send_error(404)
            return self.serve_view(t[0], t[1], rest, head_only, html)
        # 버전 미리보기(사용자 지정 2026-10-06) — 로그인한 주인 · 관리자만. 그 버전의 덱을 읽기 전용으로(공유 주소와 같은 모양)
        m = VIEW_RE.match(path)
        if m:
            owner, did, vid, rest = m.group(1), m.group(2), m.group(3), (m.group(4) or '/').lstrip('/'); u = self.me()
            if not u: self.send_response(302); self.send_header('Location', '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
            if not self.can(u, owner): return self.send_error(403, 'no access')
            if m.group(4) is None: self.send_response(301); self.send_header('Location', path + '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
            html = vers.read(STORE.deck_dir(owner, did), vid)
            if html is None: return self.send_error(404)
            return self.serve_view(owner, did, rest, head_only, html)
        d = deck_of(path)
        if d:
            owner, did, rest = d
            if not self.is_shot():
                u = self.me()
                if not self.can(u, owner):
                    if owner.startswith(storemod.DEMO_PREFIX) and self.command in ('GET', 'HEAD') and rest in ('', 'index.html'):
                        return self.demo_reenter(u, did)   # 끝난 데모 주소 — 새 데모로(사용자 버그 신고 2026-10-16)
                    if not u:
                        self.send_response(302); self.send_header('Location', '/?next=' + urllib.parse.quote(self.path)); self.send_header('Content-Length', '0'); self.end_headers(); return
                    if rest in ('', 'index.html'):   # 권한 없는 덱 페이지 — 원문 403 대신 첫 화면으로
                        self.send_response(302); self.send_header('Location', '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
                    return self.send_error(403, 'no access')
                # 숨김 파일(고치는 중인 사본 · 미리보기 · 백업)은 캡처 도구만
                if any(seg.startswith('.') for seg in rest.split('/')): return self.send_error(404)
            if not path.endswith('/') and rest == '':
                self.send_response(301); self.send_header('Location', path + '/'); self.send_header('Content-Length', '0'); self.end_headers(); return
            if rest == 'meta.json': return self.send_error(404)
            p = deck_file(owner, did, rest)
            return self.send_file(p, head_only) if p else self.send_error(404)
        if path == '/favicon.ico': return self.send_error(404)
        return self.send_error(404)

    # ── POST ──
    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        # 본문은 늘 먼저 다 읽는다 — 로그인 전(401)처럼 읽지 않고 답하면 남은 본문이 같은 연결의 다음 요청 앞에 붙어
        # 'Unsupported method ({"file":…}GET)' 501 로 깨졌다(캡처용 크롬이 덱 사본을 열 때 실측 2026-09-30)
        n = int(self.headers.get('Content-Length') or 0)
        logged = bool(self.me()); cap = body_cap(path, logged)
        if n > cap:
            if not logged and n <= MAX_BODY:   # 로그인이 풀린 채 큰 파일을 올린 경우 — 메모리에 담지 않고 흘려보낸 뒤 401(바로 끊으면 브라우저엔 '네트워크 오류'로만 보인다)
                left = n
                while left > 0:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk: break
                    left -= len(chunk)
                return self.reply(401, {'error': '로그인이 필요합니다 — 새로고침해 다시 로그인해 주세요'})
            self.close_connection = True; return self.reply(413 if logged else 401, {'error': '본문이 너무 큽니다' if logged else '로그인이 필요합니다 — 새로고침해 다시 로그인해 주세요'})
        self._raw = self.rfile.read(n) if n > 0 else b''
        if path.startswith('/law/'): return self.law_proxy('POST')
        if path.startswith('/radar/'): return self.radar_proxy('POST')
        try:
            if path == '/api/demo': return self.demo_start()
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
            if u['role'] == 'demo' and ((path not in DEMO_OK and not path.startswith('/api/agent/')) or path.startswith('/api/agent/login')):
                return self.reply(403, {'error': '데모에서는 할 수 없는 기능입니다'})
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
                elif a == 'update': STORE.update_user(req.get('id'), name=req.get('name'), role=req.get('role'), by=u['id'])
                elif a == 'delete':
                    if req.get('id') == u['id']: raise ValueError('자기 계정은 지울 수 없습니다')
                    STORE.del_user(req.get('id'))
                else: raise ValueError('모르는 작업')
                return self.reply(200, {'ok': True})
            if path == '/api/decks':
                req = self.body(MAX_BODY); a = req.get('action')
                if a == 'create': return self.reply(200, new_deck(u, req))
                if a == 'import': return self.reply(200, import_start(u, req))
                owner, did = str(req.get('owner') or ''), str(req.get('id') or '')
                if not self.can(u, owner) or not re.fullmatch(r'\d{8}-[0-9a-f]{6}', did): return self.reply(403, {'error': '권한이 없습니다'})
                if a == 'rename': STORE.rename_deck(owner, did, re.sub(r'\s+', ' ', str(req.get('title') or '')).strip()[:80] or '제목 없음')
                elif a == 'delete': STORE.delete_deck(owner, did)
                else: raise ValueError('모르는 작업')
                return self.reply(200, {'ok': True})
            if path == '/api/classify': return self.classify(self.body(20_000))
            if path == '/api/ask': return self.ask(self.body(ASK_MAX_REQ))
            if path in ('/api/edit', '/api/edit/undo', '/api/shot', '/api/asset', '/api/font', '/api/docset', '/api/versions'):
                # 문서 첨부(25MB → base64 약 34MB)는 /api/asset 만 크게 받는다. 나머지(고치기 · 캡처 · 글꼴)는 12MB 그대로
                req = self.body(36_000_000 if path == '/api/asset' else 12_000_000); self.deck_access(u, req.get('file'))
                fn = {'/api/shot': lambda: shot(req, PORT), '/api/asset': lambda: save_asset(req), '/api/font': lambda: cache_font(req),
                      '/api/edit': lambda: apply_edits(req, u['id']), '/api/edit/undo': lambda: undo_edit(req, u['id']), '/api/docset': lambda: docset(deck_of(req.get('file')), req, u['id']),
                      '/api/versions': lambda: ver_post(deck_of(req.get('file')), req, u['id'])}[path]
                return self.reply(200, fn())
            if path.startswith('/api/agent/'): return self.agent(u, path, self.body(200_000))
            return self.reply(404, {'error': '없는 주소'})
        except PermissionError as e:
            return self.reply(403, {'error': str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            return self.reply(409, {'error': str(e)})

    def client_ip(self):
        return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()

    def _demo_session(self):
        """임시 계정 + 예시 덱 사본(늘 원본에서 새로) → (sid, {did: 주소}) 또는 (None, (코드, 오류))"""
        if not DEMO_SAMPLES: return None, (503, '아직 데모용 예시 발표 자료가 없습니다')
        STORE.drop_demos((deckagent.ADIR,))
        uid, sid = STORE.new_demo(); urls = {}
        for item in DEMO_SAMPLES:
            owner, _, did = item.partition('/')
            src = STORE.deck_dir(owner, did)
            if not re.fullmatch(r'\d{8}-[0-9a-f]{6}', did) or not os.path.isfile(os.path.join(src, 'index.html')): continue
            dst = STORE.deck_dir(uid, did)
            shutil.copytree(src, dst, symlinks=True, ignore=shutil.ignore_patterns('.*'))   # 숨김(고치는 사본 · 대화 기록 · 버전)은 빼고
            link_engine(dst); urls[did] = f'/d/{uid}/{did}/?ai=1'
        if not urls: return None, (503, '예시 발표 자료를 찾지 못했습니다')
        return sid, urls
    def _demo_cookie(self, sid): return ('Set-Cookie', f'{COOKIE}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age={storemod.DEMO_SEC}')
    def demo_start(self):
        """데모 체험 — 임시 계정 + 예시 덱 사본 → 첫 덱 주소(AI 창 연 채)"""
        u = self.me()
        if u and u['role'] != 'demo': return self.reply(200, {'ok': True, 'url': '/deck/'})   # 로그인한 계정 — 데모 쿠키로 로그인을 덮어쓰지 않고 내 발표 자료로(사용자 지적 2026-10-22)
        sid, urls = self._demo_session()
        if not sid: return self.reply(urls[0], {'error': urls[1]})
        return self.reply(200, {'ok': True, 'url': next(iter(urls.values())), 'runs': DEMO_RUNS}, [self._demo_cookie(sid)])
    def demo_reenter(self, u, did):
        """끝난 데모 주소(세션 만료 · 서버 재시작 · 다른 세션)로 온 방문자 — 403 대신, 살아 있는 내 데모의 같은 자료로, 없으면 새 데모로 보낸다"""
        def go(loc, cookie=None):
            self.send_response(302); self.send_header('Location', loc); self.send_header('Cache-Control', 'no-store')
            if cookie: self.send_header(*cookie)
            self.send_header('Content-Length', '0'); self.end_headers()
        if u and u['role'] == 'demo' and os.path.isfile(os.path.join(STORE.deck_dir(u['id'], did), 'index.html')):
            return go(f"/d/{u['id']}/{did}/?ai=1")
        if u and u['role'] != 'demo': return go('/')   # 로그인한 일반 사용자는 남의 데모 사본 대신 첫 화면으로
        sid, urls = self._demo_session()
        if not sid: return go('/')
        return go(urls.get(did) or next(iter(urls.values())), self._demo_cookie(sid))

    def radar_proxy(self, method, head_only=False):
        """/radar/… → 청약 레이더 데모(RADAR_URL). 공개 데모라 로그인 없이 넘긴다. 데모 앱이 쓰기 · LLM · 알림을 막는다(DEMO_MODE)"""
        if not RADAR_URL: return self.send_error(404)
        sub_path = self.path[6:] or '/'
        hd = {'x-forwarded-prefix': '/radar', 'x-forwarded-for': self.client_ip(), 'x-forwarded-proto': self.headers.get('X-Forwarded-Proto') or 'http'}
        for k in ('Content-Type', 'Accept'):
            if self.headers.get(k): hd[k.lower()] = self.headers.get(k)
        ck = '; '.join(c.strip() for c in (self.headers.get('Cookie') or '').split(';') if c.strip() and not c.strip().startswith(COOKIE + '='))   # 이 서버의 로그인 쿠키는 넘기지 않는다
        if ck: hd['cookie'] = ck
        rq = urllib.request.Request(RADAR_URL + sub_path, data=(getattr(self, '_raw', b'') or b'') if method == 'POST' else None, headers=hd, method=method)
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        try: r = urllib.request.build_opener(_NoRedirect).open(rq, timeout=60)
        except urllib.error.HTTPError as e: r = e
        except Exception as e: return self.reply(502, {'error': f'청약 레이더 데모에 연결하지 못했습니다: {str(e)[:120]}'})
        status = getattr(r, 'status', None) or r.code
        def fix_headers():
            loc = r.headers.get('Location')
            if loc: self.send_header('Location', '/radar' + loc if loc.startswith('/') and not loc.startswith('/radar/') else loc)
            for sc in r.headers.get_all('Set-Cookie') or []:
                self.send_header('Set-Cookie', re.sub(r'(?i)path=/(?!radar)', 'Path=/radar/', sc) if re.search(r'(?i)path=', sc) else sc + '; Path=/radar/')
        ctype = r.headers.get('Content-Type') or ''
        if 'event-stream' in ctype or 'ndjson' in ctype:   # 스트리밍 — 받는 대로 넘긴다
            self.send_response(status); self.send_header('Content-Type', ctype); self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no'); self.send_header('Connection', 'close'); fix_headers(); self.end_headers()
            try:
                while True:
                    chunk = r.readline()
                    if not chunk: break
                    self.wfile.write(chunk); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError): pass
            self.close_connection = True; return
        body = r.read(); self.send_response(status)
        for k in ('Content-Type', 'Cache-Control'):
            v = r.headers.get(k)
            if v: self.send_header(k, v)
        fix_headers(); self.send_header('Content-Length', str(len(body))); self.end_headers()
        if not head_only: self.wfile.write(body)

    def law_proxy(self, method, head_only=False):
        """/law/… → 법숲(LAW_URL). 로그인은 이 서버가 확인하고, 법숲에는 역할(user · demo)과 비밀 값만 넘긴다"""
        if not LAW_URL: return self.send_error(404)
        sub_path = self.path[4:] or '/'; u = self.me()
        if not u:
            if method == 'GET' and not sub_path.startswith('/api/'):
                # 법숲 옛 주소 · 나눠 준 링크로 온 방문자 — 첫 화면을 거치지 않고 바로 데모로 들인다(발표 자료 사본은 만들지 않는다)
                _, sid = STORE.new_demo()
                self.send_response(302); self.send_header('Location', self.path); self.send_header('Set-Cookie', f'{COOKIE}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age={storemod.DEMO_SEC}')
                self.send_header('Content-Length', '0'); self.end_headers(); return
            return self.reply(401, {'error': '로그인이 필요합니다'})
        hd = {'x-uyai-role': 'demo' if u['role'] == 'demo' else 'user', 'x-uyai-key': GATEWAY_KEY, 'x-forwarded-for': self.client_ip(),
              'x-forwarded-proto': self.headers.get('X-Forwarded-Proto') or 'http',
              # 법숲이 '누가 주인 Claude 구독을 썼나' 텔레그램 알림에 쓴다(2026-10-27) — 관리자(주인)는 알리지 않는다
              'x-uyai-user': '' if u['role'] == 'demo' else re.sub(r'[^A-Za-z0-9_.-]', '', str(u['id']))[:32], 'x-uyai-admin': '1' if u['role'] == 'admin' else '0'}
        if self.headers.get('Content-Type'): hd['content-type'] = self.headers.get('Content-Type')
        rq = urllib.request.Request(LAW_URL + sub_path, data=(getattr(self, '_raw', b'') or b'') if method == 'POST' else None, headers=hd, method=method)
        try: r = urllib.request.urlopen(rq, timeout=180)
        except urllib.error.HTTPError as e: r = e
        except Exception as e: return self.reply(502, {'error': f'법숲에 연결하지 못했습니다: {str(e)[:120]}'})
        if 'ndjson' in (r.headers.get('Content-Type') or ''):   # 법숲 단계 스트리밍 — 받는 대로 바로 넘긴다
            self.send_response(getattr(r, 'status', None) or r.code)
            self.send_header('Content-Type', r.headers.get('Content-Type')); self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no'); self.send_header('Connection', 'close'); self.end_headers()
            try:
                while True:
                    chunk = r.readline()
                    if not chunk: break
                    self.wfile.write(chunk); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError): pass
            self.close_connection = True; return
        body = r.read(); self.send_response(getattr(r, 'status', None) or r.code)
        for k in ('Content-Type', 'Cache-Control'):
            v = r.headers.get(k)
            if v: self.send_header(k, v)
        self.send_header('Content-Length', str(len(body))); self.end_headers()
        if not head_only: self.wfile.write(body)

    # ── Claude Code — 토큰은 이 계정의 것을 서버가 꺼내 붙인다(브라우저가 보낸 token 은 무시) ──
    def agent(self, u, path, req):
        req.pop('token', None)
        if path == '/api/agent/run':
            self.deck_access(u, req.get('file'))
            # 엔진 — Claude Code(내 구독) 또는 로컬 LLM(LiteLLM 경유). 새 덱 만들기는 Claude Code 만(사용자 지정 2026-09-30)
            req['display'] = req.get('prompt')
            if req.get('engine') == 'gemma' and not req.get('build'):
                req['model'] = req['effort'] = None
            else:
                if u['role'] == 'demo':
                    if req.get('build'): raise PermissionError('데모에서는 새 발표 자료를 만들 수 없습니다')
                    dm = STORE.demos.get(u['id']) or {}
                    if dm.get('runs', 0) >= DEMO_RUNS: raise ValueError(f'데모 부탁 {DEMO_RUNS}번을 다 썼습니다 — 첫 화면에서 데모를 다시 시작할 수 있습니다. 더 보고 싶으시면 {CONTACT} 으로 연락 주세요')
                    if not _demo_day_take(): raise ValueError(f'오늘 데모 사용량이 다 찼습니다. 시연을 원하시면 {CONTACT} 으로 연락 주세요')
                    dm['runs'] = dm.get('runs', 0) + 1
                    req.update({'model': 'sonnet', 'effort': 'medium', 'web': False, 'engine': 'claude'})
                own = STORE.claude_token(u['id']); tok = own or SHARED_TOKEN
                # 후보 — 이 계정 토큰(또는 주인 토큰) → 주인 예비 토큰. 한도가 차면 deckagent 가 다음 후보 → Codex → Gemini 로 넘긴다(alt_llm)
                toks = [t for t in (tok, SHARED_TOKEN_2) if t]
                if not toks and not alt_llm.alt_ready():
                    if u['role'] != 'admin': notify.token_missing('데모 방문자' if u['role'] == 'demo' else f"계정 {u['id']}", req.get('prompt'))
                    raise ValueError('Claude 구독이 연결돼 있지 않습니다 — 계정 설정에서 연결해 주세요')
                req.update({'token': tok, 'tokens': toks, 'alt': True, '_cfg': f"cfg-{u['id']}"})
                # 주인 구독(공유 토큰)이 남에게 쓰이면 텔레그램으로 알린다(사용자 지정 2026-10-27) — 관리자 본인 · 자기 구독을 연결한 계정은 빼고
                if not own and u['role'] != 'admin':
                    req['_notify'] = {'who': '데모 방문자' if u['role'] == 'demo' else f"계정 {u['id']}",
                                      'day': f'{_demo_day_used()}/{DEMO_DAILY}' if u['role'] == 'demo' else ''}
            if req.get('build'):
                dd = os.path.dirname(edit_target(req.get('file')))
                req.update({'prompt': build_prompt(dd), 'plan': False, 'model': 'sonnet', 'effort': req.get('effort') if req.get('effort') in ('medium', 'high') else 'high',   # 새로 만들기 = Sonnet medium · high 만
                            'web': bool((STORE._load(os.path.join(dd, 'brief.json'), {}) or {}).get('web'))})
            return self.agent_stream(req, u)
        # 대화 기록 — 이 계정이 이 덱에 한 부탁들 · 따라 보기 · 멈춤 · 상태(진행 · 취소 · 버림) · 새 대화(숨기기)
        if path == '/api/agent/note':
            self.deck_access(u, req.get('file'))
            return self.reply(200, deckagent.note(edit_target(req.get('file')), u['id'], req.get('thread'), req.get('prompt') or '', req.get('slide'), req.get('text') or '', str(req.get('model') or '')[:60]))
        if path in ('/api/agent/jobs', '/api/agent/threads', '/api/agent/attach', '/api/agent/stop', '/api/agent/mark', '/api/agent/clear', '/api/agent/apply', '/api/agent/discard'):
            self.deck_access(u, req.get('file')); deck = edit_target(req.get('file')); rid = str(req.get('rid') or '')
            if rid:
                m = deckagent.meta_of(deck, rid)
                if not re.fullmatch(r'[0-9a-f]{10}', rid) or not m or m.get('owner') != u['id']: raise PermissionError('이 부탁을 볼 권한이 없습니다')
            th = str(req.get('thread') or '')
            if th and th != 'old' and not deckagent.THREAD_RE.fullmatch(th): raise ValueError('대화방 이름이 이상합니다')
            if path == '/api/agent/threads': return self.reply(200, {'ok': True, 'threads': deckagent.threads(deck, u['id'])})
            if path == '/api/agent/jobs':
                t, js = deckagent.jobs(deck, u['id'], th); return self.reply(200, {'ok': True, 'thread': t, 'jobs': js})
            if path == '/api/agent/attach': return self.attach_stream(rid, int(req.get('from') or 0), deck)
            if path == '/api/agent/stop': return self.reply(200, deckagent.stop(rid))
            if path == '/api/agent/mark': return self.reply(200, deckagent.mark(deck, u['id'], rid, req.get('state') or {}))
            if path == '/api/agent/clear': return self.reply(200, deckagent.hide_thread(deck, u['id'], th))
            if path == '/api/agent/discard': return self.reply(200, deckagent.discard(req, mark_it=True))
            return self.reply(200, deckagent.apply(req, backup_name, deck))
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
            # 서버 스레드가 돌리고 여기서는 따라 보기만 — 창을 닫아도(연결이 끊겨도) 작업은 계속된다
            rid = deckagent.start(req, PORT, edit_target, slide_parts, lambda q, _p: shot(q, PORT), url_of, backup_name, u['id'])
            deckagent.follow(rid, send)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try: send({'error': str(e)})
            except Exception: pass
        sys.stderr.write(f"{datetime.datetime.now().strftime('%H:%M:%S')} {u['id']} agent {req.get('file')} {req.get('slide')}{' 새로 만들기' if req.get('build') else ''}\n"); sys.stderr.flush()

    def attach_stream(self, rid, frm, deck):
        self.close_connection = True
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8'); self.send_header('Cache-Control', 'no-cache'); self.send_header('Connection', 'close')
        self.end_headers()
        send = lambda o: (self.wfile.write((json.dumps(o, ensure_ascii=False) + '\n').encode('utf-8')), self.wfile.flush())
        try: deckagent.follow(rid, send, frm, deck)
        except (BrokenPipeError, ConnectionResetError): pass

    # ── 로컬 LLM(선택) — 부탁 종류 판단 · 빠른 설명. 없는 환경이면 판단은 '작은 수정'으로 떨어지고 패널이 Claude 로 간다 ──
    def classify(self, req):
        if not ASK_URL: return self.reply(200, {'kind': '작은 수정', 'raw': ''})   # 로컬 LLM 이 없으면 판단을 건너뛴다
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
        if not ASK_URL: return self.reply(503, {'error': '빠른 답(로컬 LLM)이 꺼져 있습니다 — Claude Code 로 물어봐 주세요'})
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
    request_queue_size = 128   # 덱 한 장을 열 때 몰리는 연결(글꼴 조각 · 스크립트 30여 개) — 기본 5 로는 넘쳐 Windows 가 21초 뒤 다시 시도했다(실측)

if __name__ == '__main__':
    os.makedirs(DECKS, exist_ok=True)
    for dd in glob.glob(os.path.join(DECKS, '*', '*')):
        if os.path.isdir(dd): link_engine(dd)
    import threading as _thr; _thr.Thread(target=demo_cleanup_loop, daemon=True).start()
    _thr.Thread(target=alt_llm.keep_loop, daemon=True).start()   # 대체 엔진(LiteLLM) — 실을 모델이 생기면 띄운다. 법숲 · 청약 레이더도 같이 쓴다
    _rag = os.path.join(DATA_DIR, 'rag')
    if os.path.isfile(os.path.join(_rag, 'chunks.jsonl')):   # 공시 검색 서버(rag/server.mjs) — 데이터가 있을 때만, 이 컨테이너 안(127.0.0.1)에서
        subprocess.Popen(['node', os.path.join(ROOT, 'rag', 'server.mjs')], env={**os.environ, 'DART_DATA': _rag + os.sep, 'DART_MODELS': os.path.join(_rag, 'models') + os.sep, 'DART_OFFLINE': '1'},
                         stdout=open(os.path.join(_rag, 'server.log'), 'a'), stderr=subprocess.STDOUT, start_new_session=True)
        os.environ.setdefault('DART_RAG_URL', 'http://127.0.0.1:8787'); deckagent.DART_RAG_URL = os.environ['DART_RAG_URL']
    with S((os.environ.get('PPT_HOST', '0.0.0.0'), PORT), H) as s:   # PPT_HOST=127.0.0.1 이면 이 컴퓨터에서만(이 맥은 Tailscale 이 tailnet 주소의 8900 을 GPU 서버으로 넘겨 0.0.0.0 으로는 못 연다)
        sys.stderr.write(f'DART Deck http://0.0.0.0:{PORT} · 데이터 {DATA_DIR}\n'); sys.stderr.flush()
        s.serve_forever()
