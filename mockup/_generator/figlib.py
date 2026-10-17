"""Minimal builder for the .figcraft document.json format (frames, text, components, instances, variables)."""
import json, math, copy, os

HERE = os.path.dirname(os.path.abspath(__file__))
WIDTHS = json.load(open(os.path.join(HERE, '..', 'widths.json')))
WEIGHT = {'Regular': 400, 'Medium': 500, 'Semi Bold': 600, 'Bold': 700}


def text_width(chars, family, style, size, letter=0.0):
    if family == 'Consolas':
        return round(len(chars) * 0.55 * size, 2)
    w = WEIGHT.get(style, 400)
    inter = WIDTHS['Inter'][str(w)]
    thai = WIDTHS['Noto Sans Thai'][str(w)]
    total = 0.0
    for ch in chars:
        cp = ord(ch)
        if 0x0E00 <= cp <= 0x0E7F:
            total += thai.get(str(cp), 0.0)
        else:
            total += inter.get(str(cp), 0.6)
    return round(total * size + letter * len(chars), 2)


def rgba(hexs, a=1.0):
    h = hexs.lstrip('#')
    return {'r': int(h[0:2], 16) / 255, 'g': int(h[2:4], 16) / 255, 'b': int(h[4:6], 16) / 255, 'a': a}


# --------------------------------------------------------------------------- document / variables
class Doc:
    def __init__(self):
        self.next_id = 2
        self.collections = []   # dicts
        self.vars = {}          # name -> var dict
        self.var_by_id = {}
        self.styles = []
        self.style_by_name = {}
        self._vc = 0
        self.nodes = {}          # id -> Node (all created nodes, incl. masters)
        self.pages = []

    def nid(self):
        i = self.next_id
        self.next_id += 1
        return i

    def vid(self):
        self._vc += 1
        return f'1:{self._vc}'

    def collection(self, name, modes):
        c = {'id': self.vid(), 'name': name, 'modes': [{'id': self.vid(), 'name': m} for m in modes]}
        self.collections.append(c)
        return c

    def color_var(self, coll, name, values, description='', scopes=None):
        """values: {mode_name: '#hex' | ('#hex', alpha) | '@other-var-name'}"""
        v = {'id': self.vid(), 'name': name, 'collection': coll['id'], 'resolvedType': 'color', 'values': {},
             'description': description, 'scopes': scopes or ['ALL_FILLS', 'STROKE_COLOR']}
        for m in coll['modes']:
            x = values[m['name']] if isinstance(values, dict) else values
            if isinstance(x, str) and x.startswith('@'):
                v['values'][m['id']] = {'type': 'alias', 'value': self.vars[x[1:]]['id']}
            else:
                hx, a = (x, 1.0) if isinstance(x, str) else x
                v['values'][m['id']] = {'type': 'color', 'value': rgba(hx, a)}
        self.vars[name] = v
        self.var_by_id[v['id']] = v
        return v

    def number_var(self, coll, name, values, scopes, description=''):
        v = {'id': self.vid(), 'name': name, 'collection': coll['id'], 'resolvedType': 'number', 'values': {},
             'description': description, 'scopes': scopes}
        for m in coll['modes']:
            x = values[m['name']] if isinstance(values, dict) else values
            v['values'][m['id']] = {'type': 'number', 'value': float(x)}
        self.vars[name] = v
        self.var_by_id[v['id']] = v
        return v

    def coll_of(self, var):
        return next(c for c in self.collections if c['id'] == var['collection'])

    def mode_id(self, coll_name, mode_name):
        c = next(c for c in self.collections if c['name'] == coll_name)
        return c['id'], next(m['id'] for m in c['modes'] if m['name'] == mode_name)

    def resolve_color(self, name, ctx):
        """ctx: {collection_id: mode_id} (inherited explicit modes)."""
        v = self.vars[name]
        return self._resolve(v, ctx)

    def _resolve(self, v, ctx):
        coll = self.coll_of(v)
        mode = ctx.get(coll['id'], coll['modes'][0]['id'])
        x = v['values'][mode]
        if x['type'] == 'alias':
            return self._resolve(self.var_by_id[x['value']], ctx)
        return x['value']

    def resolve_number(self, name, ctx):
        v = self.vars[name]
        coll = self.coll_of(v)
        mode = ctx.get(coll['id'], coll['modes'][0]['id'])
        return v['values'][mode]['value']

    def text_style(self, name, family, style, size, lh, description=''):
        s = {'id': f'S:{len(self.styles) + 1}', 'name': name, 'description': description, 'type': 'text',
             'style': {'font_family': family, 'font_style': style, 'font_size': float(size),
                       'line_height': {'unit': 'pixels', 'value': float(lh)},
                       'letter_spacing': {'unit': 'percent', 'value': 0.0}, 'decoration': 'none', 'case': 'original',
                       'fills': None, 'link': None}}
        self.styles.append(s)
        self.style_by_name[name] = s
        return s

    def paint_style(self, name, varname, description=''):
        v = self.vars[varname]
        coll = self.coll_of(v)
        s = {'id': f'S:{len(self.styles) + 1}', 'name': name, 'description': description, 'type': 'paint',
             'paints': [{'type': 'solid', 'color': self._resolve(v, {}), 'opacity': 1.0, 'visible': True, 'blend': 'normal'}],
             'bound': {'fills/0/color': v['id']}}
        self.styles.append(s)
        self.style_by_name[name] = s
        return s


