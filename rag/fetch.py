# DART 사업보고서 원문 받기 — OpenDART(개인 인증키 .env 의 DART_API_KEY). 표준 라이브러리만.
#   python3 rag/fetch.py            → rag/data/raw/<종목코드>_<접수번호>.zip + rag/data/reports.json(회사 · 접수번호 · 보고서명)
# 대상: 유가증권시장 대형사(아래 STOCKS, 종목코드). 2025 회계연도 사업보고서(2026년 제출). 고유번호는 corpCode.xml 에서 찾는다.
import os, sys, json, time, zipfile, io, urllib.request, urllib.parse, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, 'data'); RAW = os.path.join(DATA, 'raw')
API = 'https://opendart.fss.or.kr/api'

def key():
    k = os.environ.get('DART_API_KEY')
    if not k:
        for line in open(os.path.join(HERE, '..', '.env'), encoding='utf-8'):
            if line.startswith('DART_API_KEY='): k = line.split('=', 1)[1].strip()
    if not k: sys.exit('DART_API_KEY 가 없습니다(.env)')
    return k

# 유가증권시장 대형사 — 업종이 고르게 섞이게(반도체 · 2차전지 · 자동차 · 금융 · 통신 · 플랫폼 · 바이오 · 조선 · 소비재 · 건설 · 에너지)
STOCKS = '''005930 000660 373220 207940 005380 000270 068270 105560 055550 005490 035420 035720 006400 051910 012330 028260 086790 032830
000810 316140 024110 015760 096770 017670 030200 066570 003550 034730 010130 329180 012450 034020 259960 009150 018260 003670 011200
003490 090430 051900 097950 011170 010950 009540 267250 000720 010140 042660 138040 006800 016360 005940 071050 033780 139480 023530
036570 251270 352820 032640 402340 042700 006260 010120 004800 036460 047810 086280 004020 021240 271560 004370 000100 128940 326030
028050 006360 078930 009830 000880 011780 241560 001040 004170 069960 282330 005830 001450 029780 138930 175330 323410 377300 039490
047040 307950 047050 001230 112610'''.split()

def get(path, **q):
    url = f'{API}/{path}?' + urllib.parse.urlencode({'crtfc_key': key(), **q})
    for i in range(3):
        try: return urllib.request.urlopen(url, timeout=120).read()
        except Exception as e:
            if i == 2: raise
            time.sleep(2 + i * 3)

def corp_map():
    tree = ET.parse(os.path.join(RAW, 'CORPCODE.xml'))
    return {e.findtext('stock_code').strip(): (e.findtext('corp_code'), e.findtext('corp_name')) for e in tree.getroot() if (e.findtext('stock_code') or '').strip()}

def latest_annual(corp_code):
    """2026년에 낸 사업보고서(A001) 중 가장 최근 것 — 정정 공시면 정정본"""
    j = json.loads(get('list.json', corp_code=corp_code, bgn_de='20260101', end_de=time.strftime('%Y%m%d'), pblntf_ty='A', pblntf_detail_ty='A001', page_count=20))
    items = [x for x in j.get('list') or [] if '사업보고서' in x.get('report_nm', '')]
    return max(items, key=lambda x: x['rcept_dt'] + x['rcept_no']) if items else None

def main():
    os.makedirs(RAW, exist_ok=True); cm = corp_map(); out = []
    for i, sc in enumerate(STOCKS, 1):
        if sc not in cm: print(f'[{i}] {sc} 고유번호 없음 — 건너뜀'); continue
        cc, name = cm[sc]
        try:
            r = latest_annual(cc)
            if not r: print(f'[{i}] {name} 사업보고서 없음'); continue
            f = os.path.join(RAW, f"{sc}_{r['rcept_no']}.zip")
            if not os.path.exists(f):
                b = get('document.xml', rcept_no=r['rcept_no'])
                if not b.startswith(b'PK'): print(f'[{i}] {name} 원문 실패: {b[:120]!r}'); continue
                open(f, 'wb').write(b); time.sleep(0.4)
            out.append({'stock': sc, 'corp_code': cc, 'name': name, 'rcept_no': r['rcept_no'], 'report_nm': r['report_nm'].strip(), 'rcept_dt': r['rcept_dt'], 'file': os.path.basename(f), 'bytes': os.path.getsize(f)})
            print(f"[{i}] {name} {r['report_nm'].strip()} {r['rcept_no']} {os.path.getsize(f) // 1024}KB")
        except Exception as e:
            print(f'[{i}] {name} 오류: {e}')
        time.sleep(0.3)
    json.dump(out, open(os.path.join(DATA, 'reports.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'완료 {len(out)}개사 · {sum(x["bytes"] for x in out) // 1048576}MB')

if __name__ == '__main__': main()
