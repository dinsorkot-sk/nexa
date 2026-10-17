from comp_base import *


def spinner_name():
    return 'loader-circle'


def _button_root(name, color, variant, size, state, kids, square=False):
    S = SIZES[size]
    t = tone(color, variant)
    fill = t.fill
    stroke = t.stroke
    stroke_w, stroke_align = 1, 'inside'
    opacity = None
    underline = False
    if state == 'Hover':
        fill = t.hover if t.hover else fill
        underline = variant == 'link'
    if state == 'Focus':
        stroke, stroke_w, stroke_align = t.ring, 2, 'outside'
    if state == 'Disabled':
        opacity = 0.5
    kw = dict(dir='h', main='center', cross='center', gap=S['gap'], radius=S['r'], fill=fill, stroke=stroke,
              stroke_w=stroke_w, stroke_align=stroke_align, opacity=opacity)
    if square:
        kw.update(sw='fixed', sh='fixed', w=S['h'], h=S['h'], pad=(0, 0, 0, 0))
    else:
        kw.update(pad=(S['py'], S['px'], S['py'], S['px']))
    return component(name, *kids, **kw), underline, t, S


def build_button(Color, Variant, Size, State, Icon):
    color, variant, size = Color.lower(), Variant.lower(), Size
    S = SIZES[size]
    t = tone(color, variant)
    props = {'Label': text_prop('Button')}
    kids = []
    if State == 'Loading':
        kids.append(I.icon('loader-circle', S['icon'], t.icon, 'Spinner'))
    elif Icon == 'Leading':
        kids.append(I.icon('plus', S['icon'], t.icon, 'Icon'))
        props['Icon'] = swap_prop('plus')
    comp, underline, t, S = _button_root(vname(Color=Color, Variant=Variant, Size=Size, State=State, Icon=Icon), color, variant, size, State, [], False)
    comp.add(*kids)
    comp.add(text('Label', 'Button', S['text'], t.label, underline=underline))
    if Icon == 'Trailing':
        comp.add(I.icon('chevron-down', S['icon'], t.icon, 'Trailing icon'))
        props['Trailing icon'] = swap_prop('chevron-down')
    comp.props = props
    return comp


def build_icon_button(Color, Variant, Size, State):
    color, variant, size = Color.lower(), Variant.lower(), Size
    S = SIZES[size]
    t = tone(color, variant)
    name = vname(Color=Color, Variant=Variant, Size=Size, State=State)
    comp, _, t, S = _button_root(name, color, variant, size, State, [], True)
    if State == 'Loading':
        comp.add(I.icon('loader-circle', S['icon'], t.icon, 'Spinner'))
        comp.props = {}
    else:
        comp.add(I.icon('ellipsis', S['icon'], t.icon, 'Icon'))
        comp.props = {'Icon': swap_prop('ellipsis')}
    return comp


COLOR_AX = [cap(c) for c in COLORS]
VARIANT_AX = ['Solid', 'Outline', 'Soft', 'Ghost', 'Link']


def button_set():
    return make_set('Button', 'Use for actions. Color picks the intent, Variant the emphasis. Label is editable; swap Icon for another Lucide icon. Loading replaces the leading icon with a spinner.',
                    [('Color', COLOR_AX), ('Variant', VARIANT_AX), ('Size', ['sm', 'md', 'lg']),
                     ('State', ['Default', 'Hover', 'Focus', 'Disabled', 'Loading']), ('Icon', ['None', 'Leading', 'Trailing'])],
                    build_button, row_axes=['Color', 'Variant', 'Size'])


def icon_button_set():
    return make_set('IconButton', 'Icon-only button. Always give it an accessible name in code (aria-label). Same Color, Variant and Size as Button.',
                    [('Color', COLOR_AX), ('Variant', VARIANT_AX), ('Size', ['sm', 'md', 'lg']),
                     ('State', ['Default', 'Hover', 'Focus', 'Disabled', 'Loading'])],
                    build_icon_button, row_axes=['Color', 'Variant', 'Size'])