DOC = None


def new_doc():
    global DOC
    DOC = Doc()
    return DOC


# --------------------------------------------------------------------------- nodes
class N:
    """Node. sizing: 'fixed' | 'hug' | 'fill' per axis. Colors are variable NAMES (resolved at serialisation)."""

    def __init__(self, type, name, **kw):
        self.type = type
        self.name = name
        self.id = DOC.nid()
        self.children = []
        self.parent = None
        self.x = 0.0
        self.y = 0.0
        self.w = kw.pop('w', None)
        self.h = kw.pop('h', None)
        self.sw = kw.pop('sw', 'hug' if type in ('frame', 'component', 'instance', 'text') else 'fixed')
        self.sh = kw.pop('sh', 'hug' if type in ('frame', 'component', 'instance', 'text') else 'fixed')
        self.dir = kw.pop('dir', 'h')
        self.gap = kw.pop('gap', 0)
        self.pad = kw.pop('pad', (0, 0, 0, 0))
        self.main = kw.pop('main', 'min')
        self.cross = kw.pop('cross', 'min')
        self.fill = kw.pop('fill', None)            # var name | ('#hex', alpha) | None
        self.fill_opacity = kw.pop('fill_opacity', 1.0)
        self.stroke = kw.pop('stroke', None)        # var name
        self.stroke_w = kw.pop('stroke_w', 1)
        self.stroke_align = kw.pop('stroke_align', 'inside')
        self.stroke_sides = kw.pop('stroke_sides', None)
        self.stroke_dash = kw.pop('stroke_dash', None)
        self.radius = kw.pop('radius', None)        # token name | number | (tl,tr,br,bl)
        self.opacity = kw.pop('opacity', None)
        self.effects = kw.pop('effects', None)
        self.clip = kw.pop('clip', False)
        self.absolute = kw.pop('absolute', False)
        self.var_modes = kw.pop('var_modes', None)  # {collection_name: mode_name}
        self.description = kw.pop('description', '')
        self.props = kw.pop('props', None)
        self.chars = kw.pop('chars', None)
        self.style = kw.pop('style', None)          # text style name
        self.raw = kw.pop('raw', None)              # raw dict for imported nodes
        self.source = None
        self.component = None
        self.overrides = []
        self.extra = kw.pop('extra', None)
        self.autoh = kw.pop('autoh', False)         # text wraps (auto_resize height)
        self.underline = kw.pop('underline', False)
        self.bind_pad = kw.pop('bind_pad', True)
        self.annotations = kw.pop('annotations', None)
        if kw:
            raise TypeError(f'unknown args {kw}')
        for c in list(self.children):
            pass
        DOC.nodes[self.id] = self

    def add(self, *kids):
        for k in kids:
            if k is None:
                continue
            k.parent = self
            self.children.append(k)
        return self

    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
            r = c.find(name)
            if r:
                return r
        return None

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


def frame(name, *kids, **kw):
    n = N('frame', name, **kw)
    n.add(*kids)
    return n


def text(name, chars, style='Nexa/Body', color='--ui-text', **kw):
    n = N('text', name, chars=chars, style=style, fill=color, **kw)
    return n


def rect(name, w, h, fill=None, **kw):
    return N('rectangle', name, w=w, h=h, fill=fill, **kw)


