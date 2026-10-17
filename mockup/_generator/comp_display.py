from comp_base import *

# ------------------------------------------------------------------ Badge
BADGE = {'sm': dict(py=2, px=6, gap=4, icon=10, dot=5, text='Nexa/Caption'),
         'md': dict(py=4, px=8, gap=4, icon=12, dot=6, text='Nexa/Small Medium'),
         'lg': dict(py=4, px=10, gap=6, icon=14, dot=8, text='Nexa/Body Medium')}
BADGE_VARIANTS = ['Solid', 'Outline', 'Soft', 'Subtle']
STATUS_AX = [cap(c) for c in STATUS]


def build_badge(Color, Variant, Size, Leading):
    c, v = Color.lower(), Variant.lower()
    S = BADGE[Size]
    t = tone(c, v)
    comp = component(vname(Color=Color, Variant=Variant, Size=Size, Leading=Leading), dir='h', main='center', cross='center',
                     gap=S['gap'], pad=(S['py'], S['px'], S['py'], S['px']), radius='radius/full', fill=t.fill, stroke=t.stroke)
    props = {'Label': text_prop('Badge')}
    if Leading == 'Dot':
        dot_fill = t.label if v == 'solid' else ('--ui-text-muted' if c == 'neutral' else f'--ui-{c}')
        comp.add(ellipse('Dot', S['dot'], S['dot'], dot_fill))
    elif Leading == 'Icon':
        comp.add(I.icon('check', S['icon'], t.icon, 'Icon'))
        props['Icon'] = swap_prop('check')
    comp.add(text('Label', 'Badge', S['text'], t.label))
    comp.props = props
    return comp


def badge_set():
    return make_set('Badge', 'Short status or count label. Color is the meaning, Variant the emphasis. Labels on tints use the highlighted text token for contrast.',
                    [('Color', STATUS_AX), ('Variant', BADGE_VARIANTS), ('Size', ['sm', 'md', 'lg']), ('Leading', ['None', 'Dot', 'Icon'])],
                    build_badge, ['Color', 'Variant'])


# ------------------------------------------------------------------ Indicator (notification dot / count)
def build_indicator(Color, Size, Content):
    c = Color.lower()
    dot = {'sm': 8, 'md': 10, 'lg': 12}[Size]
    fill = '--ui-bg-inverted' if c == 'neutral' else f'--ui-{c}'
    label = '--ui-text-inverted' if c == 'neutral' else '--ui-on-solid'
    if Content == 'Dot':
        comp = component(vname(Color=Color, Size=Size, Content=Content), sw='fixed', sh='fixed', w=dot, h=dot,
                         radius='radius/full', fill=fill, stroke='--ui-bg', stroke_w=2, stroke_align='outside')
    else:
        hh = {'sm': 14, 'md': 16, 'lg': 20}[Size]
        st = {'sm': 'Nexa/Caption', 'md': 'Nexa/Caption', 'lg': 'Nexa/Small Medium'}[Size]
        comp = component(vname(Color=Color, Size=Size, Content=Content), dir='h', main='center', cross='center', sh='fixed', h=hh,
                         pad=(0, 4, 0, 4), radius='radius/full', fill=fill, stroke='--ui-bg', stroke_w=2, stroke_align='outside')
        comp.add(text('Count', '9', st, label))
        comp.props = {'Count': text_prop('9')}
    return comp


def indicator_set():
    return make_set('Indicator', 'Notification dot or count that sits on the corner of a button, avatar or icon (Nuxt UI Chip). Place it with absolute position over the host.',
                    [('Color', STATUS_AX), ('Size', ['sm', 'md', 'lg']), ('Content', ['Dot', 'Count'])],
                    build_indicator, ['Color'])


