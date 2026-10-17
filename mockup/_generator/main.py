import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py')).read().split("if __name__")[0])
import pages, found, writer

t0 = time.time()
fpage = found.build_foundations_page()
cpage, croot = pages.build_components_page(SETS)
dark = pages.dark_preview()
croot.add(dark)
layout(croot)
croot.x, croot.y = 0, 0
cpage.add(croot)
# icons page
ipage = page('icon')
for i, (k, mm) in enumerate(icons.ICON_MASTERS.items()):
    mm.x = 12 + (i % 50) * 48
    mm.y = 12 + (i // 50) * 48
    ipage.add(mm)
doc, errs = writer.write(None, [fpage, cpage, ipage], cpage)
print('nodes', len(doc['nodes']), 'errors', len(errs), errs[:10], 'build', round(time.time() - t0, 1), 's')
OUT = os.environ.get('OUT', SC + '/Nexa.out.figcraft')
thumb = zipfile.ZipFile('/mnt/d/project/nexa/mockup/Nexa.figcraft').read('thumbnail.png') if os.path.exists('/mnt/d/project/nexa/mockup/Nexa.figcraft') else None
writer.save(doc, OUT, thumb)
print('saved', OUT, os.path.getsize(OUT) // 1024, 'KB')
