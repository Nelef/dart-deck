# PPT → PDF(LibreOffice UNO) — 한글 · 영문 사이 자동 간격을 끄고 내보낸다. server/importer.py 가 부른다(python3-uno 가 있을 때만).
# 쓰는 법: python3 lo_convert.py <soffice> <원본> <내보낼 pdf> <작업 폴더>
# 왜: `--convert-to pdf` 만 쓰면 LibreOffice 의 「한 · 영 사이 간격(ParaIsCharacterDistance)」이 켜진 채라 "13길 · 2억"이 "13 길 · 2 억"으로 벌어진다
#   (PowerPoint 에는 없는 간격 — 2026-09-30 80쪽 시험에서 거의 모든 페이지). 문단마다 끄고 내보낸다. 표 · 묶음 도형 안 글도 돈다
import os, sys, time, subprocess, uno
from com.sun.star.beans import PropertyValue

soffice, src, out, work = sys.argv[1:5]
pipe = 'pptimp' + str(os.getpid())
proc = subprocess.Popen([soffice, '--headless', '--invisible', '--norestore', '--nologo', f'-env:UserInstallation=file://{os.path.join(work, "lo-profile")}',
                         f'--accept=pipe,name={pipe};urp;StarOffice.ComponentContext'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

def fix_text(t):
    try:
        e = t.createEnumeration()
        while e.hasMoreElements():
            par = e.nextElement()
            try: par.ParaIsCharacterDistance = False
            except Exception: pass
    except Exception:
        pass

def walk(shape):
    try:
        if shape.supportsService('com.sun.star.drawing.GroupShape'):
            for i in range(shape.getCount()): walk(shape.getByIndex(i))
            return
        if shape.supportsService('com.sun.star.drawing.TableShape'):
            m = shape.Model
            for r in range(m.Rows.Count):
                for c in range(m.Columns.Count): fix_text(m.getCellByPosition(c, r).Text)
            return
        if hasattr(shape, 'Text'): fix_text(shape.Text)
    except Exception:
        pass

try:
    local = uno.getComponentContext()
    res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(120):
        try: ctx = res.resolve(f'uno:pipe,name={pipe};urp;StarOffice.ComponentContext'); break
        except Exception: time.sleep(0.5)
    if ctx is None: raise SystemExit('LibreOffice 에 붙지 못했다')
    desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), '_blank', 0, (prop('Hidden', True),))
    pages = doc.DrawPages
    for i in range(pages.Count):
        pg = pages.getByIndex(i)
        for j in range(pg.Count): walk(pg.getByIndex(j))
    doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(out)), (prop('FilterName', 'impress_pdf_Export'),))
    doc.close(True)
    try: desk.terminate()
    except Exception: pass
finally:
    try: proc.wait(timeout=20)
    except Exception: proc.kill()
