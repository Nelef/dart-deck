# 저장소 — 계정 · 세션 · 덱 목록(JSON 파일). 서버(app.py)가 쓴다.
# 계정: data/users.json — 비밀번호는 pbkdf2(sha256, 20만 번) 해시만 저장한다. Claude 구독 토큰은 계정에 묶어 둔다(사용자 지정 2026-09-30
#   "계정에 묶어 서버에 저장") — 파일 권한 600, 화면 · API 로는 절대 돌려주지 않는다(서버가 Claude Code 를 부를 때만 꺼낸다).
# 세션: data/sessions.json — 서버를 다시 켜도 로그인이 풀리지 않게. 14일 지나면 만료.
# 덱: data/decks/<계정>/<덱 ID>/index.html + meta.json(제목 · 만든 날 · 고친 날 · share) + brief.json(처음 만들 때 받은 설문 · 자료)
# 읽기 공유(2026-10-01): meta.json 의 share = {token, at}. 토큰 주소(/s/<토큰>/)는 로그인 없이 읽기만 된다. 토큰 → 덱 찾기표는 켤 때 meta 들에서 모은다
import os, json, hashlib, hmac, secrets, time, threading, re, shutil

LOCK = threading.RLock()
SESSION_SEC = 14 * 86400
# 데모 방문자(uyai 첫 화면의 「데모 체험하기」) — 계정 파일에 넣지 않는 임시 계정. 예시 덱 사본만 갖고, 시간이 지나거나 서버가 다시 켜지면 사본째 지운다
DEMO_SEC = int(os.environ.get('DECK_DEMO_SEC', str(3 * 3600)))
DEMO_PREFIX = 'demo-'