# ------------------------------------------------------------------ Chip (tag / filter)
def build_chip(Color, Size, Icon, Removable):
    c = Color.lower()
    S = {'sm': dict(py=2, px=8, gap=4, icon=12, text='Nexa/Small'), 'md': dict(py=4, px=10, gap=6, icon=14, text='Nexa/Body')}[Size]
    if c == 'primary':
        fill, stroke, label, ic = '--ui-primary-soft', '--ui-primary-outline', '--ui-text-highlighted', '--ui-primary-text'
    else:
        fill, stroke, label, ic = '--ui-bg-elevated', '--ui-border-accented', '--ui-text-toned', '--ui-text-muted'
    comp = component(vname(Color=Color, Size=Size, Icon=Icon, Removable=Removable), dir='h', main='center', cross='center',
                     gap=S['gap'], pad=(S['py'], S['px'], S['py'], S['px']), radius='radius/full', fill=fill, stroke=stroke)
    props = {'Label': text_prop('Chip')}
    if Icon == 'Leading':
        comp.add(I.icon('tag', S['icon'], ic, 'Icon'))
        props['Icon'] = swap_prop('tag')
    comp.add(text('Label', 'Chip', S['text'], label))
    if Removable == 'Yes':
        comp.add(I.icon('x', S['icon'], ic, 'Remove'))
    comp.props = props
    return comp


def chip_set():
    return make_set('Chip', 'Filter or tag pill. Removable adds an x for dismissing it.',
                    [('Color', ['Neutral', 'Primary']), ('Size', ['sm', 'md']), ('Icon', ['None', 'Leading']), ('Removable', ['No', 'Yes'])],
                    build_chip, ['Color', 'Size'])


# ------------------------------------------------------------------ Avatar
AV = {'xs': (20, 'Nexa/Caption', 10), 'sm': (24, 'Nexa/Caption', 12), 'md': (32, 'Nexa/Small Medium', 16),
      'lg': (40, 'Nexa/Body Medium', 20), 'xl': (48, 'Nexa/Body Large Medium', 24)}


def build_avatar(Size, Type, Color):
    px, st, ic = AV[Size]
    c = Color.lower()
    fill = '--ui-bg-accented' if c == 'neutral' else '--ui-primary-soft-hover'
    label = '--ui-text-toned' if c == 'neutral' else '--ui-text-highlighted'
    comp = component(vname(Size=Size, Type=Type, Color=Color), dir='h', main='center', cross='center', sw='fixed', sh='fixed',
                     w=px, h=px, radius='radius/full', fill=fill, clip=True)
    if Type == 'Initials':
        comp.add(text('Initials', 'SK', st, label))
        comp.props = {'Initials': text_prop('SK')}
    elif Type == 'Icon':
        comp.add(I.icon('user', ic, label, 'Icon'))
        comp.props = {'Icon': swap_prop('user')}
    else:
        comp.fill = '--ui-bg-elevated'
        comp.add(I.icon('image', ic, '--ui-text-dimmed', 'Image placeholder'))
    return comp


def avatar_set():
    return make_set('Avatar', 'User or entity avatar. Initials come from the name. For a photo, replace the fill of the Image variant with an image.',
                    [('Size', list(AV)), ('Type', ['Initials', 'Icon', 'Image']), ('Color', ['Neutral', 'Primary'])],
                    build_avatar, ['Size', 'Type'])


# ------------------------------------------------------------------ Kbd
def build_kbd(Variant, Size):
    S = {'sm': ('Nexa/Caption', 1, 6), 'md': ('Nexa/Small Medium', 2, 6), 'lg': ('Nexa/Body Medium', 2, 8)}[Size]
    if Variant == 'Solid':
        fill, stroke, label = '--ui-bg-inverted', None, '--ui-text-inverted'
    elif Variant == 'Outline':
        fill, stroke, label = '--ui-bg', '--ui-border-accented', '--ui-text-toned'
    else:
        fill, stroke, label = '--ui-bg-elevated', '--ui-border', '--ui-text-muted'
    comp = component(vname(Variant=Variant, Size=Size), dir='h', main='center', cross='center', pad=(S[1], S[2], S[1], S[2]),
                     radius='radius/sm', fill=fill, stroke=stroke)
    comp.add(text('Keys', 'Ctrl K', S[0], label))
    comp.props = {'Keys': text_prop('Ctrl K')}
    return comp


