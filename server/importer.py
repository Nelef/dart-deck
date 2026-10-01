# 기존 PPT · PDF 를 덱으로 가져오기 — 슬라이드마다 원본 모양 그대로의 그림 한 장(사용자 지정 2026-09-30 "기존 ppt 를 그대로 마이그레이션").
# 순서: (pptx · ppt) LibreOffice 로 PDF → pdftoppm 으로 쪽 그림(JPEG, 가로 2400px — 무대 1600px 의 1.5배라 확대해도 선명) → 덱 HTML.
#   · 글은 pdftotext 로 쪽마다 뽑아 덱에 싣는다(AI 패널 문맥 · [편집 가능하게 바꾸기] 재료). pptx 는 발표자 메모도 붙인다
#   · pptx 는 쪽마다 **들어 있던 사진 원본 파일**도 꺼내 둔다(img/uploads/ · const PPT[쪽].media) — 쪽 그림 속에 구워진 사진은 따로 못 쓰니,
#     [편집 가능하게 바꾸기] 때 Claude 가 이 파일을 <img> 로 다시 쓴다(사용자 지적 2026-10-01 "ppt 의 내용 및 사진들은 가지고 있어야 AI 가 수정 가능한 걸로 변환")
#   · 페이지는 data-frozen(스크립트가 다시 그리지 않음) + data-import(몇 번째 원본 쪽인지). 고치고 싶은 페이지만 Claude 가 우리 엔진 HTML 로 바꾼다
# 왜 그림인가: 글상자 · 도형을 HTML 로 옮기는 규칙 변환은 차트 · 스마트아트 · 효과에서 모양이 어긋난다 — "그대로"가 먼저라 그림으로 들여오고,
#   편집이 필요한 페이지만 바꾸는 쪽을 골랐다(사용자 선택 2026-09-30). 한계: 그림 페이지의 글은 ✎ 편집으로 못 고친다 · 동영상 · 애니메이션은 빠진다
import os, re, json, shutil, hashlib, subprocess, tempfile, zipfile, posixpath, html as htmlmod
import xml.etree.ElementTree as ET

MAX = 40_000_000
SOFFICE = os.environ.get('PPT_SOFFICE') or shutil.which('soffice') or shutil.which('libreoffice') or ('/Applications/LibreOffice.app/Contents/MacOS/soffice' if os.path.exists('/Applications/LibreOffice.app/Contents/MacOS/soffice') else '')

def _notes(pptx):
    """pptx 발표자 메모 — {슬라이드 번호: 글}"""
    out = {}
    try:
        z = zipfile.ZipFile(pptx)
        for n in z.namelist():
            m = re.fullmatch(r'ppt/notesSlides/notesSlide(\d+)\.xml', n)
            if not m: continue
            xml = z.read(n).decode('utf-8', 'replace')
            t = [htmlmod.unescape(''.join(re.findall(r'<a:t>(.*?)</a:t>', p, re.S))).strip() for p in re.findall(r'<a:p[ >].*?</a:p>', xml, re.S)]
            t = [x for x in t if x and not x.isdigit()]
            if t: out[int(m.group(1))] = '\n'.join(t)
    except Exception:
        pass
    return out

WEB_IMG = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')   # 브라우저가 그대로 그리는 것만(EMF · WMF · TIFF 는 쪽 그림에서 본다)
_NS_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'
_NS_R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
_NS_SLD = '{http://schemas.openxmlformats.org/presentationml/2006/main}sldId'

