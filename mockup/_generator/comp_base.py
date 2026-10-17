"""Shared helpers for building Nexa components."""
import itertools
import figlib
from figlib import *
import icons as I

SHADOW_SM = [{'type': 'dropShadow', 'color': {'r': 0.0588, 'g': 0.0902, 'b': 0.1647, 'a': 0.07}, 'offset': [0.0, 2.0], 'radius': 8.0, 'spread': 0.0, 'blend': 'normal', 'show_behind': False, 'visible': True}]
SHADOW_MD = [{'type': 'dropShadow', 'color': {'r': 0.0588, 'g': 0.0902, 'b': 0.1647, 'a': 0.10}, 'offset': [0.0, 4.0], 'radius': 16.0, 'spread': 0.0, 'blend': 'normal', 'show_behind': False, 'visible': True}]
SHADOW_LG = [{'type': 'dropShadow', 'color': {'r': 0.0588, 'g': 0.0902, 'b': 0.1647, 'a': 0.16}, 'offset': [0.0, 12.0], 'radius': 32.0, 'spread': 0.0, 'blend': 'normal', 'show_behind': False, 'visible': True}]

COLORS = ['primary', 'secondary', 'neutral', 'error']                    # Button colors
STATUS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']  # Badge / Alert / Indicator
cap = lambda s: s[0].upper() + s[1:]

SIZES = {
    'sm': dict(h=28, px=10, py=6, gap=6, icon=14, text='Nexa/Small Medium', r='radius/md'),
    'md': dict(h=36, px=12, py=8, gap=6, icon=16, text='Nexa/Body Medium', r='radius/md'),
    'lg': dict(h=44, px=16, py=10, gap=8, icon=20, text='Nexa/Body Large Medium', r='radius/lg'),
}


class Tone(dict):
    __getattr__ = dict.get


def tone(color, variant):
    """Token names for a color x variant. Labels on tints use the highlighted text token (WCAG AA, Phase 22)."""
    c = color
    neutral = c == 'neutral'
    icon_tone = '--ui-text-highlighted' if c == 'warning' else f'--ui-{c}-text'
    if variant == 'solid':
        if neutral:
            return Tone(fill='--ui-bg-inverted', hover='--ui-neutral-hover', stroke=None, label='--ui-text-inverted', icon='--ui-text-inverted', ring='--ui-ring')
        return Tone(fill=f'--ui-{c}', hover=f'--ui-{c}-hover', stroke=None, label='--ui-on-solid', icon='--ui-on-solid', ring=f'--ui-{c}')
    if variant == 'outline':
        if neutral:
            return Tone(fill='--ui-bg', hover='--ui-bg-elevated', stroke='--ui-border-accented', label='--ui-text-toned', icon='--ui-text-toned', ring='--ui-ring')
        return Tone(fill=None, hover=f'--ui-{c}-soft', stroke=f'--ui-{c}-outline', label='--ui-text-highlighted', icon=icon_tone, ring=f'--ui-{c}')
    if variant == 'soft':
        if neutral:
            return Tone(fill='--ui-bg-elevated', hover='--ui-bg-accented', stroke=None, label='--ui-text-highlighted', icon='--ui-text-toned', ring='--ui-ring')
        return Tone(fill=f'--ui-{c}-soft', hover=f'--ui-{c}-soft-hover', stroke=None, label='--ui-text-highlighted', icon=icon_tone, ring=f'--ui-{c}')
    if variant == 'subtle':
        if neutral:
            return Tone(fill='--ui-bg-elevated', hover='--ui-bg-accented', stroke='--ui-border-accented', label='--ui-text-highlighted', icon='--ui-text-toned', ring='--ui-ring')
        return Tone(fill=f'--ui-{c}-soft', hover=f'--ui-{c}-soft-hover', stroke=f'--ui-{c}-ring', label='--ui-text-highlighted', icon=icon_tone, ring=f'--ui-{c}')
    if variant == 'ghost':
        if neutral:
            return Tone(fill=None, hover='--ui-bg-elevated', stroke=None, label='--ui-text-toned', icon='--ui-text-toned', ring='--ui-ring')
        return Tone(fill=None, hover=f'--ui-{c}-soft', stroke=None, label=f'--ui-{c}-text', icon=f'--ui-{c}-text', ring=f'--ui-{c}')
    if variant == 'link':
        if neutral:
            return Tone(fill=None, hover=None, stroke=None, label='--ui-text-muted', icon='--ui-text-muted', ring='--ui-ring')
        return Tone(fill=None, hover=None, stroke=None, label=f'--ui-{c}-text', icon=f'--ui-{c}-text', ring=f'--ui-{c}')
    raise KeyError(variant)


