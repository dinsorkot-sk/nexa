"""Foundations page: documents the variables and styles (all swatches are bound to the variables)."""
from comp_base import *
import tokens

H = lambda t, **k: text('Heading', t, 'Nexa/Heading', '--ui-text-highlighted', **k)


def swatch(label, var, w=88, h=56, sub=None):
    kids = [rect('Swatch', w, h, var, radius='radius/md', stroke='--ui-border' if False else None),
            text('Name', label, 'Nexa/Small Medium', '--ui-text-highlighted')]
    if sub:
        kids.append(text('Value', sub, 'Nexa/Small', '--ui-text-muted'))
    return frame(f'Swatch / {label}', *kids, dir='v', gap=6, sw='fixed', w=w)


def ramp_row(ramp):
    items = [swatch(s, f'{ramp}/{s}', sub=tokens.RAMPS[ramp][s]) for s in tokens.STEPS]
    return frame(f'Palette / {ramp}', text('Title', ramp, 'Nexa/Subheading', '--ui-text-highlighted'),
                 frame('Steps', *items, dir='h', gap=8), dir='v', gap=12)


def colors_section():
    rows = [ramp_row(r) for r in ('green', 'blue', 'yellow', 'red', 'slate')]
    return frame('Color primitives', H('Color primitives'),
                 text('Note', 'Raw palette (Nuxt UI). Never apply these to a component: components use the semantic tokens below. Mapping: primary and success = green, secondary and info = blue, warning = yellow, error = red, neutral = slate.',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True),
                 *rows, dir='v', gap=24, sw='fill')


GROUPS = [
    ('Surfaces', ['--ui-bg', '--ui-bg-muted', '--ui-bg-elevated', '--ui-bg-accented', '--ui-bg-inverted', '--ui-overlay']),
    ('Text', ['--ui-text-highlighted', '--ui-text', '--ui-text-toned', '--ui-text-muted', '--ui-text-dimmed', '--ui-text-inverted', '--ui-on-solid']),
    ('Borders and focus', ['--ui-border', '--ui-border-muted', '--ui-border-accented', '--ui-border-inverted', '--ui-ring']),
] + [(cap(c) + ' (brand/status)', [f'--ui-{c}', f'--ui-{c}-text', f'--ui-{c}-hover', f'--ui-{c}-soft', f'--ui-{c}-soft-hover', f'--ui-{c}-ring', f'--ui-{c}-outline'])
     for c in ('primary', 'secondary', 'success', 'info', 'warning', 'error')] + [('Neutral', ['--ui-neutral', '--ui-neutral-hover'])]


def token_card(mode):
    kids = [text('Mode', mode, 'Nexa/Subheading', '--ui-text-highlighted')]
    for gname, toks in GROUPS:
        items = []
        for t in toks:
            items.append(frame(f'Token / {t}', rect('Swatch', 36, 36, t, radius='radius/md', stroke='--ui-border-accented'),
                               text('Name', t, 'Nexa/Small', '--ui-text'), dir='h', cross='center', gap=10, sw='fixed', w=240))
        grid = frame(gname, *items, dir='h', gap=12, sw='fill')
        # wrap into rows of three
        rows = [frame('Row', *items[i:i + 3], dir='h', gap=12) for i in range(0, len(items), 3)]
        kids.append(frame(f'Group / {gname}', text('Group', gname, 'Nexa/Small Medium', '--ui-text-muted'), *rows, dir='v', gap=8))
    return frame(f'Semantic / {mode}', *kids, dir='v', gap=16, pad=(24, 24, 24, 24), radius='radius/xl', fill='--ui-bg', stroke='--ui-border',
                 var_modes={'Nexa / Semantic colors': mode}, sw='fixed', w=816)


def semantic_section():
    return frame('Semantic colors', H('Semantic colors'),
                 text('Note', 'These are the variables components bind to. One collection with Light and Dark modes: set a frame to the Dark variable mode and every bound fill, stroke and label switches. Names match the CSS variables in packages/ui (--ui-*). Labels on solid fills use --ui-on-solid; labels on tints use --ui-text-highlighted (WCAG AA).',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True),
                 frame('Modes', token_card('Light'), token_card('Dark'), dir='h', gap=24), dir='v', gap=24, sw='fill')


