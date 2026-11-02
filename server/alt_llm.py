# 대체 엔진 — Claude 구독 한도가 차면 예비 Claude 계정 · Codex · Gemini 로 이어 간다(사용자 지정 2026-11-02 "클로드 토큰 다 쓰면 아예 못쓰게가 아니라
#   다른 후보 토큰들도 쓸 수 있게 · user@example.com 도 있고 codex user@example.com 도 · 그게 안되면 재미니 flash라도").
# 순서: 주 Claude 토큰(계정 토큰 또는 DECK_SHARED_TOKEN) → 예비 Claude 토큰(DECK_SHARED_TOKEN_2) → Codex(ChatGPT 구독) → Gemini(무료 키).
# Codex · Gemini 는 Claude Code 틀은 그대로 두고 모델만 LiteLLM 으로 바꾼다 — 도구 제한(사본 한 파일만 고치기 · 캡처 명령만)이 그대로 지켜진다.
#   codex exec 를 직접 돌리면 셸이 열려 데모 방문자의 부탁으로 토큰 · 남의 덱을 읽힐 수 있어 쓰지 않는다.
# LiteLLM 은 이 컨테이너 안에서 돌고(:4011), 같은 도커 네트워크의 법숲 · 청약 레이더도 http://uyai:4011 로 같이 쓴다.
#   열쇠 = ALT_LLM_KEY(uyai-data/alt.env). 법숲 · 청약 레이더는 uyai-data/alt_client.env(ALT_LLM_URL · ALT_LLM_KEY)만 물린다 —
#   GATEWAY_KEY(법숲이 uyai 를 믿는 값)는 청약 레이더에 주지 않는다.
# 시험(2026-11-02, 이 맥): Codex gpt-6.1-terra 는 고치기 + grep 확인 5턴 12초, Gemini 3.5 flash-lite(무료 키)는 5턴 7초.
#   Gemini 는 모델 이름에 'gemini-3' 이 있어야 LiteLLM 이 도구 호출 서명(thought_signature)을 채운다 — gemini-flash-latest 별칭은 400.
#   무료 등급 gemini-3.8-flash 는 한 번 답에 40초가 넘어 대체용으로 쓰지 않는다.
import os, re, sys, json, time, shutil, hashlib, subprocess, threading, urllib.request
import notify

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.environ.get('PPT_DATA_DIR', os.path.join(os.path.dirname(HERE), 'data')))
ADIR = os.path.join(DATA_DIR, '.agent')
CHATGPT_DIR = os.path.join(ADIR, 'chatgpt')                    # Codex(ChatGPT) 로그인 — scripts/alt_login.sh codex 가 만든다(LiteLLM 이 갱신해 다시 쓴다)
LITE_BIN = os.path.expanduser(os.environ.get('DECK_LITE_BIN', '~/.venvs/litellm/bin/litellm'))
HOST = os.environ.get('ALT_LLM_HOST', '127.0.0.1')             # 컨테이너에서는 0.0.0.0(법숲 · 청약 레이더가 들어오게), 포트는 밖으로 열지 않는다
PORT = int(os.environ.get('ALT_LLM_PORT', '4011'))
URL = f'http://127.0.0.1:{PORT}'
LLM_BASE = os.environ.get('DECK_LLM_BASE', '')                 # (선택) 로컬 gemma(vLLM) — 있으면 gemma-think · gemma-nothink 도 싣는다
MODELS = {'codex': os.environ.get('ALT_CODEX_MODEL', 'chatgpt/gpt-6.1-terra'), 'gemini': os.environ.get('ALT_GEMINI_MODEL', 'gemini/gemini-3.5-flash-lite')}
LABEL = {'codex': 'Codex(ChatGPT)', 'gemini': 'Gemini Flash'}

def key(): return os.environ.get('ALT_LLM_KEY', '')            # LiteLLM 마스터 키는 sk- 로 시작해야 한다(scripts/alt_login.sh 가 만든다)

def codex_ready():
    try: return bool(json.load(open(os.path.join(CHATGPT_DIR, 'auth.json'))).get('refresh_token'))
    except (OSError, ValueError): return False
def gemini_ready(): return bool(os.environ.get('GEMINI_API_KEY'))
def alt_ready(): return codex_ready() or gemini_ready()

# ── 막힌 것 — 한도 · 인증 실패가 난 토큰(지문)이나 엔진은 풀리는 시각까지 건너뛴다. 메모리에만(서버를 다시 켜면 한 번 더 부딪혀 보고 다시 막는다) ──
BLOCK = {}
LIMIT_RE = re.compile(r'usage limit|limit reached|hit your (?:usage )?limit|rate[ _-]?limit|\b429\b|\b529\b|quota|overloaded|out of (?:extra )?usage|credit balance|resource.?exhausted|too many requests', re.I)
AUTH_RE = re.compile(r'\b401\b|\b403\b|unauthori[sz]ed|authentication|oauth|invalid[^\n]{0,20}(?:token|key)|(?:token|key)[^\n]{0,20}(?:expired|revoked|invalid)', re.I)
def fp(tok): return hashlib.sha256(str(tok).encode()).hexdigest()[:16]
def kind(msg):
    """실패 글 → 'limit'(한도) · 'auth'(인증) · ''(그 밖 — 다음 엔진으로 넘기지 않는다)"""
    m = str(msg or '')
    return 'limit' if LIMIT_RE.search(m) else 'auth' if AUTH_RE.search(m) else ''
