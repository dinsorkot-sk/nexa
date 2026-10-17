"""Render a laid-out node tree to HTML (for visual checks only) and screenshot it with headless Chromium."""
import os, subprocess, html as H
import figlib
from figlib import DOC

SC = '/tmp/claude-1000/-mnt-d-project-nexa/b0d457a6-5113-4dd2-b411-a0ee44a1940e/scratchpad'
FONTS = f'''
@font-face{{font-family:Inter;font-weight:400;src:url(file://{SC}/tools/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff)}}
@font-face{{font-family:Inter;font-weight:500;src:url(file://{SC}/tools/node_modules/@fontsource/inter/files/inter-latin-500-normal.woff)}}
@font-face{{font-family:Inter;font-weight:600;src:url(file://{SC}/tools/node_modules/@fontsource/inter/files/inter-latin-600-normal.woff)}}
@font-face{{font-family:Inter;font-weight:700;src:url(file://{SC}/tools/node_modules/@fontsource/inter/files/inter-latin-700-normal.woff)}}
@font-face{{font-family:Thai;font-weight:400;src:url(file://{SC}/tools/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff)}}
@font-face{{font-family:Thai;font-weight:500;src:url(file://{SC}/tools/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-500-normal.woff)}}
@font-face{{font-family:Thai;font-weight:600;src:url(file://{SC}/tools/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-600-normal.woff)}}
@font-face{{font-family:Thai;font-weight:700;src:url(file://{SC}/tools/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff)}}
'''
WEIGHT = {'Regular': 400, 'Medium': 500, 'Semi Bold': 600, 'Bold': 700}
LUCIDE = SC + '/tools/node_modules/lucide-static/icons/'


def css_color(c, op=1.0):
    return 'rgba(%d,%d,%d,%.3f)' % (round(c['r'] * 255), round(c['g'] * 255), round(c['b'] * 255), c['a'] * op)


def pc(color, ctx, op=1.0):
    if isinstance(color, tuple):
        return css_color(figlib.rgba(*color), op)
    return css_color(DOC.resolve_color(color, ctx), op)


