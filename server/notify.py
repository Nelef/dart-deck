# 텔레그램 알림 — 남(데모 방문자 · 관리자가 아닌 계정)이 주인 Claude 구독(공유 토큰)으로 AI 를 써서 토큰이 나갈 때 알린다(사용자 지정 2026-10-27
# "ai기능을 사용해서 클로드 토큰이 소모되면 알려주도록 해줘"). TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID(청약 레이더와 같은 봇)가 없으면 아무것도 안 한다.
# 보내기는 따로 도는 스레드에서 — 알림이 늦거나 실패해도 AI 작업은 영향받지 않는다
import os, sys, json, threading, urllib.request


def send(text):
    tok, chat = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip(), os.environ.get('TELEGRAM_CHAT_ID', '').strip()
    if not tok or not chat: return

    def go():
        try:
            body = json.dumps({'chat_id': chat, 'text': text[:3500], 'disable_web_page_preview': True}).encode('utf-8')
            rq = urllib.request.Request(f'https://api.telegram.org/bot{tok}/sendMessage', data=body, headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(rq, timeout=8).read()
        except Exception as e:
            sys.stderr.write(f'알림 실패: {type(e).__name__}\n')
    threading.Thread(target=go, daemon=True).start()


def agent_used(req, result, timed=False, stopped=False):
    """Claude Code 한 번(부탁 하나)이 끝났을 때 — 누가, 무엇을, 결과, 걸린 시간, 토큰, 비용"""
    n = req.get('_notify') or {}
    r = result or {}
    u = r.get('usage') or {}
    status = '멈춤' if stopped else '시간 초과' if timed else '실패' if (not r or r.get('is_error')) else '완료'
    models = ', '.join((r.get('modelUsage') or {}).keys()) or str(req.get('model') or '?')
    cache = (u.get('cache_read_input_tokens') or 0) + (u.get('cache_creation_input_tokens') or 0)
    ask = '새 발표 자료 만들기' if req.get('build') else ' '.join(str(req.get('display') or req.get('prompt') or '').split())[:80]
    lines = [f"[uyai AI PPT] Claude 사용: {n.get('who', '?')}",
             f"부탁: {ask}",
             f"결과: {status}, {round((r.get('duration_ms') or 0) / 1000)}초, {models}",
             f"토큰: 입력 {u.get('input_tokens') or 0:,}(캐시 {cache:,}) / 출력 {u.get('output_tokens') or 0:,}, 약 ${float(r.get('total_cost_usd') or 0):.3f}"]
    if n.get('day'): lines.append(f"오늘 데모 부탁 {n['day']}")
    send('\n'.join(lines))
