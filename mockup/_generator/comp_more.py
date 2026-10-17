import math
from comp_base import *


# ------------------------------------------------------------------ Banner
def build_banner(Color, Action):
    c = Color.lower()
    ic = {'warning': 'wifi-off', 'error': 'circle-alert', 'info': 'info'}[c]
    comp = component(vname(Color=Color, Action=Action), dir='h', cross='center', gap=12, sw='fixed', w=1200, pad=(10, 24, 10, 24), fill=f'--ui-{c}-soft-hover',
                     stroke=f'--ui-{c}-ring', stroke_sides=(0, 0, 1, 0))
    comp.add(I.icon(ic, 18, '--ui-text-highlighted' if c == 'warning' else f'--ui-{c}-text', 'Icon'))
    comp.add(frame('Text', text('Title', {'warning': 'You are offline', 'error': 'Session expired', 'info': 'New version available'}[c], 'Nexa/Body Medium', '--ui-text-highlighted'),
                   text('Description', {'warning': 'Changes are paused and will sync when the connection returns.', 'error': 'Sign in again to continue.', 'info': 'Reload to get the latest update.'}[c],
                        'Nexa/Body', '--ui-text-toned'), dir='h', gap=8, cross='center', sw='fill'))
    if Action == 'Button':
        b = use('Button', name='Action', Color='Neutral', Variant='Outline', Size='sm', State='Default', Icon='None')
        set_text(b, 'Label', {'warning': 'Retry', 'error': 'Sign in', 'info': 'Reload'}[c])
        comp.add(b)
    comp.add(use('IconButton', name='Close', Color='Neutral', Variant='Ghost', Size='sm', State='Default'))
    swap_icon(comp.find('Close'), 'Icon', 'x')
    comp.props = {'Title': text_prop('You are offline')}
    return comp


def banner_set():
    return make_set('Banner', 'Sticky full-width message at the top of the app: offline, session expired, update available.',
                    [('Color', ['Warning', 'Error', 'Info']), ('Action', ['None', 'Button'])], build_banner, ['Color'])


# ------------------------------------------------------------------ Activity / Timeline
ACT = {'Created': ('plus', 'created this record', None), 'Updated': ('pencil', 'changed Status', ('Draft', 'Active')),
       'Transition': ('git-commit-horizontal', 'moved to In review', None), 'Comment': ('message-square', 'commented', None)}


