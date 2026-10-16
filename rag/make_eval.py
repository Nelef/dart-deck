# 평가 세트 — 정답을 사람이 고르지 않고 OpenDART 정형 API 값에서 만든다.
#   python3 rag/make_eval.py → rag/data/gold.json(API 원값) · rag/eval/questions.json(질문 · 정답 · 정답 청크 · dev/test)
# 질문 종류: 매출액 · 영업이익 · 당기순이익(2025, 연결 우선) · 최대주주. 정답 청크 = 같은 회사 청크 중 정답 값(백만원 · 천원 · 원 표기)이 든 것.
# 다른 회사 보고서에도 같은 숫자가 나온다(최대주주의 재무 현황 등) — 그래서 '같은 회사'가 조건이고, 회사 필터의 효과를 잴 수 있다.
# 범위 밖: 코퍼스에 없는 회사 질문 → 답하지 말아야 한다. dev / test 는 회사 단위로 나눈다(test 는 설정 결정에 쓰지 않는다).
import os, json, time, zlib, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import get, DATA

EVAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'eval')
ACCTS = [('매출액', ('매출액', '수익(매출액)', '영업수익')), ('영업이익', ('영업이익', '영업이익(손실)')), ('당기순이익', ('당기순이익', '당기순이익(손실)'))]
OUT_OF_SCOPE = ['에코프로비엠', '알테오젠', '삼양식품', '한진칼', '아시아나항공', '셀트리온제약', '리노공업', 'HLB', '펄어비스', '휴젤']

def fin(corp_code):
    j = json.loads(get('fnlttSinglAcnt.json', corp_code=corp_code, bsns_year='2025', reprt_code='11011'))
    rows = j.get('list') or []
    fs = 'CFS' if any(r['fs_div'] == 'CFS' for r in rows) else 'OFS'
    out = {}
    for key, names in ACCTS:
        r = next((r for r in rows if r['fs_div'] == fs and r['account_nm'] in names and (r.get('thstrm_amount') or '').replace(',', '').lstrip('-').isdigit()), None)
        if r: out[key] = {'won': int(r['thstrm_amount'].replace(',', '')), 'fs': fs, 'acct': r['account_nm']}
    return out

def holder(corp_code):
    j = json.loads(get('hyslrSttus.json', corp_code=corp_code, bsns_year='2025', reprt_code='11011'))
    r = next((r for r in j.get('list') or [] if '본인' in (r.get('relate') or '') and r.get('nm') and r['nm'] != '계'), None)
    return r['nm'].strip() if r else None

def forms(won):
    """보고서 본문에 나올 수 있는 표기 — 백만원 · 천원 · 원(콤마)"""
    out = []
    for unit in (1_000_000, 1_000, 1):
        if won % unit == 0 or unit > 1:
            v = abs(won) // unit if won % unit == 0 else round(abs(won) / unit)
            if v >= 100: out.append(f'{v:,}')
    return out

def main():
    reps = json.load(open(os.path.join(DATA, 'reports.json'), encoding='utf-8'))
    gf = os.path.join(DATA, 'gold.json')
    gold = json.load(open(gf, encoding='utf-8')) if os.path.exists(gf) else {}
    for r in reps:
        if r['stock'] in gold: continue
        try: gold[r['stock']] = {'name': r['name'], 'fin': fin(r['corp_code']), 'holder': holder(r['corp_code'])}
        except Exception as e: print(r['name'], '실패', e)
        time.sleep(0.3)
    json.dump(gold, open(gf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    by_stock = {}
    for line in open(os.path.join(DATA, 'chunks.jsonl'), encoding='utf-8'):
        c = json.loads(line); by_stock.setdefault(c['stock'], []).append(c)
    qs = []; tmpl = {'매출액': '{n}의 2025년 매출액은 얼마인가요?', '영업이익': '{n} 2025년 영업이익 알려줘', '당기순이익': '{n}의 2025년 당기순이익은?'}
    for sc, g in gold.items():
        split = 'test' if zlib.crc32(sc.encode()) % 3 == 0 else 'dev'   # 회사 단위로 약 1/3 을 test
        cs = by_stock.get(sc, [])
        for key, v in g['fin'].items():
            fm = forms(v['won'])
            hit = [c['id'] for c in cs if any(f in c['text'] for f in fm)]
            if hit: qs.append({'id': f'{sc}-{key}', 'split': split, 'kind': key, 'stock': sc, 'name': g['name'], 'q': tmpl[key].format(n=g['name']),
                               'answer_won': v['won'], 'forms': fm, 'fs': v['fs'], 'gold': hit})
        h = g.get('holder')
        if h:
            hit = [c['id'] for c in cs if h in c['text'] and '최대주주' in c['text']]
            if hit: qs.append({'id': f'{sc}-최대주주', 'split': split, 'kind': '최대주주', 'stock': sc, 'name': g['name'], 'q': f"{g['name']}의 최대주주는 누구야?", 'answer': h, 'gold': hit})
    for i, n in enumerate(OUT_OF_SCOPE):
        qs.append({'id': f'oos-{i}', 'split': 'test' if i % 2 else 'dev', 'kind': '범위 밖', 'name': n, 'q': f'{n}의 2025년 매출액은 얼마인가요?', 'gold': []})
    os.makedirs(EVAL, exist_ok=True)
    json.dump(qs, open(os.path.join(EVAL, 'questions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    from collections import Counter
    print('질문', len(qs), Counter((q['split'], q['kind']) for q in qs))
    print('정답 청크 수(중앙값)', sorted(len(q['gold']) for q in qs if q['gold'])[len([q for q in qs if q['gold']]) // 2])

if __name__ == '__main__': main()
