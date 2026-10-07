# 덱 버전 기록 — 구글 문서의 「버전 기록」처럼 저장할 때마다 그 시점의 덱을 남기고 골라 복원한다(사용자 지정 2026-10-06).
# 덱 폴더 .versions/ (숨김 — 웹으로는 안 준다)
#   index.json   {"legacy": 옛 백업을 들여왔나, "items": [{id, t, u(계정), k(종류), l(설명), h(sha256), z(압축 크기), chg(바뀐 페이지 요약), f(처음 바뀐 페이지 번호)}]}  오래된 순
#   <id>.html.gz 그 시점의 index.html 전체(gzip). 사진 · PPT 쪽 그림은 덱 폴더에 따로 있고 지우지 않으므로 버전에는 안 넣는다 — 한 번에 수십 KB(압축 30~40%)
# 한 항목 = 변경이 **끝난 뒤**의 덱 상태. 맨 위는 늘 지금 덱(index.html) — 같은 상태면 그 항목이 「현재 버전」, 기록이 없던 상태면 따로 보인다
# 보관: 최근 30일은 전부, 그 이전은 하루에 마지막 것 하나, 전체 최대 200개(가장 새 것은 늘 남긴다)
import os, re, json, time, gzip, glob, hashlib, secrets, threading, datetime

LOCK = threading.RLock()
KEEP_ALL_SEC = 30 * 86400
KEEP_MAX = 200
KINDS = ('create', 'import', 'build', 'ai', 'edit', 'undo', 'restore', 'legacy', 'share', 'copy')   # 만듦 · 가져옴 · AI 가 새로 만듦 · AI 수정 · 직접 수정 · 되돌리기 · 복원 · 옛 기록
ID_RE = re.compile(r'\d{9,11}-[0-9a-f]{4}')

