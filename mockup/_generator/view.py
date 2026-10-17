import sys, os
os.environ['CROP'] = '1'
sys.argv_backup = sys.argv
keys = sys.argv[1:]
sys.argv = [sys.argv[0]]
exec(open('build.py').read().split("if __name__")[0])
import preview
for k in keys:
    parts = k.split(':')
    key = parts[0]
    s = SETS[key]
    w = int(min(s.w, 1700)); h = int(min(s.h, 1000))
    if len(parts) > 1:
        # vertical offset: shift the set up to show later rows
        off = int(parts[1])
        s.y = -off
    s.x = 0
    preview.shoot([s], f'{SC}/prev_{key}.png', w, h)
    s.y = 0
    print(key, s.w, s.h)
import subprocess
imgs = [f'prev_{k.split(":")[0]}.png' for k in keys]
open(SC + '/sheet.html', 'w').write('<html><body style="margin:0;background:#ddd;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' + ''.join(f'<img src="file://{SC}/{i}">' for i in imgs) + '</body></html>')
subprocess.run(['node', SC + '/tools/shot.js', SC + '/sheet.html', SC + '/sheet.png', '1700', '1000'], check=True)