def build_activity(Kind, Last):
    ic, verb, diff = ACT[Kind]
    comp = component(vname(Kind=Kind, Last=Last), dir='h', gap=12, sw='fixed', w=480)
    marker = frame('Marker', frame('Dot', I.icon(ic, 14, '--ui-text-muted', 'Icon'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=28, h=28, radius='radius/full', fill='--ui-bg-elevated', stroke='--ui-border'),
                   dir='v', cross='center', gap=4, sw='fixed', w=28, sh='fill')
    if Last == 'No':
        marker.add(frame('Line', sw='fixed', sh='fill', w=2, fill='--ui-border-accented'))
    comp.add(marker)
    body = frame('Content', dir='v', gap=4, pad=(4, 0, 16 if Last == 'No' else 0, 0), sw='fill')
    body.add(frame('Head', text('Who', 'Somchai K.', 'Nexa/Body Medium', '--ui-text-highlighted'), text('Verb', verb, 'Nexa/Body', '--ui-text-muted'), text('Time', '2 h ago', 'Nexa/Small', '--ui-text-dimmed'), dir='h', gap=6, cross='center'))
    if diff:
        b1 = use('Badge', name='From', Color='Neutral', Variant='Soft', Size='sm', Leading='None')
        set_text(b1, 'Label', diff[0])
        b2 = use('Badge', name='To', Color='Success', Variant='Soft', Size='sm', Leading='None')
        set_text(b2, 'Label', diff[1])
        body.add(frame('Diff', b1, I.icon('arrow-right', 14, '--ui-text-dimmed', 'Arrow'), b2, dir='h', gap=8, cross='center'))
    if Kind == 'Comment':
        body.add(frame('Bubble', text('Text', 'Service booked for next Monday.', 'Nexa/Body', '--ui-text', sw='fill', autoh=True), dir='v', pad=(8, 12, 8, 12), radius='radius/lg', fill='--ui-bg-muted', stroke='--ui-border', sw='fill'))
    comp.add(body)
    comp.props = {'Who': text_prop('Somchai K.')}
    return comp


def activity_set():
    return make_set('ActivityItem', 'One entry of the record activity trail (from the audit log). Last hides the connecting line.',
                    [('Kind', list(ACT)), ('Last', ['No', 'Yes'])], build_activity, ['Kind'])


def build_timeline(Count):
    comp = component(vname(Count=Count), dir='v', sw='fixed', w=480)
    kinds = ['Created', 'Updated', 'Transition', 'Comment'][:int(Count)]
    for i, k in enumerate(kinds):
        comp.add(use('ActivityItem', name=f'Item {i + 1}', Kind=k, Last='Yes' if i == len(kinds) - 1 else 'No'))
    return comp


def timeline_set():
    return make_set('Timeline', 'Vertical activity list for the Activity tab of a record.', [('Count', ['3', '4'])], build_timeline, ['Count'])


# ------------------------------------------------------------------ Accordion
def build_accitem(State):
    op = State == 'Open'
    comp = component(vname(State=State), dir='v', sw='fixed', w=420, stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    comp.add(frame('Header', text('Title', 'Validation rules', 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'), I.icon('chevron-up' if op else 'chevron-down', 16, '--ui-text-muted', 'Chevron'),
                   dir='h', cross='center', gap=8, pad=(14, 0, 14, 0), sw='fill'))
    if op:
        comp.add(frame('Body', text('Text', 'Rules run on create and update. A failing rule returns 422 with the field and message.', 'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), dir='v', pad=(0, 0, 14, 0), sw='fill'))
    comp.props = {'Title': text_prop('Validation rules')}
    return comp


def accitem_set():
    return make_set('AccordionItem', 'Collapsible section. Stack several in an Accordion.', [('State', ['Closed', 'Open'])], build_accitem, ['State'])


def build_accordion(Open):
    comp = component(vname(Open=Open), dir='v', sw='fixed', w=420)
    for i in range(3):
        a = use('AccordionItem', name=f'Item {i + 1}', State='Open' if (Open == 'First' and i == 0) else 'Closed')
        set_text(a, 'Title', ['Validation rules', 'Display options', 'Permissions'][i])
        comp.add(a)
    return comp


def accordion_set():
    return make_set('Accordion', 'Group of collapsible sections.', [('Open', ['None', 'First'])], build_accordion, ['Open'])


# ------------------------------------------------------------------ Popover
def build_popover(Content):
    comp = component(vname(Content=Content), dir='v', gap=12, sw='fixed', w=280, pad=(16, 16, 16, 16), radius='radius/lg', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_MD)
    comp.add(text('Title', 'Filter by status' if Content == 'Form' else 'About this field', 'Nexa/Subheading', '--ui-text-highlighted'))
    if Content == 'Form':
        comp.add(use('Select', name='Status', Variant='Outline', Size='md', State='Default', Icon='None', Value='Placeholder'))
        comp.find('Status').sw = 'fill'
        comp.add(frame('Actions', use('Button', name='Reset', Color='Neutral', Variant='Ghost', Size='sm', State='Default', Icon='None'), use('Button', name='Apply', Color='Primary', Variant='Solid', Size='sm', State='Default', Icon='None'),
                       dir='h', main='max', gap=8, sw='fill'))
        set_text(comp.find('Reset'), 'Label', 'Reset')
        set_text(comp.find('Apply'), 'Label', 'Apply')
    else:
        comp.add(text('Text', 'Computed from price and tax. It is read-only and recalculated on every save.', 'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True))
    return comp


def popover_set():
    return make_set('Popover', 'Floating panel anchored to a trigger. Text is for help; Form holds a small filter or form.', [('Content', ['Text', 'Form'])], build_popover, ['Content'])


# ------------------------------------------------------------------ AvatarGroup
def build_avgroup(Size, Count):
    px = {'sm': 24, 'md': 32}[Size]
    step = px - 8
    n = int(Count)
    comp = component(vname(Size=Size, Count=Count), sw='fixed', sh='fixed', w=step * (n - 1) + px, h=px)
    for i in range(n):
        if i == n - 1 and n > 3:
            a = frame('More', text('Count', '+3', 'Nexa/Caption', '--ui-text-toned'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=px, h=px, radius='radius/full',
                      fill='--ui-bg-accented', stroke='--ui-bg', stroke_w=2, stroke_align='inside')
        else:
            a = use('Avatar', name=f'Avatar {i + 1}', Size='sm' if Size == 'sm' else 'md', Type='Initials', Color='Neutral' if i % 2 else 'Primary')
            a.stroke, a.stroke_w, a.stroke_align = '--ui-bg', 2, 'inside'
        a.absolute = True
        a.x, a.y = i * step, 0
        layout(a)
        comp.add(a)
    return comp


def avgroup_set():
    return make_set('AvatarGroup', 'Overlapping avatars; the last one can be a "+N" counter.', [('Size', ['sm', 'md']), ('Count', ['3', '4'])], build_avgroup, ['Size'])


# ------------------------------------------------------------------ Link
def build_link(Tone, State, External):
    col = '--ui-primary-text' if Tone == 'Primary' else '--ui-text-muted'
    if State == 'Hover' and Tone == 'Muted':
        col = '--ui-text-highlighted'
    comp = component(vname(Tone=Tone, State=State, External=External), dir='h', cross='center', gap=4, opacity=0.5 if State == 'Disabled' else None)
    comp.add(text('Label', 'Link text', 'Nexa/Body', col, underline=State == 'Hover'))
    if External == 'Yes':
        comp.add(I.icon('external-link', 14, col, 'Icon'))
    comp.props = {'Label': text_prop('Link text')}
    return comp


def link_set():
    return make_set('Link', 'Inline text link. Primary is the default; Muted is for footers and breadcrumbs.', [('Tone', ['Primary', 'Muted']), ('State', ['Default', 'Hover', 'Disabled']), ('External', ['No', 'Yes'])], build_link, ['Tone', 'External'])


# ------------------------------------------------------------------ CodeBlock
def build_code(Kind):
    comp = component(vname(Kind=Kind), dir='v', sw='fixed', w=480, radius='radius/lg', fill='--ui-bg-inverted', clip=True)
    head = frame('Header', text('File', 'formula.txt' if Kind == 'Formula' else 'package.json', 'Nexa/Small', '--ui-text-dimmed'), dir='h', cross='center', pad=(8, 8, 8, 16), sw='fill', stroke='--ui-text-muted', stroke_sides=(0, 0, 1, 0))
    head.children[0].sw = 'fill'
    cp = use('IconButton', name='Copy', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    swap_icon(cp, 'Icon', 'copy')
    head.add(cp)
    comp.add(head)
    lines = (['price * quantity', 'IF(discount > 0, total - discount, total)'] if Kind == 'Formula' else ['{', '  "module": "vehicles",', '  "version": "1.2.0"', '}'])
    body = frame('Code', dir='v', gap=2, pad=(12, 16, 12, 16), sw='fill')
    for i, ln in enumerate(lines):
        body.add(frame(f'Line {i + 1}', text('No', str(i + 1), 'Nexa/Mono Small', '--ui-text-muted', sw='fixed', w=16), text('Code', ln, 'Nexa/Mono', '--ui-text-inverted'), dir='h', gap=12))
    comp.add(body)
    return comp


def code_set():
    return make_set('CodeBlock', 'Dark code block for formulas and package JSON. Always dark, like the mockup.', [('Kind', ['Formula', 'JSON'])], build_code, ['Kind'])


# ------------------------------------------------------------------ Line and Donut charts
def _vector(name, pts, color, w, h):
    verts = [{'x': float(x), 'y': float(y), 'radius': 0.0} for x, y in pts]
    segs = [{'a': i, 'b': i + 1, 'ta': [0.0, 0.0], 'tb': [0.0, 0.0]} for i in range(len(pts) - 1)]
    raw = {'blend': 'normal', 'strokes': [{'type': 'solid', 'color': {'r': 0, 'g': 0, 'b': 0, 'a': 1.0}, 'opacity': 1.0, 'visible': True, 'blend': 'normal'}],
           'stroke': {'weight': 2.0, 'align': 'center', 'sides': None, 'cap_start': 'round', 'cap_end': 'round', 'join': 'round', 'miter_limit': 4.0, 'dashes': []},
           'network': {'vertices': verts, 'segments': segs, 'regions': []}}
    n = N('vector', name, w=w, h=h, raw=raw, absolute=True)
    n.stroke = color
    n.sw = n.sh = 'fixed'
    return n


def build_line(Series):
    W, Hh = 440, 200
    comp = component(vname(Series=Series), dir='h', gap=8, sw='fixed', w=480, sh='fixed', h=Hh + 28)
    yaxis = frame('Y axis', dir='v', sh='fixed', h=Hh, sw='fixed', w=32)
    for i, v in enumerate(['100', '75', '50', '25', '0']):
        yaxis.add(text('Tick', v, 'Nexa/Caption', '--ui-text-dimmed'))
        if i < 4:
            yaxis.add(frame('Gap', sw='fixed', sh='fill', w=1))
    area = frame('Plot', dir='v', gap=8, sw='fixed', w=W)
    plot = frame('Lines', dir='h', sw='fixed', sh='fixed', w=W, h=Hh)
    grid = frame('Grid', dir='v', sw='fixed', sh='fixed', w=W, h=Hh, absolute=True)
    for i in range(5):
        grid.add(frame('Line', sw='fill', sh='fixed', h=1, fill='--ui-border'))
        if i < 4:
            grid.add(frame('Gap', sw='fill', sh='fill', h=1))
    plot.add(grid)
    data = [[40, 62, 35, 80, 55, 70, 48], [25, 40, 22, 55, 38, 45, 30]]
    for s in range(int(Series)):
        pts = [(W / 12 + i * (W - W / 6) / 6, Hh - Hh * v / 100) for i, v in enumerate(data[s])]
        v = _vector(f'Series {s + 1}', pts, '--ui-primary' if s == 0 else '--ui-secondary', W, Hh)
        plot.add(v)
        for i, (x, y) in enumerate(pts):
            d = ellipse(f'Point {i + 1}', 8, 8, '--ui-bg', stroke='--ui-primary' if s == 0 else '--ui-secondary', stroke_w=2, absolute=True)
            d.x, d.y = x - 4, y - 4
            plot.add(d)
    area.add(plot)
    lab = frame('Labels', dir='h', sw='fill')
    for m in ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']:
        lab.add(frame('Label', text('Text', m, 'Nexa/Caption', '--ui-text-muted'), dir='h', main='center', sw='fill'))
    area.add(lab)
    comp.add(yaxis)
    comp.add(area)
    return comp


def line_set():
    return make_set('LineChart', 'Drawn line chart for mockups; real data comes from the chart library chosen later.', [('Series', ['1', '2'])], build_line, ['Series'])


def build_donut(Segments):
    n = int(Segments)
    D = 140
    comp = component(vname(Segments=Segments), dir='h', cross='center', gap=24, sw='hug')
    ring = frame('Ring', sw='fixed', sh='fixed', w=D, h=D)
    track = ellipse('Track', D, D, '--ui-bg-accented', absolute=True, extra={'inner': 0.7})
    ring.add(track)
    shares = [0.55, 0.30, 0.15][:n] if n == 3 else [0.65, 0.35]
    cols = ['--ui-primary', '--ui-secondary', '--ui-warning']
    a = -math.pi / 2
    for i, sh in enumerate(shares):
        sweep = 2 * math.pi * sh
        seg = ellipse(f'Segment {i + 1}', D, D, cols[i], absolute=True, extra={'start': a, 'sweep': sweep, 'inner': 0.7})
        ring.add(seg)
        a += sweep
    ring.add(frame('Center', text('Value', '1,204', 'Nexa/Heading', '--ui-text-highlighted'), text('Label', 'Total', 'Nexa/Small', '--ui-text-muted'), dir='v', main='center', cross='center', sw='fixed', sh='fixed', w=D, h=D, absolute=True))
    comp.add(ring)
    leg = frame('Legend', dir='v', gap=8)
    for i, nm in enumerate(['Active', 'In service', 'Retired'][:n]):
        leg.add(frame(f'Item {i + 1}', ellipse('Dot', 8, 8, cols[i]), text('Label', nm, 'Nexa/Body', '--ui-text'), text('Share', f'{round(shares[i] * 100)}%', 'Nexa/Body Medium', '--ui-text-highlighted'), dir='h', gap=8, cross='center'))
    comp.add(leg)
    return comp


def donut_set():
    return make_set('DonutChart', 'Drawn donut with legend. Edit each Segment ellipse sweep for other shares.', [('Segments', ['2', '3'])], build_donut, ['Segments'])


# ------------------------------------------------------------------ Builder pieces
def build_fieldrow(State):
    fill = {'Default': '--ui-bg', 'Hover': '--ui-bg-elevated', 'Selected': '--ui-primary-soft', 'Error': '--ui-bg'}[State]
    stroke = '--ui-error' if State == 'Error' else ('--ui-primary-outline' if State == 'Selected' else '--ui-border')
    comp = component(vname(State=State), dir='h', cross='center', gap=12, sw='fixed', w=640, pad=(10, 12, 10, 12), radius='radius/lg', fill=fill, stroke=stroke)
    comp.add(I.icon('grip-vertical', 16, '--ui-text-dimmed', 'Grip'))
    comp.add(frame('Names', text('Name', 'Plate number', 'Nexa/Body Medium', '--ui-text-highlighted'), text('Key', 'plateNumber', 'Nexa/Mono Small', '--ui-text-muted'), dir='v', gap=2, sw='fill'))
    t = use('Badge', name='Type', Color='Neutral', Variant='Soft', Size='sm', Leading='None')
    set_text(t, 'Label', 'text')
    comp.add(t)
    r = use('Badge', name='Required', Color='Error', Variant='Subtle', Size='sm', Leading='None')
    set_text(r, 'Label', 'Required')
    comp.add(r)
    if State == 'Error':
        comp.add(I.icon('circle-alert', 16, '--ui-error-text', 'Error'))
    m = use('IconButton', name='Menu', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    comp.add(m)
    comp.props = {'Name': text_prop('Plate number')}
    return comp


def fieldrow_set():
    return make_set('FieldRow', 'Row in the Entity Designer field list: drag handle, name and key, type badge, flags and a menu.', [('State', ['Default', 'Hover', 'Selected', 'Error'])], build_fieldrow, ['State'])


def build_formula(State):
    comp = component(vname(State=State), dir='v', sw='fixed', w=520, radius='radius/lg', fill='--ui-bg', stroke='--ui-error' if State == 'Error' else '--ui-border', clip=True)
    b = use('Badge', name='Status', Color='Error' if State == 'Error' else ('Success' if State == 'Valid' else 'Neutral'), Variant='Soft', Size='sm', Leading='Dot')
    set_text(b, 'Label', {'Valid': 'Valid', 'Error': 'Error', 'Empty': 'Empty'}[State])
    comp.add(frame('Header', text('Title', 'Formula', 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'), b, dir='h', cross='center', pad=(10, 16, 10, 16), sw='fill', fill='--ui-bg-muted', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    code = frame('Editor', dir='v', gap=2, pad=(12, 16, 12, 16), sw='fill')
    if State == 'Empty':
        code.add(text('Placeholder', 'Write an expression, e.g. price * quantity', 'Nexa/Mono', '--ui-text-dimmed'))
    else:
        code.add(frame('Line 1', text('No', '1', 'Nexa/Mono Small', '--ui-text-dimmed', sw='fixed', w=16), text('Code', 'price * quantity * (1 + taxRate)' if State == 'Valid' else 'price * quantity *', 'Nexa/Mono', '--ui-text-highlighted'), dir='h', gap=12))
    comp.add(code)
    msg = {'Valid': ('Result preview: 13,375.00', '--ui-text-muted'), 'Error': ('Unexpected end of expression at column 18.', '--ui-error-text'), 'Empty': ('Fields you can use: price, quantity, taxRate', '--ui-text-muted')}[State]
    comp.add(frame('Footer', text('Message', msg[0], 'Nexa/Small', msg[1], sw='fill'), dir='h', pad=(8, 16, 8, 16), sw='fill', stroke='--ui-border', stroke_sides=(1, 0, 0, 0)))
    return comp


def formula_set():
    return make_set('FormulaEditor', 'Expression editor with live validation. Cycles are rejected at definition time, so show the engine message in the footer.', [('State', ['Valid', 'Error', 'Empty'])], build_formula, ['State'])


def build_wfnode(Kind, Selected):
    comp = component(vname(Kind=Kind, Selected=Selected), dir='v', gap=6, sw='fixed', w=180, pad=(12, 14, 12, 14), radius='radius/lg', fill='--ui-bg',
                     stroke='--ui-primary' if Selected == 'Yes' else '--ui-border-accented', stroke_w=2 if Selected == 'Yes' else 1)
    comp.add(frame('Top', ellipse('Dot', 8, 8, {'Start': '--ui-text-dimmed', 'Step': '--ui-primary', 'End': '--ui-success'}[Kind]), text('Kind', Kind.upper(), 'Nexa/Caption', '--ui-text-muted'), dir='h', cross='center', gap=6))
    comp.add(text('Name', 'In review', 'Nexa/Body Medium', '--ui-text-highlighted'))
    comp.add(text('Meta', '12 records', 'Nexa/Small', '--ui-text-muted'))
    comp.props = {'Name': text_prop('In review')}
    return comp


def wfnode_set():
    return make_set('WorkflowNode', 'State of a linear, forward-only workflow bound to a select field.', [('Kind', ['Start', 'Step', 'End']), ('Selected', ['No', 'Yes'])], build_wfnode, ['Kind'])


def build_wfedge(Guard):
    comp = component(vname(Guard=Guard), dir='h', cross='center', gap=6, sw='fixed', w=140)
    comp.add(frame('Line', sw='fill', sh='fixed', h=2, fill='--ui-border-accented'))
    comp.add(I.icon('arrow-right', 16, '--ui-text-muted', 'Arrow'))
    if Guard == 'Role':
        comp.children[0].sw = 'fill'
        comp.add(use('Badge', name='Role', Color='Neutral', Variant='Outline', Size='sm', Leading='None'))
        set_text(comp.find('Role'), 'Label', 'admin')
        comp.w = 200
    return comp


def wfedge_set():
    return make_set('WorkflowEdge', 'Forward transition between two states. Role shows who may run it; guards and actions are edited in the side panel.', [('Guard', ['None', 'Role'])], build_wfedge, ['Guard'])


def build_permcell(Value):
    ic, col = {'Allowed': ('check', '--ui-success-text'), 'Denied': ('minus', '--ui-text-dimmed'), 'Locked': ('lock', '--ui-text-muted')}[Value]
    comp = component(vname(Value=Value), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=88, h=44)
    comp.add(I.icon(ic, 16, col, 'Icon'))
    return comp


def permcell_set():
    return make_set('PermissionCell', 'Cell of the permission matrix. Locked is a default-deny entry the role cannot change.', [('Value', ['Allowed', 'Denied', 'Locked'])], build_permcell, ['Value'])


def build_permtable(Rows):
    roles = ['owner', 'admin', 'member', 'viewer']
    perms = ['definition:read', 'definition:manage', 'record:write', 'workflow:transition', 'automation:manage', 'report:read'][:int(Rows)]
    grid = {'definition:read': 'AAAA', 'definition:manage': 'AADD', 'record:write': 'AAAD', 'workflow:transition': 'AAAD', 'automation:manage': 'AADD', 'report:read': 'AAAA'}
    comp = component(vname(Rows=Rows), dir='v', sw='fixed', w=640, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', clip=True)
    head = frame('Header', text('Permission', 'Permission', 'Nexa/Small Medium', '--ui-text-muted', sw='fill'), dir='h', cross='center', sw='fill', sh='fixed', h=40, pad=(0, 0, 0, 16), fill='--ui-bg-muted', stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    for r in roles:
        head.add(frame('Role', text('Label', r, 'Nexa/Small Medium', '--ui-text-muted'), dir='h', main='center', cross='center', sw='fixed', sh='fill', w=88))
    comp.add(head)
    for p in perms:
        row = frame(p, text('Name', p, 'Nexa/Mono', '--ui-text-highlighted', sw='fill'), dir='h', cross='center', sw='fill', pad=(0, 0, 0, 16), stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
        for i, ch in enumerate(grid[p]):
            row.add(use('PermissionCell', name=roles[i], Value='Allowed' if ch == 'A' else 'Denied'))
        comp.add(row)
    return comp


def permtable_set():
    return make_set('PermissionsTable', 'Role x permission matrix. Roles are owner, admin, member and viewer; viewers are default-deny for manage actions.', [('Rows', ['4', '6'])], build_permtable, ['Rows'])


def build_diffrow(Kind):
    col, mark = {'Added': ('success', '+'), 'Removed': ('error', '-'), 'Changed': ('warning', '~')}[Kind]
    comp = component(vname(Kind=Kind), dir='h', cross='center', gap=12, sw='fixed', w=560, pad=(8, 12, 8, 12), fill=f'--ui-{col}-soft')
    comp.add(frame('Marker', text('Mark', mark, 'Nexa/Mono', '--ui-text-highlighted'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=20, h=20, radius='radius/sm', fill=f'--ui-{col}-soft-hover'))
    comp.add(frame('Names', text('Name', 'fields.plateNumber', 'Nexa/Mono', '--ui-text-highlighted'), text('Detail', {'Added': 'new field (text, required)', 'Removed': 'removed from entity Vehicle', 'Changed': 'maxLength 20 -> 30'}[Kind], 'Nexa/Small', '--ui-text-muted'), dir='v', gap=2, sw='fill'))
    comp.add(use('Badge', name='Kind', Color={'Added': 'Success', 'Removed': 'Error', 'Changed': 'Warning'}[Kind], Variant='Soft', Size='sm', Leading='None'))
    set_text(comp.find('Kind'), 'Label', Kind)
    return comp


def diffrow_set():
    return make_set('DiffRow', 'One definition difference in the package import preview.', [('Kind', ['Added', 'Removed', 'Changed'])], build_diffrow, ['Kind'])


def build_pkgdiff(Version):
    comp = component(vname(Version=Version), dir='v', sw='fixed', w=560, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', clip=True)
    comp.add(frame('Header', text('Title', 'Upgrade 1.1.0 to 1.2.0', 'Nexa/Subheading', '--ui-text-highlighted', sw='fill'), dir='h', cross='center', pad=(12, 16, 12, 16), sw='fill', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    for k in ['Added', 'Changed', 'Removed']:
        comp.add(use('DiffRow', name=k, Kind=k))
    return comp


def pkgdiff_set():
    return make_set('PackageDiff', 'Preview of what an import or upgrade will add, change or remove, before confirming.', [('Version', ['Upgrade'])], build_pkgdiff, ['Version'])


# ------------------------------------------------------------------ ReferenceSelect (searchable record picker for reference fields)
REC = [('Toyota Hilux', 'AB-1234 · Pickup', 'Active'), ('Isuzu D-Max', 'CD-5678 · Pickup', 'In service'), ('Honda City', 'EF-9012 · Sedan', 'Active')]


def build_refselect(Mode):
    comp = component(vname(Mode=Mode), dir='v', sw='fixed', w=320, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_MD, clip=True)
    q = 'veh' if Mode != 'Results' else 'Search vehicles...'
    comp.add(frame('Search', I.icon('search', 16, '--ui-text-dimmed', 'Icon'), text('Query', q, 'Nexa/Body', '--ui-text-dimmed' if Mode == 'Results' else '--ui-text-highlighted', sw='fill'),
                   *( [I.icon('loader-circle', 16, '--ui-text-muted', 'Spinner')] if Mode == 'Loading' else []),
                   dir='h', cross='center', gap=8, pad=(10, 12, 10, 12), sw='fill', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    body = frame('Records', dir='v', gap=2, pad=(4, 4, 4, 4), sw='fill')
    if Mode == 'Loading':
        for i in range(3):
            body.add(frame('Skeleton', frame('Line 1', sw='fixed', sh='fixed', w=140, h=12, radius='radius/sm', fill='--ui-bg-accented'), frame('Line 2', sw='fixed', sh='fixed', w=90, h=10, radius='radius/sm', fill='--ui-bg-elevated'),
                           dir='v', gap=6, pad=(10, 8, 10, 8), sw='fill'))
    elif Mode == 'Empty':
        body.add(frame('Empty', text('Title', 'No matching records', 'Nexa/Body Medium', '--ui-text-highlighted'), text('Hint', 'Check the spelling or create a new vehicle.', 'Nexa/Small', '--ui-text-muted'),
                       dir='v', cross='center', gap=4, pad=(16, 12, 16, 12), sw='fill'))
    else:
        for i, (t, s, st) in enumerate(REC):
            b = use('Badge', name='Status', Color='Success' if st == 'Active' else 'Warning', Variant='Soft', Size='sm', Leading='None')
            set_text(b, 'Label', st)
            body.add(frame(t, frame('Text', text('Title', t, 'Nexa/Body Medium', '--ui-text-highlighted'), text('Subtitle', s, 'Nexa/Small', '--ui-text-muted'), dir='v', gap=1, sw='fill'), b,
                           dir='h', cross='center', gap=8, pad=(8, 8, 8, 8), radius='radius/md', sw='fill', fill='--ui-bg-elevated' if i == 0 else None))
    comp.add(body)
    comp.add(frame('Footer', I.icon('plus', 16, '--ui-primary-text', 'Icon'), text('Create', 'Create new vehicle', 'Nexa/Body Medium', '--ui-primary-text'), dir='h', cross='center', gap=8, pad=(10, 12, 10, 12), sw='fill',
                   stroke='--ui-border', stroke_sides=(1, 0, 0, 0)))
    return comp


def refselect_set():
    return make_set('ReferenceSelect', 'Searchable picker for reference fields: type to search records of the related entity, pick one, or create a new one. Options load from the server in code (loadOptions).',
                    [('Mode', ['Results', 'Loading', 'Empty'])], build_refselect, ['Mode'])