def render(n, ctx, out, ox=0, oy=0):
    ctx = dict(ctx)
    if n.var_modes:
        for cn, mn in n.var_modes.items():
            cid, mid = DOC.mode_id(cn, mn)
            ctx[cid] = mid
    st = [f'left:{n.x:.2f}px', f'top:{n.y:.2f}px', f'width:{n.w:.2f}px', f'height:{n.h:.2f}px']
    inner = ''
    if n.extra and 'transform' in n.extra:
        a, b, c, d_, tx, ty = n.extra['transform']
        st[0] = 'left:0px'
        st[1] = 'top:0px'
        st.append('transform-origin:0 0')
        st.append(f'transform:matrix({a},{b},{c},{d_},{tx},{ty})')
    if n.raw is not None and n.type == 'instance':
        # icon instance: draw lucide svg
        nm = n.name
        col = None
        for c in n.walk():
            if c.stroke:
                col = c.stroke
                break
        svgname = ICON_NAME.get(n.component, '')
        p = LUCIDE + svgname + '.svg'
        if svgname and os.path.exists(p):
            svg = open(p).read()
            colr = pc(col, ctx) if col else '#000'
            svg = svg.replace('stroke="currentColor"', f'stroke="{colr}"').replace('width="24"', f'width="{n.w}"').replace('height="24"', f'height="{n.h}"')
            out.append(f'<div style="position:absolute;{";".join(st)}">{svg}</div>')
        else:
            out.append(f'<div style="position:absolute;{";".join(st)};outline:1px dashed #f0f"></div>')
        return
    if n.raw is not None and n.type == 'vector' and n.stroke:
        pts = ' '.join(f"{v['x']},{v['y']}" for v in n.raw['network']['vertices'])
        out.append(f'<svg style="position:absolute;{";".join(st)};overflow:visible" viewBox="0 0 {n.w} {n.h}"><polyline points="{pts}" fill="none" stroke="{pc(n.stroke, ctx)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>')
        return
    if n.raw is not None:
        return
    if n.type == 'ellipse' and n.extra and 'sweep' in n.extra:
        import math
        a0, sw, inner = n.extra['start'], n.extra['sweep'], n.extra.get('inner', 0)
        R = n.w / 2
        r = R * inner
        x0, y0 = R + R * math.cos(a0), R + R * math.sin(a0)
        x1, y1 = R + R * math.cos(a0 + sw), R + R * math.sin(a0 + sw)
        x2, y2 = R + r * math.cos(a0 + sw), R + r * math.sin(a0 + sw)
        x3, y3 = R + r * math.cos(a0), R + r * math.sin(a0)
        big = 1 if sw > math.pi else 0
        out.append(f'<svg style="position:absolute;{";".join(st)}" viewBox="0 0 {n.w} {n.h}"><path d="M{x0},{y0} A{R},{R} 0 {big} 1 {x1},{y1} L{x2},{y2} A{r},{r} 0 {big} 0 {x3},{y3} Z" fill="{pc(n.fill, ctx)}"/></svg>')
        return
    if n.type == 'text':
        s = DOC.style_by_name[n.style]['style']
        fam = "Inter,Thai" if s['font_family'] == 'Inter' else 'Consolas,monospace'
        col = pc(n.fill, ctx) if n.fill else '#000'
        deco = 'underline' if n.underline else 'none'
        wrap = 'normal' if (n.sw != 'hug' or n.autoh) else 'nowrap'
        out.append(f'<div style="position:absolute;{";".join(st)};font-family:{fam};font-size:{s["font_size"]}px;line-height:{s["line_height"]["value"]}px;font-weight:{WEIGHT[s["font_style"]]};color:{col};white-space:{wrap};text-decoration:{deco}">{H.escape(n.chars)}</div>')
        return
    if n.fill is not None:
        st.append(f'background:{pc(n.fill, ctx, n.fill_opacity)}')
    shadows = []
    if n.stroke is not None:
        c = pc(n.stroke, ctx)
        sw = n.stroke_w
        if n.stroke_sides:
            t, r, b, l = n.stroke_sides
            for side, v in (('top', t), ('right', r), ('bottom', b), ('left', l)):
                if v:
                    st.append(f'border-{side}:{v}px solid {c}')
            st.append('box-sizing:border-box')
        elif n.stroke_align == 'inside':
            shadows.append(f'inset 0 0 0 {sw}px {c}')
        elif n.stroke_align == 'outside':
            shadows.append(f'0 0 0 {sw}px {c}')
        else:
            shadows.append(f'0 0 0 {sw / 2}px {c}, inset 0 0 0 {sw / 2}px {c}')
    for e in n.effects or []:
        col = e['color']
        shadows.append(f'{e["offset"][0]}px {e["offset"][1]}px {e["radius"]}px {e["spread"]}px rgba({round(col["r"]*255)},{round(col["g"]*255)},{round(col["b"]*255)},{col["a"]})')
    if shadows:
        st.append('box-shadow:' + ','.join(shadows))
    if n.radius is not None:
        if n.type == 'ellipse':
            st.append('border-radius:50%')
        else:
            r = DOC.resolve_number(n.radius, ctx) if isinstance(n.radius, str) else n.radius
            if isinstance(r, (tuple, list)):
                st.append('border-radius:' + ' '.join(f'{v}px' for v in r))
            else:
                st.append(f'border-radius:{min(r, n.h / 2, n.w / 2) if r >= 999 else r}px')
    elif n.type == 'ellipse':
        st.append('border-radius:50%')
    if n.opacity is not None:
        st.append(f'opacity:{n.opacity}')
    if n.clip:
        st.append('overflow:hidden')
    out.append(f'<div style="position:absolute;{";".join(st)}">')
    for c in n.children:
        render(c, ctx, out)
    out.append('</div>')


ICON_NAME = {}


def build_icon_map(masters):
    for k, m in masters.items():
        ICON_NAME[m.id] = k


def shoot(roots, path_png, width=1200, height=800, bg='#ffffff', ctx=None):
    out = []
    for r in roots:
        render(r, ctx or {}, out)
    page = f'<html><head><style>{FONTS} body{{margin:0;background:{bg};position:relative}}</style></head><body>' + ''.join(out) + '</body></html>'
    hp = path_png.replace('.png', '.html')
    open(hp, 'w').write(page)
    subprocess.run(['node', SC + '/tools/shot.js', hp, path_png, str(width), str(height)], check=True)