def type_section():
    rows = []
    for s in DOC.styles:
        if s['type'] != 'text':
            continue
        st = s['style']
        spec = f"{st['font_family']} {st['font_style']} · {st['font_size']:g}/{st['line_height']['value']:g}"
        sample = 'The quick brown fox 0123 {}[]' if st['font_family'] == 'Consolas' else 'The quick brown fox · ทดสอบข้อความภาษาไทย 0123'
        rows.append(frame(f"Type / {s['name']}", frame('Meta', text('Style', s['name'], 'Nexa/Small Medium', '--ui-text-highlighted'),
                                                       text('Spec', spec, 'Nexa/Small', '--ui-text-muted'), dir='v', gap=2, sw='fixed', w=240),
                          text('Sample', sample, s['name'], '--ui-text-highlighted'), dir='h', cross='center', gap=24, pad=(12, 0, 12, 0), sw='fill',
                          stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    return frame('Typography', H('Typography'),
                 text('Note', 'Inter for Latin; Thai glyphs fall back to Noto Sans Thai, so install both. Weights: Regular 400, Medium 500, Semi Bold 600. Apply a text style, never a loose font size.',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), *rows, dir='v', gap=8, sw='fill')


def space_section():
    bars = []
    for v in tokens.SPACE:
        bars.append(frame(f'Space / {v}', rect('Bar', v, 20, '--ui-primary', radius=2), text('Name', f'space/{v}', 'Nexa/Small', '--ui-text'), dir='v', gap=6, cross='min', sw='fixed', w=72))
    return frame('Spacing', H('Spacing'),
                 text('Note', 'Gap and padding variables on a 2px base. Auto-layout frames bind to them. Control heights: sm 28, md 36, lg 44. Icon sizes: 12, 14, 16 (default), 20, 24.',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), frame('Bars', *bars, dir='h', gap=16, cross='max'), dir='v', gap=16, sw='fill')


def radius_section():
    items = []
    for role in list(tokens.RADIUS) + ['full']:
        items.append(frame(f'Radius / {role}', rect('Box', 72, 72, '--ui-bg-elevated', radius=f'radius/{role}', stroke='--ui-border-accented'),
                           text('Name', f'radius/{role}', 'Nexa/Small', '--ui-text'), dir='v', gap=6, sw='fixed', w=96))
    return frame('Radius', H('Radius'),
                 text('Note', 'Multiples of one base radius (Nuxt UI): switch the Radius variable mode to Compact (2), Default (4), Comfortable (6) or Round (8) to restyle every component. Buttons and inputs use radius/md, cards and modals radius/xl, pills radius/full.',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), frame('Boxes', *items, dir='h', gap=16), dir='v', gap=16, sw='fill')


def shadow_section():
    items = []
    for nm, fx in (('shadow/sm', SHADOW_SM), ('shadow/md', SHADOW_MD), ('shadow/lg', SHADOW_LG)):
        items.append(frame(nm, frame('Box', sw='fixed', sh='fixed', w=120, h=72, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', effects=fx),
                           text('Name', nm, 'Nexa/Small', '--ui-text'), dir='v', gap=12, sw='fixed', w=140))
    return frame('Elevation', H('Elevation'),
                 text('Note', 'sm: segmented active item. md: menus and popovers. lg: modals and toasts. Colour is slate-900 at 7%, 10% and 16%.',
                      'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), frame('Boxes', *items, dir='h', gap=24, pad=(0, 0, 24, 0)), dir='v', gap=16, sw='fill')


def rules_section():
    rules = [
        'Bind every fill, stroke and text colour to a semantic variable (--ui-*). Do not use the primitives or a hex value in a component.',
        'Light and Dark are the two modes of Nexa / Semantic colors. Put a frame in Dark mode to preview or to build an always-dark area such as the Builder sidebar.',
        'Solid fills carry --ui-on-solid labels; tinted (Soft, Subtle, Outline) components carry --ui-text-highlighted labels. This keeps text at WCAG AA, which the Nuxt UI defaults do not.',
        'Components expose Color, Variant, Size and State as variant properties, Label and Icon as component properties. Change them in the right panel; do not detach an instance.',
        'Icons are Lucide, 24px, stroke 2. Use the Icon swap property; the Icons page holds the full set.',
        'Focus is a 2px outer ring in the component colour (neutral controls use --ui-ring). Disabled is 50% opacity.',
    ]
    return frame('Rules', H('Rules'), *[text('Rule', f'{i + 1}. {r}', 'Nexa/Body', '--ui-text', sw='fill', autoh=True) for i, r in enumerate(rules)], dir='v', gap=10, sw='fill')


def build_foundations_page():
    pg = page('Foundations')
    root = frame('Foundations', frame('Heading', text('Title', 'Nexa Foundations', 'Nexa/Display', '--ui-text-highlighted'),
                 text('Intro', 'Variables, text styles and rules every Nexa component is built from. Source: the Nuxt UI token set used by the screens in the mockup, adapted for Thai-first admin work.',
                      'Nexa/Body Large', '--ui-text-muted', sw='fill', autoh=True), dir='v', gap=8, sw='fill'),
                 rules_section(), colors_section(), semantic_section(), type_section(), space_section(), radius_section(), shadow_section(),
                 dir='v', gap=64, pad=(64, 64, 64, 64), sw='fixed', w=1760, fill='--ui-bg')
    layout(root)
    root.x, root.y = 0, 0
    pg.add(root)
    return pg
