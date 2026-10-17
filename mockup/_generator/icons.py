"""Import the Lucide icon masters (24px components) from the mockup copy and build instances of them."""
import json, copy
import figlib
from figlib import N, DOC

ICON_MASTERS = {}   # name -> N (component)
_RAW_SRC = {}


def _raw_from(node, nodes):
    r = {k: v for k, v in node.items() if k not in ('id', 'parent', 'children', 'transform', 'width', 'height', 'name', 'type')}
    r['_tf'] = node.get('transform')
    r['_w'] = node['width']
    r['_h'] = node['height']
    return r


def import_icons(copy_doc_path, wanted=None):
    j = json.load(open(copy_doc_path))
    nodes = j['nodes']
    icon_page = [n for n in nodes.values() if n['type'] == 'page' and n['name'] == 'icon'][0]
    for cid in icon_page['children']:
        c = nodes[str(cid)]
        if c['type'] != 'component':
            continue
        if wanted is not None and c['name'] not in wanted:
            continue
        ICON_MASTERS[c['name']] = _build(c, nodes, None)
    return ICON_MASTERS


def _build(c, nodes, parent):
    n = N(c['type'], c['name'], w=c['width'], h=c['height'], raw=_raw_from(c, nodes))
    n.sw = n.sh = 'fixed'
    if c['type'] == 'component':
        n.description = c.get('description', '')
        n.props = c.get('props', {})
    tf = c.get('transform')
    n.x, n.y = (tf[4], tf[5]) if tf else (0.0, 0.0)
    for k in c.get('children', []):
        n.add(_build(nodes[str(k)], nodes, n))
    return n


def icon(name, size, color=None, label=None):
    """Instance of an icon master scaled to `size`, strokes bound to the colour variable `color`."""
    m = ICON_MASTERS[name]
    i = figlib.instance(m, name=label or 'Icon')
    s = size / m.w
    i.w = i.h = size
    i.sw = i.sh = 'fixed'
    for c in i.children:
        _scale(c, s, color)
    return i


def _scale(n, s, color):
    n.x *= s
    n.y *= s
    n.w *= s
    n.h *= s
    if color is not None and n.type in ('vector', 'line', 'ellipse', 'rectangle'):
        if n.raw.get('strokes'):
            n.stroke = color
        if any(f.get('visible', True) and f.get('opacity', 1) > 0 for f in n.raw.get('fills') or []):
            n.fill = color
    net = n.raw.get('network') if n.raw else None
    if net:
        for v in net['vertices']:
            v['x'] *= s
            v['y'] *= s
            v['radius'] = v.get('radius', 0.0) * s
        for sg in net['segments']:
            sg['ta'] = [sg['ta'][0] * s, sg['ta'][1] * s]
            sg['tb'] = [sg['tb'][0] * s, sg['tb'][1] * s]
    for c in n.children:
        _scale(c, s, color)