def kbd_set():
    return make_set('Kbd', 'Keyboard shortcut hint, for example next to a search field or a menu item.',
                    [('Variant', ['Subtle', 'Outline', 'Solid']), ('Size', ['sm', 'md', 'lg'])], build_kbd, ['Variant'])


# ------------------------------------------------------------------ Logo (brand mark; the two leaf colours are the brand asset, not theme tokens)
def _leaf(name, s, tf, color):
    r = rect(name, 11 * s, 25 * s, ('#10b981', 1.0) if color == 'A' else ('#34d399', 1.0), radius=5.5 * s, absolute=True,
             extra={'transform': [tf[0], tf[1], tf[2], tf[3], tf[4] * s, tf[5] * s]})
    return r


def build_logo(Type, Size):
    px = {'sm': 24, 'md': 32, 'lg': 48}[Size]
    s = px / 28
    mark = frame('Mark', _leaf('Leaf A', s, [0.7071067811865476, -0.7071067811865476, 0.7071067811865476, 0.7071067811865476, 1.2720779386421448, 9.050252531694166], 'A'),
                 _leaf('Leaf B', s, [0.7071067811865476, 0.7071067811865476, -0.7071067811865476, 0.7071067811865476, 18.949747468305834, 1.2720779386421448], 'B'),
                 sw='fixed', sh='fixed', w=px, h=px)
    comp = component(vname(Type=Type, Size=Size), dir='h', cross='center', gap=8)
    comp.add(mark)
    if Type == 'Full':
        comp.add(text('Wordmark', 'Nexa', {'sm': 'Nexa/Subheading', 'md': 'Nexa/Heading', 'lg': 'Nexa/Title'}[Size], '--ui-text-highlighted'))
    return comp


def logo_set():
    return make_set('Logo', 'Nexa mark and wordmark. The mark uses the two brand greens; do not recolor.',
                    [('Type', ['Mark', 'Full']), ('Size', ['sm', 'md', 'lg'])], build_logo, ['Type'])


# ------------------------------------------------------------------ Card
def build_card(Variant, Header, Footer):
    v = Variant.lower()
    fill, stroke = {'outline': ('--ui-bg', '--ui-border'), 'soft': ('--ui-bg-muted', None),
                    'subtle': ('--ui-bg-muted', '--ui-border'), 'solid': ('--ui-bg-inverted', None)}[v]
    tx = '--ui-text-inverted' if v == 'solid' else '--ui-text-highlighted'
    tx2 = '--ui-text-inverted' if v == 'solid' else '--ui-text-muted'
    div = '--ui-border-inverted' if v == 'solid' else '--ui-border'
    comp = component(vname(Variant=Variant, Header=Header, Footer=Footer), dir='v', sw='fixed', w=360, radius='radius/xl', fill=fill,
                     stroke=stroke, clip=True)
    if Header == 'Yes':
        comp.add(frame('Header', text('Title', 'Card title', 'Nexa/Subheading', tx), text('Description', 'Supporting description', 'Nexa/Small', tx2),
                       dir='v', gap=2, pad=(16, 16, 16, 16), sw='fill', stroke=div, stroke_sides=(0, 0, 1, 0)))
    comp.add(frame('Body', text('Content', 'Card content goes here. Replace this block with any layout.', 'Nexa/Body', '--ui-text-inverted' if v == 'solid' else '--ui-text', sw='fill', autoh=True),
                   dir='v', pad=(16, 16, 16, 16), sw='fill'))
    if Footer == 'Yes':
        comp.add(frame('Footer', text('Meta', 'Footer', 'Nexa/Small', tx2), dir='h', cross='center', pad=(12, 16, 12, 16), sw='fill',
                       stroke=div, stroke_sides=(1, 0, 0, 0)))
    return comp


