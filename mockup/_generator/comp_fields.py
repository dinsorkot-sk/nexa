"""Field renderers for every FieldType in packages/meta (23): an input per state and a display per view."""
from comp_base import *
from comp_forms import field_look

TYPES = ['text', 'longText', 'number', 'integer', 'decimal', 'currency', 'percentage', 'boolean', 'date', 'datetime', 'time', 'select', 'multiSelect',
         'email', 'phone', 'url', 'json', 'file', 'image', 'reference', 'computed', 'formula', 'autoNumber']
# (leading icon, sample text, trailing icon/suffix text, mono)
SPEC = {
    'text': (None, 'Toyota Hilux', None, False), 'longText': (None, 'Long description that can run over several lines of text.', None, False),
    'number': (None, '1,204', None, False), 'integer': (None, '42', None, False), 'decimal': (None, '12.50', None, False),
    'currency': ('text:฿', '12,500.00', 'text:THB', False), 'percentage': (None, '45', 'text:%', False),
    'boolean': (None, 'Enabled', None, False), 'date': ('calendar', '15 Oct 2026', None, False), 'datetime': ('calendar-clock', '15 Oct 2026 14:30', None, False),
    'time': ('clock', '14:30', None, False), 'select': (None, 'Active', 'chevron-down', False), 'multiSelect': (None, '', 'chevron-down', False),
    'email': ('mail', 'name@example.com', None, False), 'phone': ('phone', '081 234 5678', None, False), 'url': ('link', 'https://example.com', 'external-link', False),
    'json': (None, '{ "plate": "AB-1234", "tags": [] }', None, True), 'file': ('paperclip', 'https://files.example.com/report.pdf', None, False),
    'image': ('image', 'https://files.example.com/photo.jpg', None, False), 'reference': ('link', 'Toyota Hilux', 'chevrons-up-down', False),
    'computed': ('calculator', '12,500', 'lock', True), 'formula': ('sigma', 'price * 1.07', 'lock', True), 'autoNumber': ('hash', 'VH-000123', 'lock', True),
}
AREA = {'longText': 88, 'json': 96}
TYPE_AX = [t for t in TYPES]


def _lead(spec, col):
    if spec is None:
        return None
    if spec.startswith('text:'):
        return text('Prefix', spec[5:], 'Nexa/Body', col)
    return I.icon(spec, 16, col, 'Icon')