class Store:
    def __init__(self, data_dir):
        self.dir = data_dir; os.makedirs(os.path.join(data_dir, 'decks'), exist_ok=True)
        self.users_f = os.path.join(data_dir, 'users.json'); self.sess_f = os.path.join(data_dir, 'sessions.json')
        self.users = self._load(self.users_f, {'users': []})['users']; self.sess = self._load(self.sess_f, {})
        self.demos = {}   # 데모 계정 → {t, exp, runs} — 메모리에만. 켤 때 남은 데모 사본은 지운다
        for o in os.listdir(os.path.join(data_dir, 'decks')):
            if o.startswith(DEMO_PREFIX): shutil.rmtree(os.path.join(data_dir, 'decks', o), ignore_errors=True)
        if not self.users:   # 처음 켤 때 관리자 하나 — 이전 프로토타입 와 같게 admin/admin(첫 로그인 뒤 바꾸라고 화면에서 알린다)
            self.add_user('admin', 'admin', 'admin', '관리자', must_change=True)
        self.shares = {}; self.pins = {}   # shares: 토큰 → (계정, 덱) 「최신」 링크 · pins: 토큰 → (계정, 덱, 버전 id) 「그 버전에 고정」 링크(2026-10-07)
        for x in self.decks():
            m = self._load(os.path.join(self.deck_dir(x['owner'], x['id']), 'meta.json'), {}) or {}
            t = (m.get('share') or {}).get('token')
            if t: self.shares[t] = (x['owner'], x['id'])
            for pn in m.get('pins') or []:
                if pn.get('token') and pn.get('ver'): self.pins[pn['token']] = (x['owner'], x['id'], pn['ver'])

    def _load(self, f, dflt):
        try: return json.load(open(f, encoding='utf-8'))
        except (OSError, ValueError): return dflt
    def _save(self, f, obj):
        tmp = f + '.tmp'; open(tmp, 'w', encoding='utf-8').write(json.dumps(obj, ensure_ascii=False, indent=1)); os.chmod(tmp, 0o600); os.replace(tmp, f)
    def save_users(self):
        with LOCK: self._save(self.users_f, {'users': self.users})

    # ── 계정 ──
    @staticmethod
    def hash_pw(pw, salt=None):
        salt = salt or secrets.token_hex(16)
        return f"pbkdf2${salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 200_000).hex()}"
    def check_pw(self, u, pw):
        try: _, salt, h = u['pw'].split('$')
        except (KeyError, ValueError): return False
        return hmac.compare_digest(self.hash_pw(pw, salt), u['pw'])
    def user(self, uid):
        u = next((u for u in self.users if u['id'] == uid), None)
        if u: return u
        d = self.demos.get(uid)
        if d and d['exp'] > time.time(): return {'id': uid, 'name': '데모 방문자', 'role': 'demo', 'created': int(d['t'])}
        return None
    def new_demo(self):
        """데모 계정과 세션을 만든다 → (계정, 세션 id)"""
        uid = DEMO_PREFIX + secrets.token_hex(4); now = time.time(); sid = secrets.token_urlsafe(32)
        with LOCK:
            self.demos[uid] = {'t': now, 'exp': now + DEMO_SEC, 'runs': 0}
            self.sess[sid] = {'user': uid, 'exp': now + DEMO_SEC}; self._save(self.sess_f, self.sess)
        return uid, sid
    def drop_demos(self, extra_dirs=()):
        """시간이 지난 데모 계정 · 사본 덱(· Claude Code 설정 폴더)을 지운다 → 지운 수"""
        now = time.time()
        with LOCK: gone = [k for k, v in self.demos.items() if v['exp'] < now]
        for k in gone:
            self.demos.pop(k, None); shutil.rmtree(os.path.join(self.dir, 'decks', k), ignore_errors=True)
            for base in extra_dirs: shutil.rmtree(os.path.join(base, f'cfg-{k}'), ignore_errors=True)
        return len(gone)
    def add_user(self, uid, pw, role='user', name='', must_change=False):
        uid = str(uid or '').strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{1,31}', uid): raise ValueError('아이디는 영문 소문자 · 숫자 · _ . - 로 2~32자')
        if uid.startswith(DEMO_PREFIX): raise ValueError(f'{DEMO_PREFIX} 로 시작하는 아이디는 쓸 수 없습니다')
        if len(str(pw or '')) < 4: raise ValueError('비밀번호는 4자 이상')
        with LOCK:
            if self.user(uid): raise ValueError('이미 있는 아이디입니다')
            self.users.append({'id': uid, 'name': name or uid, 'role': 'admin' if role == 'admin' else 'user', 'pw': self.hash_pw(pw), 'created': int(time.time()), 'mustChange': bool(must_change)})
            self.save_users()
    def set_pw(self, uid, pw):
        if len(str(pw or '')) < 4: raise ValueError('비밀번호는 4자 이상')
        with LOCK:
            u = self.user(uid)
            if not u: raise ValueError('없는 계정')
            u['pw'] = self.hash_pw(pw); u['mustChange'] = False; self.save_users()
    def update_user(self, uid, name=None, role=None, by=None):
        """관리자의 사용자 수정 — 이름 · 권한(일반/관리자). 아이디는 덱 폴더 이름이라 바꾸지 않는다. 자기 권한은 못 바꾸고, 마지막 관리자는 일반으로 못 내린다"""
        with LOCK:
            u = self.user(uid)
            if not u: raise ValueError('없는 계정')
            if role is not None and role not in ('admin', 'user'): raise ValueError('권한은 일반 또는 관리자')
            if role is not None and role != u['role']:
                if uid == by: raise ValueError('자기 자신의 권한은 바꿀 수 없습니다')
                if u['role'] == 'admin' and sum(1 for x in self.users if x['role'] == 'admin') <= 1: raise ValueError('마지막 관리자는 일반으로 바꿀 수 없습니다')
            if name is not None:
                name = re.sub(r'\s+', ' ', str(name)).strip()[:40]
                if not name: raise ValueError('이름을 적어 주세요')
                u['name'] = name
            if role is not None: u['role'] = role
            self.save_users()
    def del_user(self, uid):
        with LOCK:
            u = self.user(uid)
            if not u: raise ValueError('없는 계정')
            if u['role'] == 'admin' and sum(1 for x in self.users if x['role'] == 'admin') <= 1: raise ValueError('마지막 관리자는 지울 수 없습니다')
            self.users = [x for x in self.users if x['id'] != uid]; self.save_users()
            for sid in [k for k, v in self.sess.items() if v['user'] == uid]: self.sess.pop(sid, None)
            self._save(self.sess_f, self.sess)
    def public(self, u):
        return {'id': u['id'], 'name': u.get('name') or u['id'], 'role': u['role'], 'claude': bool((u.get('claude') or {}).get('token')),
                'claudeAt': (u.get('claude') or {}).get('at'), 'mustChange': bool(u.get('mustChange')), 'created': u.get('created')}
    def set_claude(self, uid, token):
        with LOCK:
            u = self.user(uid)
            if not u: raise ValueError('없는 계정')
            u['claude'] = {'token': token, 'at': int(time.time())} if token else {}
            self.save_users()
    def claude_token(self, uid): return ((self.user(uid) or {}).get('claude') or {}).get('token') or ''

    # ── 세션 ──
    def login(self, uid, pw):
        u = self.user(str(uid or '').strip().lower())
        if not u or not self.check_pw(u, str(pw or '')): raise ValueError('아이디나 비밀번호가 맞지 않습니다')
        sid = secrets.token_urlsafe(32)
        with LOCK:
            now = time.time(); self.sess = {k: v for k, v in self.sess.items() if v['exp'] > now}
            self.sess[sid] = {'user': u['id'], 'exp': now + SESSION_SEC}; self._save(self.sess_f, self.sess)
        return sid
    def logout(self, sid):
        with LOCK: self.sess.pop(sid, None); self._save(self.sess_f, self.sess)
    def who(self, sid):
        s = self.sess.get(sid or '')
        if not s or s['exp'] < time.time(): return None
        return self.user(s['user'])

    # ── 덱 ──
    def deck_dir(self, owner, did): return os.path.join(self.dir, 'decks', owner, did)
    def decks(self, owner=None):
        out = []; base = os.path.join(self.dir, 'decks')
        for o in sorted(os.listdir(base)) if os.path.isdir(base) else []:
            if owner and o != owner: continue
            if not owner and o.startswith(DEMO_PREFIX): continue   # 관리자 목록에 데모 사본은 넣지 않는다
            for d in sorted(os.listdir(os.path.join(base, o))) if os.path.isdir(os.path.join(base, o)) else []:
                m = self._load(os.path.join(base, o, d, 'meta.json'), None)
                if not m or m.get('importing'): continue   # 가져오는 중인 덱은 끝나야 목록에 나온다
                idx = os.path.join(base, o, d, 'index.html')
                out.append({'owner': o, 'id': d, 'title': m.get('title') or d, 'created': m.get('created'), 'updated': int(os.path.getmtime(idx)) if os.path.exists(idx) else m.get('created'),
                            'url': f'/d/{o}/{d}/', 'pages': len(re.findall(r'<section[^>]*class="[^"]*\bslide\b', open(idx, encoding='utf-8').read())) if os.path.exists(idx) else 0})
        return sorted(out, key=lambda x: -(x['updated'] or 0))
    def drop_importing(self):
        """가져오던 중 서버가 꺼진 덱(meta.importing)은 반쯤 만들어진 채라 지운다 — 켤 때 한 번"""
        base = os.path.join(self.dir, 'decks'); n = 0
        for o in os.listdir(base) if os.path.isdir(base) else []:
            for d in os.listdir(os.path.join(base, o)) if os.path.isdir(os.path.join(base, o)) else []:
                if (self._load(os.path.join(base, o, d, 'meta.json'), {}) or {}).get('importing'): shutil.rmtree(os.path.join(base, o, d), ignore_errors=True); n += 1
        return n
    def create_deck(self, owner, title, html, importing=False):
        did = time.strftime('%Y%m%d') + '-' + secrets.token_hex(3); d = self.deck_dir(owner, did)
        os.makedirs(os.path.join(d, 'img', 'uploads'), exist_ok=True)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(html)
        self._save(os.path.join(d, 'meta.json'), {'title': title, 'owner': owner, 'created': int(time.time()), **({'importing': True} if importing else {})})
        return did, d
    def rename_deck(self, owner, did, title):
        f = os.path.join(self.deck_dir(owner, did), 'meta.json'); m = self._load(f, None)
        if not m: raise ValueError('없는 덱')
        m['title'] = title; self._save(f, m)
    # ── 읽기 공유 ──
    def share_of(self, owner, did): return ((self._load(os.path.join(self.deck_dir(owner, did), 'meta.json'), {}) or {}).get('share') or {}).get('token') or ''
    def share_set(self, owner, did, on, renew=False):
        """on=True 면 토큰을 만들고(이미 있으면 그대로, renew 면 새로 — 옛 주소는 바로 끊김), False 면 끈다. 돌려주는 값 = 지금 토큰('' = 꺼짐)"""
        with LOCK:
            f = os.path.join(self.deck_dir(owner, did), 'meta.json'); m = self._load(f, None)
            if m is None: raise ValueError('없는 덱')
            old = (m.get('share') or {}).get('token') or ''
            if not on or renew:
                self.shares.pop(old, None); m.pop('share', None); old = ''
            if on and not old:
                old = secrets.token_urlsafe(18); m['share'] = {'token': old, 'at': int(time.time())}; self.shares[old] = (owner, did)
            self._save(f, m); return old
    def share_find(self, token):
        t = self.shares.get(token) or (self.pins.get(token) or (None,))[:2]
        return tuple(t) if t and len(t) == 2 and os.path.isfile(os.path.join(self.deck_dir(*t), 'index.html')) else None
    def share_ver(self, token):
        """고정 링크면 그 버전 id, 최신 링크면 None"""
        return (self.pins.get(token) or (None, None, None))[2]
    def pins_of(self, owner, did):
        return [dict(x) for x in ((self._load(os.path.join(self.deck_dir(owner, did), 'meta.json'), {}) or {}).get('pins') or [])]
    def pin_add(self, owner, did, ver, by=''):
        """버전 하나에 고정한 읽기 링크 — 같은 버전이면 있던 링크를 그대로(토큰이 늘어나지 않게). 돌려주는 값 = 토큰"""
        with LOCK:
            f = os.path.join(self.deck_dir(owner, did), 'meta.json'); m = self._load(f, None)
            if m is None: raise ValueError('없는 덱')
            pins = m.setdefault('pins', [])
            for x in pins:
                if x.get('ver') == ver: return x['token']
            tok = secrets.token_urlsafe(18); pins.append({'token': tok, 'ver': ver, 'at': int(time.time()), 'by': by}); self.pins[tok] = (owner, did, ver); self._save(f, m); return tok
    def pin_remove(self, owner, did, token):
        """고정 링크 끄기. 돌려주는 값 = (끈 링크의 버전, 같은 버전에 남은 링크가 있나)"""
        with LOCK:
            f = os.path.join(self.deck_dir(owner, did), 'meta.json'); m = self._load(f, None)
            if m is None: raise ValueError('없는 덱')
            gone = next((x for x in m.get('pins') or [] if x.get('token') == token), None)
            if not gone: raise ValueError('없는 링크')
            m['pins'] = [x for x in m['pins'] if x.get('token') != token]
            if not m['pins']: m.pop('pins')
            self.pins.pop(token, None); self._save(f, m); return gone['ver'], any(x.get('ver') == gone['ver'] for x in m.get('pins') or [])
    def share_clear(self, owner, did):
        """최신 링크 · 고정 링크를 모두 끊는다(덱을 휴지통으로 보낼 때)"""
        with LOCK:
            f = os.path.join(self.deck_dir(owner, did), 'meta.json'); m = self._load(f, None)
            if m is None: return
            for x in m.get('pins') or []: self.pins.pop(x.get('token'), None)
            self.shares.pop((m.get('share') or {}).get('token') or '', None); m.pop('share', None); m.pop('pins', None); self._save(f, m)

    def delete_deck(self, owner, did):
        d = self.deck_dir(owner, did)
        if not os.path.isdir(d): raise ValueError('없는 덱')
        self.share_clear(owner, did)   # 휴지통으로 가면 공유 주소(최신 · 버전 고정)도 모두 끊는다(되살려도 새로 켜야)
        trash = os.path.join(self.dir, 'trash', owner); os.makedirs(trash, exist_ok=True)   # 바로 지우지 않고 휴지통으로(되살릴 수 있게)
        shutil.move(d, os.path.join(trash, f'{did}-{int(time.time())}'))
