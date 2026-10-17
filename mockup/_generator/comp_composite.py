from comp_base import *

W = 720


# ------------------------------------------------------------------ Table
def build_tablerow(Kind, State):
    head = Kind == 'Header'
    fill = '--ui-bg-muted' if head else ('--ui-bg-elevated' if State == 'Hover' else ('--ui-primary-soft' if State == 'Selected' else '--ui-bg'))
    comp = component(vname(Kind=Kind, State=State), dir='h', cross='center', sw='fixed', w=W, sh='fixed', h=40 if head else 48, fill=fill,
                     stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    cols = [('Name', 3), ('Status', 2), ('Owner', 2), ('Updated', 2)]
    for i, (lb, fl) in enumerate(cols):
        cell = frame(f'Cell {i + 1}', dir='h', cross='center', gap=8, pad=(0, 12, 0, 12), sw='fill', sh='fill')
        if head:
            cell.add(text('Text', lb, 'Nexa/Small Medium', '--ui-text-muted'))
        elif i == 1:
            cell.add(use('Badge', name='Badge', Color='Success', Variant='Soft', Size='sm', Leading='Dot'))
            set_text(cell.children[0], 'Label', 'Active')
        elif i == 2:
            cell.add(use('Avatar', name='Avatar', Size='xs', Type='Initials', Color='Neutral'))
            cell.add(text('Text', 'Somchai', 'Nexa/Body', '--ui-text'))
        else:
            cell.add(text('Text', 'Vehicle record' if i == 0 else '12 Oct 2026', 'Nexa/Body Medium' if i == 0 else 'Nexa/Body',
                          '--ui-text-highlighted' if i == 0 else '--ui-text-muted'))
        comp.add(cell)
    return comp


def tablerow_set():
    return make_set('TableRow', 'Header or body row. Cells are free auto-layout frames: put text, Badge, Avatar or buttons in them. Selected is for checked rows.',
                    [('Kind', ['Header', 'Body']), ('State', ['Default', 'Hover', 'Selected'])], build_tablerow, ['Kind'])


def build_table(Rows, Density):
    n = int(Rows)
    comp = component(vname(Rows=Rows, Density=Density), dir='v', sw='fixed', w=W, radius='radius/lg', stroke='--ui-border', fill='--ui-bg', clip=True)
    comp.add(use('TableRow', name='Header', Kind='Header', State='Default'))
    for i in range(n):
        comp.add(use('TableRow', name=f'Row {i + 1}', Kind='Body', State='Selected' if (Density == 'Selection' and i == 1) else 'Default'))
    return comp


def table_set():
    return make_set('Table', 'Data table frame with sticky-style header. Duplicate Row instances for more rows; pair with Pagination underneath.',
                    [('Rows', ['3', '5', '8']), ('Density', ['Default', 'Selection'])], build_table, ['Density'])


# ------------------------------------------------------------------ StatCard
def build_stat(Trend):
    comp = component(vname(Trend=Trend), dir='v', gap=12, sw='fixed', w=260, pad=(16, 16, 16, 16), radius='radius/xl', fill='--ui-bg', stroke='--ui-border')
    top = frame('Top', frame('Icon bg', I.icon('car', 18, '--ui-primary-text', 'Icon'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=36, h=36,
                             radius='radius/lg', fill='--ui-primary-soft'),
                spacer(), dir='h', cross='center', sw='fill')
    if Trend != 'None':
        b = use('Badge', name='Trend', Color='Success' if Trend == 'Up' else 'Error', Variant='Soft', Size='sm', Leading='Icon')
        swap_icon(b, 'Icon', 'trending-up' if Trend == 'Up' else 'trending-down')
        set_text(b, 'Label', '+12%' if Trend == 'Up' else '-4%')
        top.add(b)
    comp.add(top)
    comp.add(frame('Text', text('Value', '1,204', 'Nexa/Display', '--ui-text-highlighted'), text('Label', 'Total vehicles', 'Nexa/Body', '--ui-text-muted'), dir='v', gap=2))
    comp.props = {'Value': text_prop('1,204'), 'Label': text_prop('Total vehicles'), 'Icon': swap_prop('car')}
    return comp


def stat_set():
    return make_set('StatCard', 'KPI tile for dashboards and the home screen. Trend adds a badge with the change.', [('Trend', ['None', 'Up', 'Down'])], build_stat, ['Trend'])


# ------------------------------------------------------------------ Progress
def build_progress(Size, Value):
    h = {'sm': 4, 'md': 8}[Size]
    wv = int(Value)
    comp = component(vname(Size=Size, Value=Value), dir='h', sw='fixed', w=240, sh='fixed', h=h, radius='radius/full', fill='--ui-bg-accented', clip=True)
    if wv:
        comp.add(frame('Bar', sw='fixed', sh='fixed', w=round(240 * wv / 100), h=h, radius='radius/full', fill='--ui-primary'))
    return comp


def progress_set():
    return make_set('Progress', 'Determinate progress bar. Value is a percent; resize the Bar for other values.',
                    [('Size', ['sm', 'md']), ('Value', ['0', '25', '50', '75', '100'])], build_progress, ['Size'])


# ------------------------------------------------------------------ Stepper
def build_step(State):
    done, cur = State == 'Done', State == 'Current'
    comp = component(vname(State=State), dir='h', cross='center', gap=8)
    circ = frame('Circle', dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=28, h=28, radius='radius/full',
                 fill='--ui-primary' if (done or cur) else '--ui-bg', stroke=None if (done or cur) else '--ui-border-accented')
    circ.add(I.icon('check', 14, '--ui-on-solid', 'Check') if done else text('Number', '1', 'Nexa/Small Medium', '--ui-on-solid' if cur else '--ui-text-muted'))
    comp.add(circ)
    comp.add(text('Label', 'Step', 'Nexa/Body Medium', '--ui-text-highlighted' if (cur or done) else '--ui-text-muted'))
    comp.props = {'Label': text_prop('Step')}
    return comp


def step_set():
    return make_set('Step', 'One step of the stepper.', [('State', ['Done', 'Current', 'Upcoming'])], build_step, ['State'])


def build_stepper(Count, Current):
    n, cur = int(Count), int(Current)
    comp = component(vname(Count=Count, Current=Current), dir='h', cross='center', gap=12)
    labels = ['Upload', 'Map columns', 'Preview', 'Result'][:n]
    for i, lb in enumerate(labels):
        st = 'Done' if i + 1 < cur else ('Current' if i + 1 == cur else 'Upcoming')
        s = use('Step', name=f'Step {i + 1}', State=st)
        set_text(s, 'Label', lb)
        if st != 'Done':
            set_text(s, 'Number', str(i + 1))
        comp.add(s)
        if i < n - 1:
            comp.add(frame('Line', sw='fixed', sh='fixed', w=40, h=2, fill='--ui-primary' if i + 1 < cur else '--ui-border-accented'))
    return comp


def stepper_set():
    return make_set('Stepper', 'Multi-step flow such as CSV import. Current sets which step is highlighted; earlier steps show a check.',
                    [('Count', ['3', '4']), ('Current', ['1', '2', '3'])], build_stepper, ['Count'])


# ------------------------------------------------------------------ KanbanCard
def build_kanban(State):
    comp = component(vname(State=State), dir='v', gap=10, sw='fixed', w=260, pad=(12, 12, 12, 12), radius='radius/lg', fill='--ui-bg',
                     stroke='--ui-primary' if State == 'Dragging' else ('--ui-border-accented' if State == 'Hover' else '--ui-border'),
                     effects=SHADOW_MD if State == 'Dragging' else None, opacity=None)
    comp.add(frame('Head', text('Title', 'AB-1234 Toyota Hilux', 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'), I.icon('grip-vertical', 14, '--ui-text-dimmed', 'Grip'),
                   dir='h', gap=8, cross='min', sw='fill'))
    comp.add(text('Meta', 'Next service 12 Nov', 'Nexa/Small', '--ui-text-muted'))
    comp.add(frame('Foot', use('Badge', name='Badge', Color='Warning', Variant='Soft', Size='sm', Leading='Dot'), spacer(), use('Avatar', name='Owner', Size='xs', Type='Initials', Color='Neutral'),
                   dir='h', cross='center', sw='fill'))
    comp.props = {'Title': text_prop('AB-1234 Toyota Hilux')}
    return comp


def kanban_set():
    return make_set('KanbanCard', 'Record card for the Kanban view. Dragging lifts it with a shadow and a primary border.',
                    [('State', ['Default', 'Hover', 'Dragging'])], build_kanban, ['State'])


# ------------------------------------------------------------------ FileUpload
def build_upload(State):
    stroke = {'Default': '--ui-border-accented', 'Hover': '--ui-primary', 'Error': '--ui-error'}[State]
    comp = component(vname(State=State), dir='v', main='center', cross='center', gap=8, sw='fixed', w=420, pad=(32, 24, 32, 24), radius='radius/lg',
                     fill='--ui-primary-soft' if State == 'Hover' else '--ui-bg', stroke=stroke, stroke_dash=[6, 4])
    comp.add(I.icon('upload', 24, '--ui-error-text' if State == 'Error' else '--ui-text-muted', 'Icon'))
    comp.add(text('Title', 'Drop a CSV file here, or click to browse', 'Nexa/Body Medium', '--ui-text-highlighted'))
    comp.add(text('Hint', 'File is parsed in your browser. Max 10 MB.' if State != 'Error' else 'Only .csv files are accepted.', 'Nexa/Small',
                  '--ui-error-text' if State == 'Error' else '--ui-text-muted'))
    comp.props = {'Title': text_prop('Drop a CSV file here, or click to browse')}
    return comp


def upload_set():
    return make_set('FileUpload', 'Drop zone. The mockup parses CSV client-side; upload to the server is not supported.', [('State', ['Default', 'Hover', 'Error'])], build_upload, ['State'])


# ------------------------------------------------------------------ CommandPalette
def build_palette(Results):
    comp = component(vname(Results=Results), dir='v', sw='fixed', w=560, radius='radius/xl', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_LG, clip=True)
    comp.add(frame('Search', I.icon('search', 18, '--ui-text-dimmed', 'Icon'), text('Query', 'Search modules, records, actions...' if Results == 'Empty query' else 'veh', 'Nexa/Body Large',
                                                                                    '--ui-text-dimmed' if Results == 'Empty query' else '--ui-text-highlighted', sw='fill'),
                   use('Kbd', name='Esc', Variant='Subtle', Size='sm'), dir='h', cross='center', gap=10, pad=(14, 16, 14, 16), sw='fill', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    set_text(comp.find('Esc'), 'Keys', 'Esc')
    body = frame('Results', dir='v', gap=2, pad=(8, 8, 8, 8), sw='fill')
    body.add(frame('Group', text('Label', 'Modules' if Results == 'Empty query' else 'Records', 'Nexa/Caption', '--ui-text-dimmed'), dir='h', pad=(6, 8, 4, 8), sw='fill'))
    for i, lb in enumerate(['Vehicle Management', 'Drivers', 'Fuel Logs']):
        m = use('MenuItem', name=lb, State='Hover' if i == 0 else 'Default', Icon='Leading', Tone='Default')
        m.sw = 'fill'
        set_text(m, 'Label', lb)
        swap_icon(m, 'Icon', ['car', 'user', 'fuel'][i])
        body.add(m)
    comp.add(body)
    return comp


def palette_set():
    return make_set('CommandPalette', 'Global search and command launcher (Ctrl K). Result rows are MenuItem instances; the first is highlighted.',
                    [('Results', ['Empty query', 'Typing'])], build_palette, ['Results'])


# ------------------------------------------------------------------ Slideover
def build_slideover(Footer):
    comp = component(vname(Footer=Footer), dir='v', sw='fixed', sh='fixed', w=400, h=640, fill='--ui-bg', stroke='--ui-border', stroke_sides=(0, 0, 0, 1), effects=SHADOW_LG)
    close = use('IconButton', name='Close', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    swap_icon(close, 'Icon', 'x')
    comp.add(frame('Header', text('Title', 'Notifications', 'Nexa/Subheading', '--ui-text-highlighted', sw='fill'), close, dir='h', cross='center', gap=8,
                   pad=(16, 16, 16, 20), sw='fill', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    body = frame('Body', dir='v', gap=4, pad=(12, 12, 12, 12), sw='fill', sh='fill')
    for t, d in [('Service due', 'AB-1234 is due in 3 days'), ('Import finished', '120 rows added to Vehicles'), ('Workflow moved', 'Record #88 is now In review')]:
        body.add(frame('Item', frame('Dot', ellipse('Dot', 8, 8, '--ui-primary'), dir='h', pad=(6, 0, 0, 0)),
                       frame('Text', text('Title', t, 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'), text('Description', d, 'Nexa/Small', '--ui-text-muted', sw='fill'), dir='v', gap=2, sw='fill'),
                       dir='h', gap=10, pad=(10, 8, 10, 8), radius='radius/md', sw='fill'))
    comp.add(body)
    if Footer == 'Yes':
        foot = frame('Footer', dir='h', main='max', gap=8, pad=(12, 16, 12, 16), sw='fill', fill='--ui-bg-muted', stroke='--ui-border', stroke_sides=(1, 0, 0, 0))
        foot.add(use('Button', name='Mark all read', Color='Neutral', Variant='Outline', Size='md', State='Default', Icon='None'))
        set_text(foot.children[0], 'Label', 'Mark all read')
        comp.add(foot)
    return comp


def slideover_set():
    return make_set('Slideover', 'Side panel from the right edge, for notifications and quick detail. Place it on a scrim (--ui-overlay).', [('Footer', ['No', 'Yes'])], build_slideover, ['Footer'])


# ------------------------------------------------------------------ App shell
def build_orgswitcher(State):
    comp = component(vname(State=State), dir='h', cross='center', gap=10, sw='fixed', w=216, pad=(8, 10, 8, 10), radius='radius/lg',
                     fill='--ui-bg-elevated' if State == 'Hover' else '--ui-bg', stroke='--ui-border')
    comp.add(use('Avatar', name='Org', Size='sm', Type='Initials', Color='Primary'))
    comp.find('Org')
    set_text(comp.find('Org'), 'Initials', 'LH')
    comp.add(frame('Text', text('Name', 'Loghorizon Co.', 'Nexa/Body Medium', '--ui-text-highlighted', sw='fill'), dir='v', sw='fill'))
    comp.add(I.icon('chevrons-up-down', 16, '--ui-text-dimmed', 'Chevron'))
    comp.props = {'Name': text_prop('Loghorizon Co.')}
    return comp


def orgswitcher_set():
    return make_set('OrgSwitcher', 'Shows the active organization; opens a Menu to switch between the memberships you belong to.', [('State', ['Default', 'Hover'])], build_orgswitcher, ['State'])


def build_sidebar(Mode, Collapsed):
    mode = {'Light': None, 'Dark': {'Nexa / Semantic colors': 'Dark'}}[Mode]
    col = Collapsed == 'Yes'
    w = 64 if col else 248
    comp = component(vname(Mode=Mode, Collapsed=Collapsed), dir='v', gap=16, sw='fixed', sh='fixed', w=w, h=720, pad=(16, 12, 16, 12), fill='--ui-bg-muted',
                     stroke='--ui-border', stroke_sides=(0, 1, 0, 0), var_modes=mode)
    comp.add(use('Logo', name='Logo', Type='Mark' if col else 'Full', Size='md'))
    if not col:
        comp.add(use('OrgSwitcher', name='Org switcher', State='Default'))
    nav = frame('Nav', dir='v', gap=2, sw='fill')
    if not col:
        nav.add(use('NavGroupLabel', name='Group', Collapsed='No'))
        nav.children[0].sw = 'fill'
    for i, (lb, ic) in enumerate([('Home', 'house'), ('Vehicles', 'car'), ('Drivers', 'user'), ('Maintenance', 'wrench')]):
        it = use('NavItem', name=lb, State='Active' if i == 1 else 'Default', Layout='Icon only' if col else 'Label', Trailing='None')
        if not col:
            it.sw = 'fill'
            set_text(it, 'Label', lb)
        swap_icon(it, 'Icon', ic)
        nav.add(it)
    comp.add(nav)
    comp.add(frame('Fill', sw='fill', sh='fill'))
    user = frame('User', use('Avatar', name='Avatar', Size='md', Type='Initials', Color='Primary'), dir='h', cross='center', gap=10, pad=(8, 4, 0, 4), sw='fill',
                 stroke='--ui-border', stroke_sides=(1, 0, 0, 0))
    if not col:
        user.add(frame('Text', text('Name', 'Somchai K.', 'Nexa/Body Medium', '--ui-text-highlighted'), text('Role', 'Owner', 'Nexa/Small', '--ui-text-muted'), dir='v', sw='fill'))
    comp.add(user)
    return comp


def sidebar_set():
    return make_set('Sidebar', 'Dashboard sidebar. Dark mode is the always-dark Builder sidebar (the frame uses the Dark variable mode); Collapsed keeps icons only.',
                    [('Mode', ['Light', 'Dark']), ('Collapsed', ['No', 'Yes'])], build_sidebar, ['Mode'])


def build_navbar(Width):
    w = {'Desktop': 1200, 'Tablet': 720}[Width]
    comp = component(vname(Width=Width), dir='h', cross='center', gap=12, sw='fixed', w=w, sh='fixed', h=60, pad=(0, 24, 0, 24), fill='--ui-bg',
                     stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    comp.add(use('Breadcrumb', name='Breadcrumb', Count='2'))
    comp.add(spacer())
    if Width == 'Desktop':
        s = use('Input', name='Search', Variant='Outline', Size='sm', State='Default', Icon='Leading', Value='Placeholder')
        s.w = 220
        set_text(s, 'Value', 'Search...')
        comp.add(s)
    bell = use('IconButton', name='Notifications', Color='Neutral', Variant='Outline', Size='sm', State='Default')
    swap_icon(bell, 'Icon', 'bell')
    comp.add(bell)
    comp.add(use('Avatar', name='Avatar', Size='sm', Type='Initials', Color='Primary'))
    return comp


def navbar_set():
    return make_set('Navbar', 'Top bar of the dashboard: breadcrumb, search, notifications and the user avatar.', [('Width', ['Desktop', 'Tablet'])], build_navbar, ['Width'])


def build_pageheader(Description, Actions):
    comp = component(vname(Description=Description, Actions=Actions), dir='h', cross='center', gap=16, sw='fixed', w=1100)
    t = frame('Titles', text('Title', 'Vehicles', 'Nexa/Title', '--ui-text-highlighted'), dir='v', gap=4, sw='fill')
    if Description == 'Yes':
        t.add(text('Description', 'Fleet records, drivers, maintenance and fuel logs.', 'Nexa/Body', '--ui-text-muted', sw='fill'))
    comp.add(t)
    if Actions != 'None':
        row = frame('Actions', dir='h', gap=8)
        if Actions == 'Two':
            b = use('Button', name='Secondary', Color='Neutral', Variant='Outline', Size='md', State='Default', Icon='None')
            set_text(b, 'Label', 'Import CSV')
            row.add(b)
        p = use('Button', name='Primary', Color='Primary', Variant='Solid', Size='md', State='Default', Icon='Leading')
        set_text(p, 'Label', 'New vehicle')
        row.add(p)
        comp.add(row)
    comp.props = {'Title': text_prop('Vehicles')}
    return comp


def pageheader_set():
    return make_set('PageHeader', 'Page title with optional description and actions. Put it at the top of the content panel.',
                    [('Description', ['Yes', 'No']), ('Actions', ['None', 'One', 'Two'])], build_pageheader, ['Description'])