def ellipse(name, w, h, fill=None, **kw):
    return N('ellipse', name, w=w, h=h, fill=fill, **kw)


def spacer():
    return N('frame', 'Spacer', sw='fill', sh='fixed', h=1)


def component(name, *kids, **kw):
    n = N('component', name, **kw)
    n.add(*kids)
    return n


def clone(n, parent_is_instance_root=True):
    """Deep copy for instancing: new ids, `source` points at the original node."""
    c = copy.copy(n)
    c.id = DOC.nid()
    DOC.nodes[c.id] = c
    c.source = n.id
    c.overrides = []
    c.children = []
    c.parent = None
    if n.raw is not None:
        c.raw = copy.deepcopy(n.raw)
    for k in n.children:
        kc = clone(k, False)
        kc.parent = c
        c.children.append(kc)
    return c


def instance(master, name=None, **over):
    """Instance of a component node. Overrides: w/h sizing or `scale_to=(w,h)` for icons."""
    i = clone(master)
    i.type = 'instance'
    i.name = name or master.name
    i.component = master.id
    i.source = master.id
    i.description = ''
    i.props = {}
    for k, v in over.items():
        setattr(i, k, v)
    return i


# --------------------------------------------------------------------------- text-layout helpers
def tstyle(n):
    s = DOC.style_by_name[n.style]['style']
    return s


def text_natural(n, avail=None):
    s = tstyle(n)
    w = text_width(n.chars, s['font_family'], s['font_style'], s['font_size'], 0)
    lh = s['line_height']['value']
    if n.sw == 'fixed' and n.w is not None:
        avail = n.w
    if avail is not None and w > avail + 0.01 and (n.autoh or n.sw != 'hug'):
        lines = max(1, math.ceil(w / avail))
        return avail, lines * lh
    return w, lh


def pad_of(n):
    p = n.pad
    if isinstance(p, (int, float)):
        p = (p, p, p, p)
    return p