def build_fieldinput(Type, State):
    lead, val, trail, mono = SPEC[Type]
    ro = Type in ('computed', 'formula', 'autoNumber')
    fill, stroke, sw, op = field_look('Outline', {'Default': 'Default', 'Focus': 'Focus', 'Error': 'Error', 'Disabled': 'Disabled', 'ReadOnly': 'Default', 'Loading': 'Default'}[State])
    if State == 'ReadOnly' or ro:
        fill, stroke = '--ui-bg-muted', '--ui-border'
    name = vname(Type=Type, State=State)
    vstyle = 'Nexa/Mono' if mono else 'Nexa/Body'
    vcol = '--ui-text-highlighted' if not ro else '--ui-text-toned'
    if Type == 'boolean':
        comp = component(name, dir='h', cross='center', gap=10, sw='fixed', w=320, pad=(8, 0, 8, 0), opacity=0.5 if State == 'Disabled' else None)
        comp.add(use('Switch', name='Switch', Checked='On', State='Default', Size='md', Label='No'))
        comp.add(text('Value', 'Enabled', 'Nexa/Body', '--ui-text-highlighted', sw='fill'))
        if State == 'Loading':
            comp.add(I.icon('loader-circle', 16, '--ui-text-muted', 'Spinner'))
        if State == 'Error':
            comp.add(I.icon('circle-alert', 16, '--ui-error-text', 'Error'))
        comp.props = {'Value': text_prop('Enabled')}
        return comp
    if Type in AREA:
        comp = component(name, dir='v', sw='fixed', sh='fixed', w=320, h=AREA[Type], pad=(8, 12, 8, 12), radius='radius/md', fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
        if State == 'Loading':
            comp.add(frame('Skeleton', sw='fixed', sh='fixed', w=200, h=12, radius='radius/sm', fill='--ui-bg-accented'))
        else:
            comp.add(text('Value', val, vstyle, vcol, sw='fill', autoh=True))
        comp.props = {'Value': text_prop(val)}
        return comp
    comp = component(name, dir='h', cross='center', gap=8, sw='fixed', w=320, pad=(8, 12, 8, 12), radius='radius/md', fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
    icol = '--ui-text-dimmed'
    l = _lead(lead, icol)
    if l:
        comp.add(l)
    if State == 'Loading':
        comp.add(frame('Skeleton', sw='fixed', sh='fixed', w=140, h=12, radius='radius/sm', fill='--ui-bg-accented'))
        comp.add(frame('Fill', sw='fill', sh='fixed', h=1))
        comp.add(I.icon('loader-circle', 16, '--ui-text-muted', 'Spinner'))
        return comp
    if Type == 'multiSelect':
        inner = frame('Chips', dir='h', gap=6, sw='fill')
        for nm in ['Diesel', 'Euro 5']:
            ch = use('Chip', name='Chip', Color='Neutral', Size='sm', Icon='None', Removable='Yes')
            set_text(ch, 'Label', nm)
            inner.add(ch)
        comp.add(inner)
        comp.pad = (6, 12, 6, 12)
    elif Type == 'select':
        comp.add(text('Value', val, vstyle, vcol, sw='fill'))
    else:
        comp.add(text('Value', val, vstyle, vcol, sw='fill'))
    if trail:
        if trail.startswith('text:'):
            comp.add(text('Suffix', trail[5:], 'Nexa/Body', '--ui-text-muted'))
        else:
            comp.add(I.icon(trail, 16, icol, 'Trailing icon'))
    if State == 'Error':
        comp.add(I.icon('circle-alert', 16, '--ui-error-text', 'Error'))
    if State == 'ReadOnly' and not ro:
        comp.add(I.icon('lock', 16, icol, 'Lock'))
    comp.props = {'Value': text_prop(val)}
    return comp


def fieldinput_set():
    return make_set('FieldInput', 'Editor for every field type of the platform (FieldTypeSchema). Wrap it in a FormField for label and message. computed, formula and autoNumber are always read-only. file and image store a URL; there is no upload.',
                    [('Type', TYPE_AX), ('State', ['Default', 'Focus', 'Error', 'Disabled', 'ReadOnly', 'Loading'])], build_fieldinput, ['Type'])


# ------------------------------------------------------------------ display (table cell, detail row, kanban line)
def _value_node(Type, View):
    lead, val, trail, mono = SPEC[Type]
    st = {'Table': 'Nexa/Body', 'Detail': 'Nexa/Body', 'Kanban': 'Nexa/Small'}[View]
    col = '--ui-text' if View == 'Table' else '--ui-text-highlighted'
    sz = 'sm'
    if Type == 'boolean':
        return frame('Value', I.icon('circle-check', 16, '--ui-success-text', 'Icon'), *([text('Text', 'Yes', st, col)] if View != 'Table' else []), dir='h', cross='center', gap=6)
    if Type == 'select':
        b = use('Badge', name='Badge', Color='Success', Variant='Soft', Size='sm', Leading='Dot')
        set_text(b, 'Label', 'Active')
        return b
    if Type == 'multiSelect':
        row = frame('Value', dir='h', gap=4, cross='center')
        for nm in ['Diesel', 'Euro 5']:
            b = use('Badge', name='Badge', Color='Neutral', Variant='Soft', Size='sm', Leading='None')
            set_text(b, 'Label', nm)
            row.add(b)
        return row
    if Type == 'reference':
        b = use('Badge', name='Reference', Color='Primary', Variant='Subtle', Size='sm', Leading='Icon')
        swap_icon(b, 'Icon', 'link')
        set_text(b, 'Label', 'Toyota Hilux')
        return b
    if Type == 'image':
        return frame('Value', frame('Thumb', I.icon('image', 14, '--ui-text-dimmed', 'Icon'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=24, h=24, radius='radius/sm', fill='--ui-bg-elevated'),
                     text('Text', 'photo.jpg', st, col), dir='h', cross='center', gap=8)
    if Type == 'file':
        return frame('Value', I.icon('paperclip', 14, '--ui-text-muted', 'Icon'), text('Text', 'report.pdf', st, '--ui-primary-text'), dir='h', cross='center', gap=6)
    if Type == 'url':
        return frame('Value', text('Text', 'example.com', st, '--ui-primary-text', underline=True), I.icon('external-link', 14, '--ui-text-muted', 'Icon'), dir='h', cross='center', gap=6)
    if Type in ('email', 'phone'):
        return text('Value', val, st, '--ui-primary-text', underline=Type == 'email')
    if Type == 'json':
        return frame('Value', text('Text', '{ } 3 keys', 'Nexa/Mono Small', '--ui-text-toned'), dir='h', pad=(2, 6, 2, 6), radius='radius/sm', fill='--ui-bg-elevated')
    if Type in ('computed', 'formula'):
        return frame('Value', I.icon('calculator' if Type == 'computed' else 'sigma', 14, '--ui-text-dimmed', 'Icon'), text('Text', '12,500' if Type == 'computed' else '13,375', 'Nexa/Mono', '--ui-text-toned'), dir='h', cross='center', gap=6)
    if Type == 'autoNumber':
        return text('Value', 'VH-000123', 'Nexa/Mono', '--ui-text-toned')
    if Type == 'currency':
        return text('Value', '฿12,500.00', st, col)
    if Type == 'percentage':
        if View == 'Detail':
            return frame('Value', text('Text', '45%', st, col), frame('Bar', frame('Fill', sw='fixed', sh='fixed', w=54, h=6, radius='radius/full', fill='--ui-primary'), dir='h', sw='fixed', sh='fixed', w=120, h=6, radius='radius/full', fill='--ui-bg-accented'),
                         dir='h', cross='center', gap=10)
        return text('Value', '45%', st, col)
    if Type == 'longText':
        return text('Value', 'Long description that can run over several lines of text.', st, col, sw='fixed', w=260 if View != 'Table' else 220, autoh=View != 'Table')
    txt = {'number': '1,204', 'integer': '42', 'decimal': '12.50'}.get(Type, val if Type not in ('date', 'datetime', 'time') else val)
    return text('Value', txt, st, col)


def build_fieldvalue(Type, View):
    name = vname(Type=Type, View=View)
    if View == 'Table':
        comp = component(name, dir='h', cross='center', sw='fixed', sh='fixed', w=240, h=44, pad=(0, 12, 0, 12), fill='--ui-bg', stroke='--ui-border', stroke_sides=(0, 0, 1, 0), clip=True)
        n = _value_node(Type, View)
        comp.add(n)
        if Type in ('number', 'integer', 'decimal', 'currency', 'percentage'):
            comp.main = 'max'
    elif View == 'Detail':
        comp = component(name, dir='v', gap=4, sw='fixed', w=280, pad=(8, 0, 8, 0))
        comp.add(text('Label', Type, 'Nexa/Small', '--ui-text-muted'))
        comp.add(_value_node(Type, View))
    else:
        comp = component(name, dir='h', cross='center', gap=6, sw='fixed', w=240)
        comp.add(text('Label', Type, 'Nexa/Small', '--ui-text-dimmed'))
        comp.add(_value_node(Type, View))
    comp.props = {'Label': text_prop(Type)} if View != 'Table' else {}
    return comp


def fieldvalue_set():
    return make_set('FieldValue', 'Read-only display of every field type. Table is a right-aligned cell for numbers, Detail is the label-over-value row of the record page, Kanban is the compact line on a card.',
                    [('Type', TYPE_AX), ('View', ['Table', 'Detail', 'Kanban'])], build_fieldvalue, ['Type'])
