import sys
sys.path.insert(0, '.')
import figlib
from figlib import *
d = new_doc()
import tokens, icons, preview
tokens.build_tokens()
SC = '/tmp/claude-1000/-mnt-d-project-nexa/b0d457a6-5113-4dd2-b411-a0ee44a1940e/scratchpad'
icons.import_icons(SC + '/b_copy/document.json')
preview.build_icon_map(icons.ICON_MASTERS)
import comp_actions as A
import comp_base as B
s = B.make_set('Button', '', [('Color', ['Primary','Neutral','Error']), ('Variant', A.VARIANT_AX), ('Size', ['md']), ('State', ['Default','Hover','Focus','Disabled','Loading']), ('Icon', ['None','Leading','Trailing'])], A.build_button, ['Color','Variant','Size'])
s.x = 0; s.y = 0
print(s.w, s.h)
preview.shoot([s], SC + '/prev_button.png', int(s.w), int(s.h))
s2 = B.make_set('IconButton', '', [('Color', ['Primary','Neutral']), ('Variant', A.VARIANT_AX), ('Size', ['sm','md','lg']), ('State', ['Default','Hover','Focus','Disabled','Loading'])], A.build_icon_button, ['Color','Variant','Size'])
preview.shoot([s2], SC + '/prev_ib.png', int(s2.w), int(s2.h))