def card_set():
    return make_set('Card', 'Container with optional header and footer. Body is a free area: put any layout inside.',
                    [('Variant', ['Outline', 'Soft', 'Subtle', 'Solid']), ('Header', ['Yes', 'No']), ('Footer', ['No', 'Yes'])],
                    build_card, ['Variant'])


# ------------------------------------------------------------------ Alert
ALERT_ICON = {'primary': 'info', 'secondary': 'info', 'success': 'circle-check', 'info': 'info', 'warning': 'triangle-alert',
              'error': 'circle-alert', 'neutral': 'info'}


def build_alert(Color, Variant, Description):
    c, v = Color.lower(), Variant.lower()
    t = tone(c, v)
    ic = ALERT_ICON[c]
    solid = v == 'solid'
    desc_col = t.label if solid else '--ui-text-toned'
    comp = component(vname(Color=Color, Variant=Variant, Description=Description), dir='h', sw='fixed', w=380, gap=12,
                     pad=(12, 16, 12, 16), radius='radius/lg', fill=t.fill, stroke=t.stroke)
    comp.add(I.icon(ic, 20, t.icon, 'Icon'))
    body = frame('Text', text('Title', 'Heads up', 'Nexa/Body Medium', t.label, sw='fill'), dir='v', gap=2, sw='fill')
    if Description == 'Yes':
        body.add(text('Description', 'Something needs your attention before you continue.', 'Nexa/Small', desc_col, sw='fill', autoh=True))
    comp.add(body)
    comp.add(I.icon('x', 16, t.icon, 'Close'))
    comp.props = {'Title': text_prop('Heads up'), 'Icon': swap_prop(ic)}
    if Description == 'Yes':
        comp.props['Description'] = text_prop('Something needs your attention before you continue.')
    return comp


def alert_set():
    return make_set('Alert', 'Inline message for a section or page. Pick the Color by meaning (info, success, warning, error).',
                    [('Color', STATUS_AX), ('Variant', BADGE_VARIANTS), ('Description', ['Yes', 'No'])],
                    build_alert, ['Color', 'Variant'])