def vdir(d): return os.path.join(d, '.versions')
def sha(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()

def _load(d):
    try:
        j = json.load(open(os.path.join(vdir(d), 'index.json'), encoding='utf-8'))
        if isinstance(j, dict) and isinstance(j.get('items'), list): return j
    except (OSError, ValueError): pass
    return {'legacy': False, 'items': []}

def _save(d, idx):
    os.makedirs(vdir(d), exist_ok=True); f = os.path.join(vdir(d), 'index.json'); tmp = f + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(json.dumps(idx, ensure_ascii=False)); os.replace(tmp, f)

def _write(d, vid, text):
    os.makedirs(vdir(d), exist_ok=True); f = os.path.join(vdir(d), f'{vid}.html.gz'); tmp = f + '.tmp'
    with gzip.open(tmp, 'wb', compresslevel=6) as g: g.write(text.encode('utf-8'))
    os.replace(tmp, f); return os.path.getsize(f)

def read(d, vid):
    """버전 id → 그때의 덱 HTML(없으면 None). 'current' = 지금 파일"""
    if vid == 'current':
        try: return open(os.path.join(d, 'index.html'), encoding='utf-8').read()
        except OSError: return None
    if not ID_RE.fullmatch(str(vid)): return None
    try:
        with gzip.open(os.path.join(vdir(d), f'{vid}.html.gz'), 'rb') as g: return g.read().decode('utf-8')
    except OSError: return None

def _new_id(items, t):
    ids = {x['id'] for x in items}
    while True:
        vid = f'{int(t)}-{secrets.token_hex(2)}'
        if vid not in ids: return vid

def _legacy(d, idx):
    """예전 방식(.edits/index.<시각>.bak — 고치기 직전 사본)을 한 번 들여온다. 파일은 그대로 두고(되돌리기 단추가 계속 쓴다) 목록에는 이 기록만 쓴다"""
    if idx.get('legacy'): return
    last = None
    for f in sorted(glob.glob(os.path.join(d, '.edits', 'index.*.bak*'))):
        m = re.search(r'index\.(\d{8}-\d{6})\.bak', os.path.basename(f))
        if not m: continue
        try: text = open(f, encoding='utf-8').read(); t = datetime.datetime.strptime(m.group(1), '%Y%m%d-%H%M%S').timestamp()
        except (OSError, ValueError): continue
        h = sha(text)
        if h == last: continue
        last = h; vid = _new_id(idx['items'], t); z = _write(d, vid, text)
        idx['items'].append({'id': vid, 't': int(t), 'u': '', 'k': 'legacy', 'l': '이전 기록 — 이 시각의 수정 직전 상태', 'h': h, 'z': z})
    idx['items'].sort(key=lambda x: x['t']); idx['legacy'] = True

def _prune(d, idx, now):
    items = sorted(idx['items'], key=lambda x: x['t']); keep = []; seen_day = set()
    for x in reversed(items):   # 새 것부터
        day = datetime.date.fromtimestamp(x['t']).isoformat()
        if x.get('pin'): keep.append(x); continue   # 공유 링크가 가리키는 버전은 늘 남긴다(개수 상한에도 안 걸린다)
        if now - x['t'] <= KEEP_ALL_SEC or x is items[-1]: keep.append(x)
        elif day not in seen_day: keep.append(x); seen_day.add(day)   # 30일 지난 것은 하루의 마지막 것만
        if sum(1 for k in keep if not k.get('pin')) >= KEEP_MAX: break
    gone = {x['id'] for x in items} - {x['id'] for x in keep}
    for vid in gone:
        try: os.remove(os.path.join(vdir(d), f'{vid}.html.gz'))
        except OSError: pass
    keep.reverse(); idx['items'] = keep   # 새 것부터 모았으니 뒤집어 오래된 순으로 — t 로 다시 정렬하면 같은 초에 남긴 두 버전의 앞뒤가 바뀐다

def snapshot(d, text, before, who, kind, label='', diff=None, t=None):
    """변경이 끝난 덱 text 를 한 버전으로 남긴다. before = 변경 직전 내용(없으면 None) — 기록에 없던 상태면 그것도 먼저 남긴다.
    diff(prev_text, text) → {c: 바뀐 페이지, a: 추가, r: 삭제, o: 공용 변경, f: 처음 바뀐 페이지 번호} 를 항목에 적는다. 같은 내용이 연달아면 새로 안 남기고 그 id 를 돌려준다"""
    now = t or time.time(); kind = kind if kind in KINDS else 'edit'
    with LOCK:
        idx = _load(d); _legacy(d, idx); items = idx['items']
        if before is not None and (not items or items[-1]['h'] != sha(before)):   # 기록에 없던 변경 직전 상태 — 덱 만든 시각 · 마지막 기록 직후로 둔다
            t0 = items[-1]['t'] + 1 if items else _created(d) or int(now) - 1
            vid = _new_id(items, t0); z = _write(d, vid, before)
            items.append({'id': vid, 't': int(t0), 'u': '', 'k': 'legacy', 'l': '이전 상태(기록 시작 전)', 'h': sha(before), 'z': z})
        h = sha(text)
        if items and items[-1]['h'] == h: _save(d, idx); return items[-1]['id']
        prev = read(d, items[-1]['id']) if items else None
        vid = _new_id(items, now); z = _write(d, vid, text)
        it = {'id': vid, 't': int(now), 'u': who or '', 'k': kind, 'l': str(label or '')[:120], 'h': h, 'z': z}
        if diff and prev is not None:
            try:
                c = diff(prev, text) or {}
                if c: it['chg'] = {k: c[k] for k in ('c', 'a', 'r', 'o', 'nc', 'na', 'nr') if c.get(k)}; it['f'] = int(c.get('f') or 0)
                it['cd'] = 1
            except Exception: pass
        items.append(it); _prune(d, idx, now); _save(d, idx); return vid

def _created(d):
    try: return int((json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8')) or {}).get('created') or 0)
    except (OSError, ValueError): return 0

BACKFILL_MAX = 30   # 한 번 열 때 옛 기록의 바뀐 페이지 요약을 채우는 최대 개수(덱이 크면 비교가 느려서 나눠서 — 열 때마다 이어 채운다)

def _backfill(d, idx, diff):
    """요약(chg)이 없는 기록 — 옛 .edits 에서 들여온 것 등 — 을 바로 앞 기록과 비교해 채운다. 새 것부터, 한 번에 BACKFILL_MAX 개"""
    items = idx['items']; n = 0; changed = False
    for i in range(len(items) - 1, 0, -1):
        if items[i].get('cd'): continue
        if n >= BACKFILL_MAX: break
        n += 1; a, b = read(d, items[i - 1]['id']), read(d, items[i]['id'])
        try: c = diff(a, b) if a is not None and b is not None else {}
        except Exception: c = {}
        if c: items[i]['chg'] = {k: c[k] for k in ('c', 'a', 'r', 'o', 'nc', 'na', 'nr') if c.get(k)}; items[i]['f'] = int(c.get('f') or 0)
        items[i]['cd'] = 1; changed = True
    return changed

def listing(d, diff=None):
    """새 것부터. 맨 위는 지금 덱 — 기록의 마지막과 같은 상태면 그 항목이 current, 아니면 기록 없는 current 를 따로 붙인다.
    diff 가 있으면 요약이 없는 옛 기록을 일부 채운다"""
    with LOCK:
        idx = _load(d); dirty = False
        if not idx.get('legacy'): _legacy(d, idx); dirty = True
        if diff and _backfill(d, idx, diff): dirty = True
        if dirty: _save(d, idx)
        items = [dict(x) for x in idx['items']]
    try: cur = open(os.path.join(d, 'index.html'), encoding='utf-8').read(); mt = int(os.path.getmtime(os.path.join(d, 'index.html')))
    except OSError: cur, mt = None, 0
    out = list(reversed(items))
    if cur is not None:
        hc = sha(cur)
        for x in out:
            if x['h'] == hc: x['same'] = True   # 지금과 내용이 같은 옛 버전(복원해도 그대로라 복원 단추를 숨긴다)
        if out and out[0]['h'] == hc: out[0]['current'] = True
        else: out.insert(0, {'id': 'current', 't': mt, 'u': '', 'k': 'legacy', 'l': '현재 상태(기록 없음)', 'current': True, 'same': True})
    return out

def set_pin(d, vid, on):
    """공유 링크가 가리키는 버전 표시 — 켜 있으면 보관 정리에서 안 지운다"""
    with LOCK:
        idx = _load(d)
        for x in idx['items']:
            if x['id'] == vid:
                if on: x['pin'] = 1
                else: x.pop('pin', None)
                _save(d, idx); return True
    return False

def get(d, vid):
    for x in listing(d):
        if x['id'] == vid: return x
    return None