def slide_media(pptx, up, per_slide=20):
    """pptx 쪽마다 들어 있던 사진 원본 → ({보이는 순서 k: ['img/uploads/<해시>.<확장자>', …]}, {k: 웹에서 못 쓰는 형식이라 뺀 개수}).
    순서는 파일 이름(slideN)이 아니라 presentation.xml 의 슬라이드 목록 — 쪽을 옮긴 PPT 에서 어긋나지 않게. 쪽 안에서 나온 순서(앞에 있는 것이 먼저).
    쪽 틀(레이아웃 · 마스터)의 로고 · 배경은 뺀다. 원본 파일이라 PPT 에서 잘라(crop) 쓴 사진도 잘리기 전 전체다"""
    out, skipped = {}, {}
    try:
        z = zipfile.ZipFile(pptx); names = set(z.namelist())
        def rels(path):
            return {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read(path)).iter(_NS_REL)} if path in names else {}
        def full(base, target):
            return posixpath.normpath(target.lstrip('/')) if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base), target))
        prel = rels('ppt/_rels/presentation.xml.rels')
        order = [full('ppt/presentation.xml', prel[e.get(_NS_R)]) for e in ET.fromstring(z.read('ppt/presentation.xml')).iter(_NS_SLD) if e.get(_NS_R) in prel]
        os.makedirs(up, exist_ok=True)
        k = 0
        for sp in order:
            if sp not in names: continue
            xml = z.read(sp).decode('utf-8', 'replace')
            if re.search(r'<p:sld\b[^>]*\bshow="0"', xml): continue   # 숨긴 슬라이드는 PDF 로 내보낼 때 빠진다 — 쪽 번호가 어긋나지 않게 세지 않는다
            k += 1
            rl = rels(posixpath.join(posixpath.dirname(sp), '_rels', posixpath.basename(sp) + '.rels'))
            ids = []
            for rid in re.findall(r'r:embed="([^"]+)"', xml):
                if rid not in ids: ids.append(rid)
            got = []
            for rid in ids:
                t = rl.get(rid)
                if not t: continue
                mp = full(sp, t)
                if not mp.startswith('ppt/media/') or mp not in names: continue
                ext = os.path.splitext(mp)[1].lower()
                if ext not in WEB_IMG: skipped[k] = skipped.get(k, 0) + 1; continue
                b = z.read(mp)
                if len(b) < 400: continue   # 점 · 줄 같은 조각
                fn = hashlib.sha1(b).hexdigest()[:16] + ('.jpg' if ext == '.jpeg' else ext); fp = os.path.join(up, fn)
                if not os.path.exists(fp): open(fp, 'wb').write(b)
                if f'img/uploads/{fn}' not in got: got.append(f'img/uploads/{fn}')
            if got: out[k] = got[:per_slide]
    except Exception:
        pass   # 사진을 못 꺼내도 가져오기는 된다(쪽 그림 + 글은 그대로)
    return out, skipped

