# 사업보고서 원문(XML) → 장 · 절 단위 글 → 청크(rag/data/chunks.jsonl). 표준 라이브러리만.
#   python3 rag/parse.py [--max N]
# DART XML 은 형식이 엄격하지 않아(이스케이프 안 된 & 등) XML 파서 대신 정규식으로 너그럽게 읽는다.
# 청크 = 회사 · 연도 · 장 > 절 머리 + 본문 창(약 800자, 겹침 100자). 표는 행마다 "칸 | 칸" 글로 편다.
import os, re, json, sys, zipfile, html

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, 'data'); RAW = os.path.join(DATA, 'raw')
WIN, OVER = 800, 100

TAG = re.compile(r'<[^>]+>')
def clean(s):
    s = html.unescape(TAG.sub('', s)).replace('\xa0', ' ')
    return re.sub(r'[ \t]+', ' ', s).strip()

def to_text(block):
    """장 · 절 본문 XML → 글. 표 행은 칸을 ' | ' 로, 문단은 줄로"""
    block = re.sub(r'<(IMAGE|LIBRARY|PGBRK)[^>]*>.*?</\1>|<PGBRK[^>]*/?>', '', block, flags=re.S)
    def row(m):
        cells = [clean(c) for c in re.findall(r'<(?:TD|TE|TH|TU)[^>]*>(.*?)</(?:TD|TE|TH|TU)>', m.group(0), flags=re.S)]
        cells = [c for c in cells if c]
        return ('\n' + ' | '.join(cells) + '\n') if cells else '\n'
    block = re.sub(r'<TR[^>]*>.*?</TR>', row, block, flags=re.S)
    block = re.sub(r'</?(P|TABLE|TABLE-GROUP|TBODY|THEAD|BR)[^>]*>', '\n', block)
    lines = [clean(l) for l in block.split('\n')]
    return '\n'.join(l for l in lines if l)

def sections(xml):
    """(장 제목, 절 제목, 본문 글) 목록 — 제목(TITLE) 사이를 그 절의 본문으로 본다"""
    marks = [(m.start(), m.end(), int(m.group(1)), clean(m.group(2))) for m in re.finditer(r'<SECTION-(\d)[^>]*>\s*<TITLE[^>]*>(.*?)</TITLE>', xml, flags=re.S)]
    out = []; s1 = s2 = ''
    for i, (a, b, lv, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(xml)
        if lv == 1: s1, s2 = title, ''
        else: s2 = title if lv == 2 else (s2 + ' > ' + title if s2 else title)
        text = to_text(xml[b:end])
        if text: out.append((s1, s2, text))
    return out

def windows(text):
    """줄 경계를 살려 약 WIN 자 창으로 자르고, 다음 창은 앞 창의 끝 OVER 자를 겹쳐 시작"""
    out, cur = [], ''
    for line in text.split('\n'):
        while len(line) > WIN:   # 아주 긴 줄(긴 표 행 · 긴 문단)은 잘라 넣는다
            out.append((cur + '\n' + line[:WIN]).strip()); cur = line[WIN - OVER:WIN]; line = line[WIN:]
        if len(cur) + len(line) + 1 > WIN and cur:
            out.append(cur.strip()); cur = cur[-OVER:]
        cur += '\n' + line
    if cur.strip(): out.append(cur.strip())
    return [w for w in out if len(w) >= 40]

def main():
    mx = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 0
    reps = json.load(open(os.path.join(DATA, 'reports.json'), encoding='utf-8'))
    if mx: reps = reps[:mx]
    n = 0; per = []
    with open(os.path.join(DATA, 'chunks.jsonl'), 'w', encoding='utf-8') as fo:
        for r in reps:
            z = zipfile.ZipFile(os.path.join(RAW, r['file']))
            names = [x for x in z.namelist() if x.endswith('.xml')]
            main_xml = next((x for x in names if re.fullmatch(r'\d{14}\.xml', x)), None) or max(names, key=lambda x: z.getinfo(x).file_size)   # 본문(첨부 감사보고서 _00760 등은 뺀다) — 이름 규칙이 다르면 가장 큰 것
            xml = z.read(main_xml).decode('utf-8', errors='replace')
            year = re.search(r'\((\d{4})\.\d{2}\)', r['report_nm']); year = year.group(1) if year else ''
            k = 0
            for s1, s2, text in sections(xml):
                head = f"{r['name']} · {year} 사업보고서 · {s1}" + (f" > {s2}" if s2 else '')
                for w in windows(text):
                    fo.write(json.dumps({'id': f"{r['stock']}-{k}", 'stock': r['stock'], 'name': r['name'], 'year': year, 'rcept_no': r['rcept_no'],
                                         'sec1': s1, 'sec2': s2, 'head': head, 'text': w}, ensure_ascii=False) + '\n')
                    k += 1
            per.append((r['name'], k)); n += k
    per.sort(key=lambda x: -x[1])
    print(f'청크 {n:,}개 · {len(reps)}개사 · 회사당 평균 {n // max(1, len(reps))} · 많은 곳 {per[:3]} · 적은 곳 {per[-3:]}')

if __name__ == '__main__': main()