def blocked(k): return BLOCK.get(k, 0) > time.time()
def block(k, label, why, until=0):
    """막기 — 처음 막을 때만 텔레그램으로 알린다(같은 한도로 부탁마다 알림이 오지 않게)"""
    now = time.time(); until = until if until and until > now else now + (6 * 3600 if why == 'auth' else 3600)
    new = not blocked(k); BLOCK[k] = until
    if new: notify.send(f"[uyai AI] {label} {'인증 실패' if why == 'auth' else '사용량 한도'} — 다음 후보로 넘깁니다(다시 시도: {time.strftime('%m-%d %H:%M', time.gmtime(until + 9 * 3600))} KST)")
    return new

def plan(tokens):
    """이번 부탁에 시도할 순서 [(엔진, 토큰, 이름, 막기 열쇠)] — 막힌 것은 빼고, 다 막혔으면 가장 먼저 풀리는 것 하나라도 시도"""
    out, seen = [], set()
    for t in tokens:
        if t and t not in seen: seen.add(t); out.append(('sub', t, 'Claude' if not out else 'Claude 예비 계정', fp(t)))
    for e, ok in (('codex', codex_ready()), ('gemini', gemini_ready())):
        if ok: out.append((e, None, LABEL[e], e))
    live = [x for x in out if not blocked(x[3])]
    return live or sorted(out, key=lambda x: BLOCK.get(x[3], 0))[:1]

# ── LiteLLM — 설정은 그때그때 만든다(Codex 로그인을 나중에 해도 다음 확인 때 실린다). 설정이 바뀌면 다시 띄운다 ──
_proc = {'p': None, 'sig': ''}
_lock = threading.Lock()
def config():
    ms = []
    if LLM_BASE:   # 예전 server/litellm.yaml(로컬 gemma) 과 같은 항목
        for nm, think in (('gemma-think', True), ('gemma-nothink', False)):
            ms.append({'model_name': nm, 'litellm_params': {'model': 'hosted_vllm/local', 'api_base': LLM_BASE, 'api_key': 'none', 'use_chat_completions_api': True,
                                                             'extra_body': {'chat_template_kwargs': {'enable_thinking': think}}}})
    if codex_ready(): ms.append({'model_name': 'alt-codex', 'litellm_params': {'model': MODELS['codex']}})
    if gemini_ready(): ms.append({'model_name': 'alt-gemini', 'litellm_params': {'model': MODELS['gemini'], 'api_key': 'os.environ/GEMINI_API_KEY'}})
    c = {'model_list': ms, 'litellm_settings': {'drop_params': True, 'callbacks': 'alt_hooks.proxy_handler_instance'}}
    if key(): c['general_settings'] = {'master_key': 'os.environ/LITELLM_MASTER_KEY'}
    return c

def _alive():
    try: urllib.request.urlopen(f'{URL}/health/liveliness', timeout=2).read(); return True
    except Exception: return False

def ensure():
    """LiteLLM 이 지금 설정으로 떠 있게 — 실을 모델이 없으면 False"""
    with _lock:
        c = config()
        if not c['model_list']: return False
        sig = hashlib.sha256(json.dumps(c, sort_keys=True).encode()).hexdigest()
        p = _proc['p']
        if p and p.poll() is None and _proc['sig'] == sig and _alive(): return True
        if not os.path.exists(LITE_BIN): raise ValueError(f'대체 엔진을 쓰려면 LiteLLM 이 필요합니다({LITE_BIN} 없음)')
        if p and p.poll() is None:
            p.terminate()
            try: p.wait(10)
            except subprocess.TimeoutExpired: p.kill()
        os.makedirs(ADIR, exist_ok=True); os.makedirs(CHATGPT_DIR, mode=0o700, exist_ok=True)
        cfg = os.path.join(ADIR, 'litellm.yaml'); open(cfg, 'w', encoding='utf-8').write(json.dumps(c, ensure_ascii=False, indent=1))   # JSON 도 YAML 이다
        shutil.copy(os.path.join(HERE, 'alt_hooks.py'), os.path.join(ADIR, 'alt_hooks.py'))   # 설정 파일 옆에 있어야 불러온다
        # 필요한 것만 넘긴다 — Claude 토큰 · 텔레그램 · DART 키는 LiteLLM 에 줄 까닭이 없다
        env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG', 'GEMINI_API_KEY') if os.environ.get(k)}
        env.update({'CHATGPT_TOKEN_DIR': CHATGPT_DIR, 'LITELLM_MASTER_KEY': key(), 'LITELLM_TELEMETRY': 'False', 'NO_DOCS': 'True'})
        _proc['p'] = subprocess.Popen([LITE_BIN, '--config', cfg, '--host', HOST, '--port', str(PORT), '--num_workers', '1'], cwd=ADIR, env=env,
                                      stdout=open(os.path.join(ADIR, 'litellm.log'), 'a'), stderr=subprocess.STDOUT, start_new_session=True)
        _proc['sig'] = sig
        for _ in range(90):
            time.sleep(0.5)
            if _alive(): return True
            if _proc['p'].poll() is not None: break
        raise ValueError('대체 엔진(LiteLLM)이 뜨지 않았습니다(data/.agent/litellm.log)')

def keep_loop():
    """서버가 켜져 있는 동안 1분마다 — 법숲 · 청약 레이더가 부를 때 이미 떠 있게, Codex 로그인이 새로 생기면 실리게"""
    while True:
        try: ensure()
        except Exception as e: sys.stderr.write(f'대체 엔진 확인 실패: {e}\n')
        time.sleep(60)

def env_for(eng):
    """Claude Code 를 LiteLLM 으로 돌릴 때 붙일 환경 · 인자 — --bare 는 OAuth · 키체인을 읽지 않고 이 열쇠만 쓴다"""
    return ({'ANTHROPIC_BASE_URL': URL, 'ANTHROPIC_API_KEY': key() or 'x'}, ['--bare', '--model', f'alt-{eng}'])