def vname(**axes):
    return ', '.join(f'{k}={v}' for k, v in axes.items())


def swap_prop(master_name):
    return {'type': 'instanceSwap', 'default': I.ICON_MASTERS[master_name].id}


def text_prop(default):
    return {'type': 'text', 'default': default}


REG = {}     # (set name, variant name) -> component node
AXES = {}    # set name -> [axis names]


def use(setname, name=None, **axes):
    """Instance of a variant from a previously built set. Axes not given default to the first value used when building."""
    order = AXES[setname]
    vn = ', '.join(f'{a}={axes[a]}' for a in order)
    return figlib.instance(REG[(setname, vn)], name=name or setname)


def set_text(inst, layer, chars):
    t = inst.find(layer)
    t.chars = chars
    if 'characters' not in t.overrides:
        t.overrides.append('characters')
    return t


def make_set(name, desc, axes, build, row_axes, pad=24, gap=24):
    """axes: [(axis_name, [values])]. build(**{axis: value}) -> component node (named by caller via vname).
    Variants are laid out in rows keyed by row_axes; other axes run along the row."""
    names = [a for a, _ in axes]
    AXES[name] = names
    combos = list(itertools.product(*[v for _, v in axes]))
    rows = {}
    for combo in combos:
        d = dict(zip(names, combo))
        comp = build(**d)
        layout(comp)
        REG[(name, comp.name)] = comp
        key = tuple(d[a] for a in row_axes)
        rows.setdefault(key, []).append(comp)
    y = pad
    maxw = 0
    for key, comps in rows.items():
        x = pad
        rh = max(c.h for c in comps)
        for c in comps:
            c.x = x
            c.y = y + (rh - c.h) / 2 if False else y
            x += c.w + gap
        y += rh + gap
        maxw = max(maxw, x - gap + pad)
    s = N('componentSet', name, w=maxw, h=y - gap + pad, description=desc, fill=('#ffffff', 1.0),
          stroke=('#9747ff', 1.0), radius=5, clip=True, sw='fixed', sh='fixed')
    for comps in rows.values():
        s.add(*comps)
    return s


def section(title, desc, notes, *contents, w=None):
    """Titled block for the Components page."""
    kids = [text('Title', title, 'Nexa/Title', '--ui-text-highlighted'),
            text('Description', desc, 'Nexa/Body', '--ui-text-muted')]
    for nt in notes:
        kids.append(text('Note', nt, 'Nexa/Small', '--ui-text-toned'))
    f = frame(f'Section / {title}', *kids, *contents, dir='v', gap=12, sw='hug', sh='hug')
    return f


def swap_icon(inst, layer, icon_name):
    """Instance-swap override: replace the icon child named `layer` of an instance with another Lucide icon."""
    old = inst.find(layer)
    par = old.parent
    size = old.w
    col = next((c.stroke for c in old.walk() if c.stroke), None)
    new = I.icon(icon_name, size, col, old.name)
    new.x, new.y = old.x, old.y
    new.source = old.source
    new.overrides = ['component']
    new.parent = par
    par.children[par.children.index(old)] = new
    return new