# ------------------------------------------------------------------ Toast
def build_toast(Color, Action):
    c = Color.lower()
    ic = {'neutral': 'info', 'success': 'circle-check', 'info': 'info', 'warning': 'triangle-alert', 'error': 'circle-alert'}[c]
    icc = '--ui-text-muted' if c == 'neutral' else ('--ui-text-highlighted' if c == 'warning' else f'--ui-{c}-text')
    comp = component(vname(Color=Color, Action=Action), dir='h', sw='fixed', w=360, gap=12, pad=(16, 16, 16, 16), radius='radius/xl',
                     fill='--ui-bg', stroke='--ui-border', effects=SHADOW_LG)
    comp.add(I.icon(ic, 20, icc, 'Icon'))
    body = frame('Text', text('Title', 'Saved', 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'),
                 text('Description', 'Your changes were saved.', 'Nexa/Small', '--ui-text-muted', sw='fill', autoh=True), dir='v', gap=2, sw='fill')
    if Action == 'Button':
        body.add(frame('Action', use('Button', name='Action', Color='Neutral', Variant='Outline', Size='sm', State='Default', Icon='None'),
                       dir='h', pad=(10, 0, 0, 0)))
    comp.add(body)
    comp.add(I.icon('x', 16, '--ui-text-muted', 'Close'))
    comp.props = {'Title': text_prop('Saved'), 'Description': text_prop('Your changes were saved.'), 'Icon': swap_prop(ic)}
    return comp


def toast_set():
    return make_set('Toast', 'Transient feedback after an action. Error toasts are announced as alerts in code; the others as status.',
                    [('Color', ['Neutral', 'Success', 'Info', 'Warning', 'Error']), ('Action', ['None', 'Button'])],
                    build_toast, ['Color'])


# ------------------------------------------------------------------ Tooltip
def build_tooltip(Placement, Kbd):
    comp = component(vname(Placement=Placement, Kbd=Kbd), dir='h', cross='center', gap=8, pad=(4, 8, 4, 8), radius='radius/sm', fill='--ui-bg-inverted')
    comp.add(text('Text', 'Tooltip text', 'Nexa/Small', '--ui-text-inverted'))
    if Kbd == 'Yes':
        comp.add(frame('Kbd', text('Keys', 'K', 'Nexa/Caption', '--ui-text-inverted'), pad=(0, 4, 0, 4), radius='radius/xs', stroke='--ui-text-muted'))
    comp.props = {'Text': text_prop('Tooltip text')}
    # arrow: 8px square rotated 45deg on the edge facing the host; positioned after layout
    arrow = rect('Arrow', 8, 8, '--ui-bg-inverted', absolute=True)
    comp.add(arrow)
    comp._arrow = (arrow, Placement)
    return comp


def tooltip_set():
    s = make_set('Tooltip', 'Short hint shown on hover or focus. Placement is the side of the host the tooltip appears on.',
                 [('Placement', ['Top', 'Bottom', 'Left', 'Right']), ('Kbd', ['No', 'Yes'])], build_tooltip, ['Placement'])
    for c in s.children:
        arrow, pl = c._arrow
        w, h = c.w, c.h
        import math
        k = math.sqrt(0.5)
        cx, cy = {'Top': (w / 2, h), 'Bottom': (w / 2, 0), 'Left': (w, h / 2), 'Right': (0, h / 2)}[pl]
        arrow.x, arrow.y = cx - 4, cy - 4
        arrow.extra = {'transform': [k, k, -k, k, cx, cy - 8 * k]}
    return s


# ------------------------------------------------------------------ Separator, Skeleton
def build_separator(Orientation, Label):
    if Orientation == 'Horizontal':
        comp = component(vname(Orientation=Orientation, Label=Label), dir='h', cross='center', gap=12, sw='fixed', w=240)
        comp.add(frame('Line', sw='fill', sh='fixed', h=1, fill='--ui-border'))
        if Label == 'Text':
            comp.add(text('Label', 'or', 'Nexa/Small', '--ui-text-muted'))
            comp.add(frame('Line', sw='fill', sh='fixed', h=1, fill='--ui-border'))
    else:
        comp = component(vname(Orientation=Orientation, Label=Label), dir='v', main='center', cross='center', gap=8, sh='fixed', h=64, sw='hug')
        comp.add(frame('Line', sw='fixed', sh='fill', w=1, fill='--ui-border'))
        if Label == 'Text':
            comp.add(text('Label', 'or', 'Nexa/Small', '--ui-text-muted'))
            comp.add(frame('Line', sw='fixed', sh='fill', w=1, fill='--ui-border'))
    return comp


def separator_set():
    return make_set('Separator', 'Thin divider, optionally with a label in the middle.',
                    [('Orientation', ['Horizontal', 'Vertical']), ('Label', ['None', 'Text'])], build_separator, ['Orientation'])


def build_skeleton(Shape):
    if Shape == 'Line':
        return component(vname(Shape=Shape), sw='fixed', sh='fixed', w=160, h=16, radius='radius/md', fill='--ui-bg-elevated')
    if Shape == 'Circle':
        return component(vname(Shape=Shape), sw='fixed', sh='fixed', w=40, h=40, radius='radius/full', fill='--ui-bg-elevated')
    return component(vname(Shape=Shape), sw='fixed', sh='fixed', w=160, h=96, radius='radius/lg', fill='--ui-bg-elevated')


def skeleton_set():
    return make_set('Skeleton', 'Placeholder while content loads. Resize the instance to match the content it stands in for.',
                    [('Shape', ['Line', 'Circle', 'Block'])], build_skeleton, ['Shape'])