def layout(n, W=None, H=None):
    """Compute n.w/n.h and children's x/y. W/H are sizes imposed by the parent (fill)."""
    if n.type == 'text':
        w, h = text_natural(n, W if n.sw != 'hug' else None)
        n.w = (W if (n.sw == 'fill' and W is not None) else (n.w if n.sw == 'fixed' else w))
        if n.sw == 'fill' and W is not None:
            w2, h = text_natural(n, W)
        n.h = n.h if n.sh == 'fixed' and n.h else h
        return n.w, n.h
    if n.raw is not None or n.type in ('rectangle', 'ellipse'):
        if n.sw == 'fill' and W is not None:
            n.w = W
        if n.sh == 'fill' and H is not None:
            n.h = H
        return n.w, n.h
    if n.type == 'componentSet':
        return n.w, n.h
    # frame-like
    pt, pr, pb, pl = pad_of(n)
    sw = n.sw
    sh = n.sh
    fw = n.w if sw == 'fixed' else (W if sw == 'fill' and W is not None else None)
    fh = n.h if sh == 'fixed' else (H if sh == 'fill' and H is not None else None)
    kids = [c for c in n.children if not c.absolute]
    horiz = n.dir == 'h'
    innerW = None if fw is None else fw - pl - pr
    innerH = None if fh is None else fh - pt - pb

    def main_sz(c):
        return c.sw if horiz else c.sh

    def cross_sz(c):
        return c.sh if horiz else c.sw

    # pass A: lay out non-fill children
    sizes = {}
    for c in kids:
        cw = ch = None
        imposedW = imposedH = None
        if horiz:
            if c.sw == 'fill':
                continue
            if c.sh == 'fill' and innerH is not None:
                imposedH = innerH
            layout(c, None, imposedH)
        else:
            if c.sh == 'fill':
                continue
            if c.sw == 'fill' and innerW is not None:
                imposedW = innerW
            layout(c, imposedW, None)
        sizes[c.id] = (c.w, c.h)
    gap = n.gap
    ng = max(0, len(kids) - 1)
    if horiz:
        used = sum(sizes[c.id][0] for c in kids if c.id in sizes) + gap * ng
        fills = [c for c in kids if c.sw == 'fill']
        if fw is None:
            # hug width: fill children use natural size
            for c in fills:
                layout(c, None, innerH if c.sh == 'fill' else None)
                sizes[c.id] = (c.w, c.h)
            used = sum(sizes[c.id][0] for c in kids) + gap * ng
            fw = used + pl + pr
            innerW = fw - pl - pr
        elif fills:
            share = max(0.0, (innerW - used) / len(fills))
            for c in fills:
                layout(c, share, innerH if c.sh == 'fill' else None)
                sizes[c.id] = (c.w, c.h)
        # height
        if fh is None:
            fh = max([sizes[c.id][1] for c in kids if c.sh != 'fill'] + [0]) + pt + pb
            innerH = fh - pt - pb
        for c in kids:
            if c.sh == 'fill':
                layout(c, c.w if c.sw != 'fill' else sizes[c.id][0], innerH)
                sizes[c.id] = (c.w, c.h)
        n.w, n.h = fw, fh
        # positions
        total = sum(sizes[c.id][0] for c in kids) + gap * ng
        x0 = pl
        if n.main == 'center':
            x0 = pl + (innerW - total) / 2
        elif n.main == 'max':
            x0 = pl + (innerW - total)
        x = x0
        for c in kids:
            cw, ch = sizes[c.id]
            c.x = x
            if n.cross == 'center':
                c.y = pt + (innerH - ch) / 2
            elif n.cross == 'max':
                c.y = pt + (innerH - ch)
            else:
                c.y = pt
            x += cw + gap
    else:
        used = sum(sizes[c.id][1] for c in kids if c.id in sizes) + gap * ng
        fills = [c for c in kids if c.sh == 'fill']
        if fh is None:
            for c in fills:
                layout(c, innerW if c.sw == 'fill' else None, None)
                sizes[c.id] = (c.w, c.h)
            used = sum(sizes[c.id][1] for c in kids) + gap * ng
            fh = used + pt + pb
            innerH = fh - pt - pb
        elif fills:
            share = max(0.0, (innerH - used) / len(fills))
            for c in fills:
                layout(c, innerW if c.sw == 'fill' else None, share)
                sizes[c.id] = (c.w, c.h)
        if fw is None:
            fw = max([sizes[c.id][0] for c in kids if c.sw != 'fill'] + [0]) + pl + pr
            innerW = fw - pl - pr
        for c in kids:
            if c.sw == 'fill':
                layout(c, innerW, sizes[c.id][1] if c.sh == 'fill' or True else None)
                sizes[c.id] = (c.w, c.h)
        n.w, n.h = fw, fh
        total = sum(sizes[c.id][1] for c in kids) + gap * ng
        y0 = pt
        if n.main == 'center':
            y0 = pt + (innerH - total) / 2
        elif n.main == 'max':
            y0 = pt + (innerH - total)
        y = y0
        for c in kids:
            cw, ch = sizes[c.id]
            c.y = y
            if n.cross == 'center':
                c.x = pl + (innerW - cw) / 2
            elif n.cross == 'max':
                c.x = pl + (innerW - cw)
            else:
                c.x = pl
            y += ch + gap
    for c in n.children:
        if c.absolute and c.w is None or (c.absolute and c.type == 'frame'):
            layout(c)
    return n.w, n.h


# --------------------------------------------------------------------------- serialisation
def _num(x):
    return float(round(x, 3)) if x is not None else None


def paint(color, ctx, opacity=1.0):
    if isinstance(color, tuple):
        return {'type': 'solid', 'color': rgba(color[0], color[1]), 'opacity': opacity, 'visible': True, 'blend': 'normal'}
    c = DOC.resolve_color(color, ctx)
    return {'type': 'solid', 'color': dict(c), 'opacity': opacity, 'visible': True, 'blend': 'normal'}


SPACE_BY_VALUE = {}