def to_pdf(src, work):
    """pptx · ppt → PDF(LibreOffice 머리 없이). 사용자 설정 폴더를 작업 폴더에 따로 둬 동시에 돌아도 잠금이 겹치지 않게"""
    if not SOFFICE: raise ValueError('이 서버에는 PPT 변환 도구(LibreOffice)가 없습니다 — PPT 를 PDF 로 저장해 올려 주세요')
    pdf = os.path.splitext(src)[0] + '.pdf'
    # 먼저 UNO 스크립트(lo_convert.py — 한 · 영 사이 자동 간격을 끄고 내보냄). python3-uno 가 없거나 실패하면 그냥 --convert-to
    if subprocess.run(['python3', '-c', 'import uno'], capture_output=True).returncode == 0:
        try:
            subprocess.run(['python3', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lo_convert.py'), SOFFICE, src, pdf, work], capture_output=True, timeout=600)
            if os.path.exists(pdf) and os.path.getsize(pdf) > 0: return pdf
        except Exception:
            pass
    prof = 'file://' + os.path.join(work, 'lo-profile')
    r = subprocess.run([SOFFICE, f'-env:UserInstallation={prof}', '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', work, src],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not os.path.exists(pdf): raise ValueError(f'PPT 를 PDF 로 바꾸지 못했습니다 — {(r.stderr or r.stdout)[-200:]}')
    return pdf

def pages(pdf, work):
    """PDF → 쪽 그림(JPEG) 경로 목록 + 쪽마다 글"""
    subprocess.run(['pdftoppm', '-jpeg', '-jpegopt', 'quality=88', '-scale-to-x', '2400', '-scale-to-y', '-1', pdf, os.path.join(work, 'p')], check=True, timeout=900)
    imgs = sorted([f for f in os.listdir(work) if re.fullmatch(r'p-\d+\.jpg', f)], key=lambda f: int(re.search(r'(\d+)', f).group(1)))
    txt = ''
    try: txt = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', pdf, '-'], capture_output=True, text=True, timeout=300).stdout
    except Exception: pass
    texts = txt.split('\f') if txt else []
    return [os.path.join(work, f) for f in imgs], [re.sub(r'[ \t]+\n', '\n', (texts[i] if i < len(texts) else '')).strip() for i in range(len(imgs))]

def _name(text, k, used):
    """페이지 이름 — 쪽 글의 첫 줄(짧게), 없으면 「슬라이드 k」. 조작줄 · INIT 키라 겹치면 안 된다"""
    first = next((re.sub(r'\s+', ' ', l).strip() for l in text.splitlines() if len(l.strip()) >= 2), '')
    n = f'{k}. {first[:18]}' if first else f'슬라이드 {k}'
    while n in used: n += "'"
    used.add(n); return n

def build(tpl, title, deck_dir, name, raw):
    """올린 파일 → 덱 HTML(문자열) + 쪽 수. 그림은 deck_dir/img/uploads/, 원본은 deck_dir/files/"""
    ext = os.path.splitext(name)[1].lower()
    if ext not in ('.pptx', '.ppt', '.pdf'): raise ValueError('PPT(pptx · ppt)나 PDF 만 가져올 수 있습니다')
    if not raw or len(raw) > MAX: raise ValueError('파일이 비었거나 40MB 를 넘습니다')
    work = tempfile.mkdtemp(prefix='pptimp-')
    try:
        src = os.path.join(work, 'src' + ext); open(src, 'wb').write(raw)
        pdf = src if ext == '.pdf' else to_pdf(src, work)
        imgs, texts = pages(pdf, work)
        if not imgs: raise ValueError('쪽을 하나도 읽지 못했습니다')
        notes = _notes(src) if ext == '.pptx' else {}
        up = os.path.join(deck_dir, 'img', 'uploads'); os.makedirs(up, exist_ok=True)
        media, mskip = slide_media(src, up) if ext == '.pptx' else ({}, {})
        fd = os.path.join(deck_dir, 'files'); os.makedirs(fd, exist_ok=True)
        keep = hashlib.sha1(raw).hexdigest()[:16] + ext; shutil.copy(src, os.path.join(fd, keep))   # 원본은 그대로 남긴다(다시 가져오기 · AI 참고)
        used = set(); secs = []; ppt = {}
        for k, (im, tx) in enumerate(zip(imgs, texts), 1):
            b = open(im, 'rb').read(); fn = hashlib.sha1(b).hexdigest()[:16] + '.jpg'; open(os.path.join(up, fn), 'wb').write(b)
            if notes.get(k): tx = (tx + '\n\n(발표자 메모)\n' + notes[k]).strip()
            n = _name(tx, k, used); ppt[n] = {'no': k, 'img': f'img/uploads/{fn}', 'text': tx[:6000]}
            if media.get(k): ppt[n]['media'] = media[k]
            if mskip.get(k): ppt[n]['mediaSkipped'] = mskip[k]
            secs.append(f'<section class="slide ppt-img" data-name="{htmlmod.escape(n)}" data-steps="0" data-frozen data-import="{k}">\n'
                        f'  <img class="ppt-page" src="img/uploads/{fn}" alt="{htmlmod.escape(name)} {k}쪽">\n</section>')
        html = tpl.replace('{{TITLE}}', htmlmod.escape(title))
        a = html.index('<!-- ════════ 표지 ════════ -->'); b = html.index('<div id="tip"></div>')
        html = html[:a] + f'<!-- ════════ 가져온 페이지 — 「{htmlmod.escape(name)}」 {len(imgs)}쪽(그림). [편집 가능하게 바꾸기]를 한 페이지만 우리 엔진 HTML 로 바뀐다 ════════ -->\n' + '\n'.join(secs) + '\n\n' + html[b:]
        css = ('/* 가져온 페이지 — 원본 쪽 그림을 무대에 맞춰(비율이 다르면 위아래 · 좌우 흰 여백) */\n'
               '.ppt-img { background: #fff; padding: 0; } .ppt-img .ppt-page { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }\n')
        html = html.replace('</style>', css + '</style>', 1)
        # 쪽 글 — AI 패널 문맥(CTX) · 추천 질문. [편집 가능하게 바꾸기] 때 Claude 가 이 글과 그림을 보고 다시 쓴다
        pj = json.dumps(ppt, ensure_ascii=False).replace('</', '<\\/')   # 글 안의 </script> 가 스크립트를 끊지 않게
        js = ('// 가져온 PPT 의 쪽마다 글(pdftotext · 발표자 메모) — 그림 페이지의 AI 문맥\n'
              f'const PPT = {pj};\n'
              "Object.entries(PPT).forEach(([n, p]) => { CTX[n] = () => `원본 ${p.no}쪽(그림 ${p.img})의 글:\\n${p.text}` + (p.media ? `\\n이 쪽에 들어 있던 사진 원본: ${p.media.join(', ')}` : ''); SUGGEST[n] = ['이 페이지를 편집 가능하게 바꿔줘']; });\n")
        html = html.replace('const deck = Deck.create(', js + 'const deck = Deck.create(', 1)
        html = html.replace("intro: 'AI PPT 로 만든 발표 자료.", f"intro: '「{htmlmod.escape(name)}」 에서 가져온 발표 자료(쪽마다 원본 그림). ", 1)
        return html, len(imgs), f'files/{keep}'
    finally:
        shutil.rmtree(work, ignore_errors=True)
