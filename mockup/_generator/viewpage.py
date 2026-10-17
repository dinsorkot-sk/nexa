import sys, os
os.environ['CROP'] = '1'
page_name, off, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
sys.argv = [sys.argv[0]]
src = open('main.py').read().split("doc, errs = writer.write")[0]
exec(src)
import preview
root = {'Foundations': fpage, 'Components': cpage}[page_name].children[0]
root.x = 0
root.y = -off
preview.shoot([root], SC + '/prev_page.png', w, h, bg='#ffffff')
print('page size', root.w, root.h)