def serialize_raw(n, ctx):
    out = copy.deepcopy(n.raw)
    tf0, w0, h0 = out.pop('_tf', None), out.pop('_w', None), out.pop('_h', None)
    out['id'] = n.id
    out['name'] = n.name
    out['type'] = n.type
    if n.type == 'component':
        out['description'] = n.description
        out['props'] = n.props or {}
    if n.type == 'instance':
        out['component'] = n.component
        out['props'] = n.props or {}
    if n.parent is not None:
        out['parent'] = n.parent.id
        out['transform'] = [1.0, 0.0, 0.0, 1.0, _num(n.x), _num(n.y)]
        if n.parent.type in ('frame', 'component', 'instance') and n.parent.raw is None:
            out['child_layout'] = {'sizing_h': 'fixed', 'sizing_v': 'fixed', 'absolute': n.absolute, 'min_w': None,
                                   'max_w': None, 'min_h': None, 'max_h': None, 'grid_column': None, 'grid_row': None,
                                   'grid_column_span': 0, 'grid_row_span': 0}
    else:
        out['transform'] = [1.0, 0.0, 0.0, 1.0, _num(n.x), _num(n.y)]
    out['width'] = _num(n.w)
    out['height'] = _num(n.h)
    if n.source is None and n.parent is not None and n.parent.raw is not None:
        # untouched master child: keep the original geometry exactly
        out['width'], out['height'] = w0, h0
        if tf0 is None:
            out.pop('transform', None)
        else:
            out['transform'] = tf0
    if n.source is not None and n.parent is not None and n.parent.raw is not None and tf0 is not None:
        # scaled instance child: keep rotation/skew of the master, scale only the translation
        out['transform'] = [tf0[0], tf0[1], tf0[2], tf0[3], _num(n.x), _num(n.y)]
    if n.children:
        out['children'] = [c.id for c in n.children]
    else:
        out.pop('children', None)
    if n.stroke is not None:
        sp = paint(n.stroke, ctx)
        out['strokes'] = [sp]
        out['bound'] = {'stroke': DOC.vars[n.stroke]['id']}
        if 'stroke' not in out:
            out['stroke'] = {'weight': 2.0, 'align': 'center', 'sides': None, 'cap_start': 'round', 'cap_end': 'round',
                             'join': 'round', 'miter_limit': 4.0, 'dashes': []}
        if n.source is not None and 'strokes' not in n.overrides:
            n.overrides.append('strokes')
    if n.fill is not None:
        out['fills'] = [paint(n.fill, ctx)]
        out.setdefault('bound', {})['fill'] = DOC.vars[n.fill]['id']
        if n.source is not None and 'fills' not in n.overrides:
            n.overrides.append('fills')
    if n.source is not None:
        out['source'] = n.source
        out['overrides'] = list(n.overrides)
    if n.type == 'instance' and n.opacity is not None:
        out['opacity'] = n.opacity
    nodes_out = {str(n.id): out}
    for c in n.children:
        nodes_out.update(serialize_raw(c, ctx))
    return nodes_out


