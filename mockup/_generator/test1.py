import sys, json, time
sys.path.insert(0, '.')
import figlib
from figlib import *
d = new_doc()
import tokens, icons, writer
tokens.build_tokens()
SC = '/tmp/claude-1000/-mnt-d-project-nexa/b0d457a6-5113-4dd2-b411-a0ee44a1940e/scratchpad'
t = time.time()
icons.import_icons(SC + '/b_copy/document.json')
print('icons', len(icons.ICON_MASTERS), time.time() - t)
pg = page('Icons')
x = y = 0
for i, (k, m) in enumerate(icons.ICON_MASTERS.items()):
    m.x = 24 + (i % 40) * 48
    m.y = 24 + (i // 40) * 48
    pg.add(m)
# test button layout
b = frame('Btn', text('Label', 'บันทึก', 'Nexa/Body', '--ui-text'), pad=(8, 12, 8, 12), dir='h', main='center', cross='center', fill='--ui-primary', radius='radius/md')
layout(b)
print('btn', b.w, b.h, b.children[0].w)
pg.add(b)
doc, errs = writer.write(None, [pg], pg)
print(len(doc['nodes']), errs[:5])
