# 웹 읽기 관문 — Claude Code 의 PreToolUse 훅(deckagent.py 가 [웹 검색] 켠 부탁에만 --settings 로 건다).
# 왜: 웹 검색을 켜면(사용자 지정 2026-09-30 "웹 검색 켜기") AI 가 웹 페이지를 읽는데, 페이지 안에 적힌 지시를 따라
#   덱 내용을 주소에 실어 외부로 보내는 길(프롬프트 주입 → 유출)이 생긴다. 그래서 WebFetch 는 **이 대화에서 검색 결과로 나왔거나
#   사용자가 직접 적은 주소만** 연다 — AI 가 스스로 지어낸 주소(쿼리 문자열에 덱 글을 붙인 것 등)는 막는다.
# 판정 재료: 훅이 받는 transcript_path(이 세션 기록 JSONL)의 user 줄(사용자 부탁 · 도구 결과). 조수가 낸 줄(도구 호출)은 보지 않는다 —
#   지금 막으려는 호출 자체가 거기 적혀 있어서다.
# 막으면 종료 코드 2 + 표준 오류의 까닭이 Claude 에게 그대로 전달된다(다른 주소를 찾게).
import sys, json, urllib.parse

def norm(u):
    """비교용 — 조각(#) · 끝 / 를 떼고 소문자 호스트"""
    p = urllib.parse.urlsplit(u.strip())
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip('/'), p.query, ''))

def seen_text(path):
    """세션 기록에서 사용자 쪽 줄(부탁 글 · 도구 결과)의 글을 모은다"""
    out = []
    try:
        for ln in open(path, encoding='utf-8'):
            try: j = json.loads(ln)
            except ValueError: continue
            if j.get('type') == 'user': out.append(json.dumps(j.get('message') or {}, ensure_ascii=False))
    except OSError: pass
    return urllib.parse.unquote('\n'.join(out)).replace('\\/', '/')

def allowed(url, text):
    if not url.startswith(('http://', 'https://')): return False
    n = norm(url); cands = {url, url.rstrip('/'), n}
    return any(c and c in text for c in cands) or n in {norm(x) for x in _urls(text)}

def _urls(text):
    import re
    return re.findall(r'https?://[^\s"\'<>\\)\]]+', text)

def main():
    try: j = json.load(sys.stdin)
    except ValueError: sys.exit(0)
    if j.get('tool_name') != 'WebFetch': sys.exit(0)
    url = str((j.get('tool_input') or {}).get('url') or '')
    if allowed(url, seen_text(j.get('transcript_path') or '')): sys.exit(0)
    sys.stderr.write(f'이 주소는 열 수 없습니다: 검색 결과에 나왔거나 사용자가 적은 주소만 엽니다(덱 내용이 밖으로 나가지 않게). 먼저 WebSearch 로 찾고, 결과에 나온 주소를 그대로 쓰세요. ({url[:120]})')
    sys.exit(2)

if __name__ == '__main__':
    main()