def serialize(n, ctx, parent_in_layout):
    if n.raw is not None:
        return serialize_raw(n, ctx)
    if n.type == 'page':
        bg = rgba(n.extra.get('bg', '#f5f5f5')) if n.extra else rgba('#f5f5f5')
        out = {'id': n.id, 'name': n.name, 'type': 'page', 'background': bg, 'flows': [],
               'prototype': {'device': 'None', 'background': rgba('#1e1e1e'), 'rotation': 'portrait'},
               'guides': [], 'children': [c.id for c in n.children], 'width': 0.0, 'height': 0.0}
        res = {str(n.id): out}
        for c in n.children:
            res.update(serialize(c, ctx, False))
        return res
    out = {'id': n.id, 'name': n.name, 'type': n.type}
    ctx = dict(ctx)
    if n.var_modes:
        for cn, mn in n.var_modes.items():
            cid, mid = DOC.mode_id(cn, mn)
            ctx[cid] = mid
    if n.raw is not None:
        raw = copy.deepcopy(n.raw)
        out.update(raw)
        out['id'] = n.id
        out['name'] = n.name
        out['type'] = n.type if n.type != 'raw' else raw.get('type')
    if n.type in ('component', 'instance'):
        out['description'] = n.description if n.type == 'component' else out.get('description', '')
    if n.type == 'component' or n.type == 'instance':
        if n.type == 'instance':
            out['component'] = n.component
        out['props'] = n.props or {}
    if n.parent is not None:
        out['parent'] = n.parent.id
    if n.children and n.type != 'text':
        out['children'] = [c.id for c in n.children]
    tf = [1.0, 0.0, 0.0, 1.0, _num(n.x), _num(n.y)]
    if n.parent is not None or n.type == 'page':
        out['transform'] = tf
    if n.type != 'page' and n.w is not None:
        out['width'] = _num(n.w)
        out['height'] = _num(n.h)
    bound = {}
    if n.type == 'text':
        s = DOC.style_by_name[n.style]
        st = copy.deepcopy(s['style'])
        st['style_id'] = s['id']
        if n.underline:
            st['decoration'] = 'underline'
        out['characters'] = n.chars
        out['style'] = st
        out['blend'] = 'normal'
        if n.autoh or n.sw == 'fill':
            out['auto_resize'] = 'height'
        out['styles'] = {'fill': None, 'stroke': None, 'effect': None, 'grid': None, 'text': s['id']}
    if n.type == 'ellipse':
        out.update({'start': 0.0, 'sweep': 6.283185307179586, 'inner': 0.0, 'blend': 'normal'})
    if n.type == 'rectangle':
        out['blend'] = 'normal'
    if n.fill is not None:
        out['fills'] = [paint(n.fill, ctx, n.fill_opacity)]
        if isinstance(n.fill, str):
            bound['fill'] = DOC.vars[n.fill]['id']
    if n.stroke is not None:
        out['strokes'] = [paint(n.stroke, ctx)]
        out['stroke'] = {'weight': float(n.stroke_w), 'align': n.stroke_align,
                         'sides': [float(v) for v in n.stroke_sides] if n.stroke_sides else None,
                         'cap_start': 'none', 'cap_end': 'none', 'join': 'miter', 'miter_limit': 4.0, 'dashes': list(n.stroke_dash or [])}
        if isinstance(n.stroke, str):
            bound['stroke'] = DOC.vars[n.stroke]['id']
    if n.radius is not None and n.type in ('frame', 'component', 'instance', 'rectangle', 'componentSet'):
        if isinstance(n.radius, str):
            r = DOC.resolve_number(n.radius, ctx)
            bound['cornerRadius'] = DOC.vars[n.radius]['id']
            radii = [r] * 4
        elif isinstance(n.radius, (tuple, list)):
            radii = [float(v) for v in n.radius]
        else:
            radii = [float(n.radius)] * 4
        out['corners'] = {'radii': radii, 'smoothing': 0.0}
    if n.type in ('frame', 'component', 'instance'):
        pt, pr, pb, pl = pad_of(n)
        out['layout'] = {'mode': 'horizontal' if n.dir == 'h' else 'vertical', 'wrap': False, 'gap': float(n.gap),
                         'cross_gap': 0.0, 'padding': [float(pt), float(pr), float(pb), float(pl)],
                         'main_align': n.main, 'cross_align': n.cross, 'content_align': 'auto', 'grid_columns': 2,
                         'grid_rows': 2, 'column_tracks': [], 'row_tracks': [], 'strokes_included': True,
                         'reverse_z': False}
        if n.bind_pad:
            if n.gap and ('space/%d' % n.gap) in DOC.vars:
                bound['gap'] = DOC.vars['space/%d' % n.gap]['id']
            if pl == pr and pl and ('space/%g' % pl) in DOC.vars:
                bound['paddingHorizontal'] = DOC.vars['space/%g' % pl]['id']
            if pt == pb and pt and ('space/%g' % pt) in DOC.vars:
                bound['paddingVertical'] = DOC.vars['space/%g' % pt]['id']
        if n.clip:
            out['clip'] = True
    if n.opacity is not None:
        out['opacity'] = n.opacity
    if n.effects:
        out['effects'] = n.effects
    if n.var_modes:
        out['var_modes'] = {DOC.mode_id(cn, mn)[0]: DOC.mode_id(cn, mn)[1] for cn, mn in n.var_modes.items()}
    if n.annotations:
        out['annotations'] = n.annotations
    if bound:
        out['bound'] = bound
    if n.parent is not None and n.type not in ('page',) and n.parent.type in ('frame', 'component', 'instance'):
        out['child_layout'] = {'sizing_h': n.sw, 'sizing_v': n.sh, 'absolute': n.absolute, 'min_w': None, 'max_w': None,
                               'min_h': None, 'max_h': None, 'grid_column': None, 'grid_row': None,
                               'grid_column_span': 0, 'grid_row_span': 0}
    if n.source is not None:
        out['source'] = n.source
        out['overrides'] = list(n.overrides)
    if n.extra:
        out.update(n.extra)
    nodes_out = {str(n.id): out}
    for c in n.children:
        nodes_out.update(serialize(c, ctx, n.type in ('frame', 'component', 'instance')))
    return nodes_out


def page(name, bg='#f5f5f5'):
    return N('page', name, extra={'bg': bg})
