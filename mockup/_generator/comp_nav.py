from comp_base import *

TS = {'sm': dict(py=6, px=10, text='Nexa/Small Medium', icon=14, gap=6), 'md': dict(py=8, px=12, text='Nexa/Body Medium', icon=16, gap=6)}


# ------------------------------------------------------------------ Tab (link variant)
def build_tab(State, Size, Icon):
    S = TS[Size]
    active = State == 'Active'
    label = '--ui-text-highlighted' if active else ('--ui-text-highlighted' if State == 'Hover' else '--ui-text-muted')
    ic = '--ui-primary-text' if active else label
    comp = component(vname(State=State, Size=Size, Icon=Icon), dir='v', cross='center', gap=0, opacity=0.5 if State == 'Disabled' else None)
    row = frame('Content', dir='h', cross='center', gap=S['gap'], pad=(S['py'], S['px'], S['py'], S['px']))
    props = {'Label': text_prop('Tab')}
    if Icon == 'Leading':
        row.add(I.icon('folder', S['icon'], ic, 'Icon'))
        props['Icon'] = swap_prop('folder')
    row.add(text('Label', 'Tab', S['text'], label))
    comp.add(row)
    comp.add(frame('Indicator', sw='fill', sh='fixed', h=2, fill='--ui-primary' if active else None))
    comp.props = props
    return comp


def tab_set():
    return make_set('Tab', 'Single tab trigger of the underline (link) tabs. Use the Tabs container below to assemble a list.',
                    [('State', ['Default', 'Hover', 'Active', 'Disabled']), ('Size', ['sm', 'md']), ('Icon', ['None', 'Leading'])], build_tab, ['Size', 'Icon'])


def build_tabs(Size, Count):
    n = int(Count)
    comp = component(vname(Size=Size, Count=Count), dir='h', gap=4, sw='fixed', w=120 * n if n > 3 else 360, stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    labels = ['General', 'Validation', 'Display', 'History', 'Access'][:n]
    for i, lb in enumerate(labels):
        t = use('Tab', name=f'Tab {i + 1}', State='Active' if i == 0 else 'Default', Size=Size, Icon='None')
        set_text(t, 'Label', lb)
        comp.add(t)
    return comp


def tabs_set():
    return make_set('Tabs', 'Underline tabs. The first tab is active; set State on each Tab instance to change it.',
                    [('Size', ['sm', 'md']), ('Count', ['3', '4', '5'])], build_tabs, ['Size'])


# ------------------------------------------------------------------ Segment (pill tabs / segmented control)
SEG = {'sm': dict(py=4, px=8, text='Nexa/Small Medium'), 'md': dict(py=5, px=10, text='Nexa/Body Medium')}


def build_segment(State, Size):
    S = SEG[Size]
    act = State == 'Active'
    fill = '--ui-bg' if act else None
    label = '--ui-text-highlighted' if act else ('--ui-text-highlighted' if State == 'Hover' else '--ui-text-muted')
    comp = component(vname(State=State, Size=Size), dir='h', main='center', cross='center', pad=(S['py'], S['px'], S['py'], S['px']),
                     radius='radius/md', fill=fill, effects=SHADOW_SM if act else None, opacity=0.5 if State == 'Disabled' else None)
    comp.add(text('Label', 'Segment', S['text'], label))
    comp.props = {'Label': text_prop('Segment')}
    return comp


def segment_set():
    return make_set('Segment', 'One option of a segmented control (Nuxt UI tabs, pill variant).',
                    [('State', ['Inactive', 'Hover', 'Active', 'Disabled']), ('Size', ['sm', 'md'])], build_segment, ['Size'])


def build_segmented(Size, Count):
    n = int(Count)
    comp = component(vname(Size=Size, Count=Count), dir='h', gap=2, pad=(3, 3, 3, 3), radius='radius/lg', fill='--ui-bg-elevated')
    labels = ['List', 'Board', 'Calendar', 'Gallery'][:n]
    for i, lb in enumerate(labels):
        s = use('Segment', name=f'Segment {i + 1}', State='Active' if i == 0 else 'Inactive', Size=Size)
        set_text(s, 'Label', lb)
        comp.add(s)
    return comp


def segmented_set():
    return make_set('Segmented', 'Segmented control for switching between two to four views. The first segment is active.',
                    [('Size', ['sm', 'md']), ('Count', ['2', '3', '4'])], build_segmented, ['Size'])


# ------------------------------------------------------------------ NavItem / NavGroup
def build_navitem(State, Layout, Trailing):
    active = State == 'Active'
    fill = '--ui-primary-soft' if active else ('--ui-bg-elevated' if State == 'Hover' else None)
    label = '--ui-text-highlighted' if active or State == 'Hover' else '--ui-text-toned'
    ic = '--ui-primary-text' if active else label
    if Layout == 'Icon only':
        comp = component(vname(State=State, Layout=Layout, Trailing=Trailing), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=36, h=36,
                         radius='radius/md', fill=fill, opacity=0.5 if State == 'Disabled' else None)
        comp.add(I.icon('house', 16, ic, 'Icon'))
        comp.props = {'Icon': swap_prop('house')}
        return comp
    comp = component(vname(State=State, Layout=Layout, Trailing=Trailing), dir='h', cross='center', gap=10, sw='fixed', w=220, pad=(8, 10, 8, 10),
                     radius='radius/md', fill=fill, opacity=0.5 if State == 'Disabled' else None)
    comp.add(I.icon('house', 16, ic, 'Icon'))
    comp.add(text('Label', 'Home', 'Nexa/Body Medium', label, sw='fill'))
    if Trailing == 'Count':
        comp.add(frame('Count', text('Count', '12', 'Nexa/Caption', '--ui-text-highlighted'), pad=(0, 6, 0, 6), radius='radius/full', fill='--ui-bg-accented'))
    comp.props = {'Label': text_prop('Home'), 'Icon': swap_prop('house')}
    return comp


def navitem_set():
    return make_set('NavItem', 'Sidebar navigation item. Put the sidebar in the Dark variable mode for the always-dark Builder sidebar; the colors follow.',
                    [('State', ['Default', 'Hover', 'Active', 'Disabled']), ('Layout', ['Label', 'Icon only']), ('Trailing', ['None', 'Count'])],
                    build_navitem, ['Layout', 'Trailing'])


def build_navgroup(Collapsed):
    comp = component(vname(Collapsed=Collapsed), dir='h', cross='center', sw='fixed', w=220, pad=(0, 10, 4, 10))
    comp.add(text('Label', 'WORKSPACE', 'Nexa/Caption', '--ui-text-dimmed'))
    comp.props = {'Label': text_prop('WORKSPACE')}
    return comp


def navgroup_set():
    return make_set('NavGroupLabel', 'Small caps heading above a group of NavItems.', [('Collapsed', ['No'])], build_navgroup, ['Collapsed'])


# ------------------------------------------------------------------ Breadcrumb
def build_crumb(State):
    col = '--ui-text-highlighted' if State == 'Current' else ('--ui-text' if State == 'Hover' else '--ui-text-muted')
    comp = component(vname(State=State), dir='h', cross='center')
    comp.add(text('Label', 'Page', 'Nexa/Body Medium' if State == 'Current' else 'Nexa/Body', col, underline=State == 'Hover'))
    comp.props = {'Label': text_prop('Page')}
    return comp


def crumb_set():
    return make_set('BreadcrumbItem', 'One crumb. Current is the page you are on and is not a link.',
                    [('State', ['Default', 'Hover', 'Current'])], build_crumb, ['State'])


def build_breadcrumb(Count):
    n = int(Count)
    comp = component(vname(Count=Count), dir='h', cross='center', gap=8)
    labels = ['Builder', 'Modules', 'Vehicles', 'Fields'][:n]
    for i, lb in enumerate(labels):
        c = use('BreadcrumbItem', name=f'Crumb {i + 1}', State='Current' if i == n - 1 else 'Default')
        set_text(c, 'Label', lb)
        comp.add(c)
        if i < n - 1:
            comp.add(I.icon('chevron-right', 14, '--ui-text-dimmed', 'Separator'))
    return comp


def breadcrumb_set():
    return make_set('Breadcrumb', 'Path to the current page. The last item is the current page.',
                    [('Count', ['2', '3', '4'])], build_breadcrumb, ['Count'])


# ------------------------------------------------------------------ Pagination
def build_page(State, Size):
    px = {'sm': 28, 'md': 36}[Size]
    st = {'sm': 'Nexa/Small', 'md': 'Nexa/Body'}[Size]
    act = State == 'Active'
    fill = '--ui-primary' if act else ('--ui-bg-elevated' if State == 'Hover' else None)
    label = '--ui-on-solid' if act else '--ui-text-toned'
    comp = component(vname(State=State, Size=Size), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=px, h=px, radius='radius/md',
                     fill=fill, opacity=0.5 if State == 'Disabled' else None)
    comp.add(text('Label', '1', st, label))
    comp.props = {'Label': text_prop('1')}
    return comp


def page_set():
    return make_set('PageButton', 'Page number button of the pagination.',
                    [('State', ['Default', 'Hover', 'Active', 'Disabled']), ('Size', ['sm', 'md'])], build_page, ['Size'])


def build_pagination(Size):
    comp = component(vname(Size=Size), dir='h', cross='center', gap=4, sw='fixed', w=640, pad=(10, 12, 10, 12), stroke='--ui-border', stroke_sides=(1, 0, 0, 0))
    comp.add(text('Summary', 'Showing 1-10 of 1,204', 'Nexa/Small', '--ui-text-muted', sw='fill'))
    prev = use('IconButton', name='Previous', Color='Neutral', Variant='Ghost', Size=Size, State='Default')
    swap_icon(prev, 'Icon', 'chevron-left')
    comp.add(prev)
    pages = [('1', 'Active'), ('2', 'Default'), ('3', 'Default'), ('...', 'Default'), ('12', 'Default')]
    for lb, stt in pages:
        p = use('PageButton', name=f'Page {lb}', State=stt, Size=Size)
        set_text(p, 'Label', lb)
        comp.add(p)
    nxt = use('IconButton', name='Next', Color='Neutral', Variant='Ghost', Size=Size, State='Default')
    swap_icon(nxt, 'Icon', 'chevron-right')
    comp.add(nxt)
    return comp


def pagination_set():
    return make_set('Pagination', 'Table footer with the visible range and page buttons. Swap the arrows for chevron-left and chevron-right.',
                    [('Size', ['sm', 'md'])], build_pagination, ['Size'])


# ------------------------------------------------------------------ Menu
def build_menuitem(State, Icon, Tone):
    danger = Tone == 'Destructive'
    label = '--ui-error-text' if danger else '--ui-text-highlighted'
    fill = None
    if State in ('Hover', 'Selected'):
        fill = '--ui-error-soft' if danger else '--ui-bg-elevated'
    comp = component(vname(State=State, Icon=Icon, Tone=Tone), dir='h', cross='center', gap=8, sw='fixed', w=200, pad=(6, 8, 6, 8), radius='radius/md',
                     fill=fill, opacity=0.5 if State == 'Disabled' else None)
    props = {'Label': text_prop('Menu item')}
    if Icon == 'Leading':
        ic = I.icon('pencil', 16, '--ui-error-text' if danger else '--ui-text-muted', 'Icon')
        comp.add(ic)
        props['Icon'] = swap_prop('pencil')
    comp.add(text('Label', 'Menu item', 'Nexa/Body', label, sw='fill'))
    if State == 'Selected':
        comp.add(I.icon('check', 16, '--ui-primary-text', 'Check'))
    comp.props = props
    return comp


def menuitem_set():
    return make_set('MenuItem', 'Row of a dropdown, select list or command palette. Selected shows a check.',
                    [('State', ['Default', 'Hover', 'Selected', 'Disabled']), ('Icon', ['None', 'Leading']), ('Tone', ['Default', 'Destructive'])],
                    build_menuitem, ['Tone', 'Icon'])


def build_menu(Kind):
    comp = component(vname(Kind=Kind), dir='v', gap=2, sw='fixed', w=216, pad=(4, 4, 4, 4), radius='radius/lg', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_MD)
    icon_for = {'Edit': 'pencil', 'Duplicate': 'copy', 'Delete': 'trash-2'}
    if Kind == 'Actions':
        items = [('Edit', 'Default', 'Default'), ('Duplicate', 'Default', 'Default')]
    else:
        items = [('Vehicles', 'Selected', 'Default'), ('Drivers', 'Default', 'Default'), ('Maintenance', 'Default', 'Default')]
    for lb, stt, tn in items:
        m = use('MenuItem', name=lb, State=stt, Icon='Leading' if Kind == 'Actions' else 'None', Tone=tn)
        set_text(m, 'Label', lb)
        if lb in icon_for:
            swap_icon(m, 'Icon', icon_for[lb])
        comp.add(m)
    if Kind == 'Actions':
        comp.add(frame('Divider', sw='fill', sh='fixed', h=1, fill='--ui-border'))
        m = use('MenuItem', name='Delete', State='Default', Icon='Leading', Tone='Destructive')
        set_text(m, 'Label', 'Delete')
        swap_icon(m, 'Icon', icon_for['Delete'])
        comp.add(m)
    return comp


def menu_set():
    return make_set('Menu', 'Floating list opened from a Select, button or right click. Actions has a destructive item; Choice has a selected row.',
                    [('Kind', ['Actions', 'Choice'])], build_menu, ['Kind'])


# ------------------------------------------------------------------ Modal
def build_modal(Size, Tone, Footer):
    w = {'sm': 400, 'md': 480, 'lg': 640}[Size]
    danger = Tone == 'Destructive'
    comp = component(vname(Size=Size, Tone=Tone, Footer=Footer), dir='v', sw='fixed', w=w, radius='radius/xl', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_LG, clip=True)
    head = frame('Header', dir='h', gap=12, pad=(20, 20, 12, 20), sw='fill')
    if danger:
        head.add(frame('Icon bg', I.icon('triangle-alert', 20, '--ui-error-text', 'Icon'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=40, h=40,
                       radius='radius/full', fill='--ui-error-soft'))
    head.add(frame('Titles', text('Title', 'Modal title', 'Nexa/Heading', '--ui-text-highlighted', sw='fill'),
                   text('Description', 'Short description of what this dialog is for.', 'Nexa/Body', '--ui-text-muted', sw='fill', autoh=True), dir='v', gap=4, sw='fill'))
    close = use('IconButton', name='Close', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    swap_icon(close, 'Icon', 'x')
    head.add(close)
    comp.add(head)
    comp.add(frame('Body', text('Content', 'Dialog content goes here.', 'Nexa/Body', '--ui-text', sw='fill', autoh=True), dir='v', pad=(8, 20, 20, 20), sw='fill'))
    if Footer == 'Yes':
        foot = frame('Footer', dir='h', main='max', cross='center', gap=8, pad=(12, 20, 12, 20), sw='fill', fill='--ui-bg-muted', stroke='--ui-border', stroke_sides=(1, 0, 0, 0))
        cancel = use('Button', name='Cancel', Color='Neutral', Variant='Outline', Size='md', State='Default', Icon='None')
        set_text(cancel, 'Label', 'Cancel')
        foot.add(cancel)
        conf = use('Button', name='Confirm', Color='Error' if danger else 'Primary', Variant='Solid', Size='md', State='Default', Icon='None')
        set_text(conf, 'Label', 'Delete' if danger else 'Confirm')
        foot.add(conf)
        comp.add(foot)
    comp.props = {'Title': text_prop('Modal title'), 'Description': text_prop('Short description of what this dialog is for.')}
    return comp


def modal_set():
    return make_set('Modal', 'Dialog above a scrim (--ui-overlay). Destructive adds a warning icon and an error confirm button; keep Cancel as the safe action.',
                    [('Size', ['sm', 'md', 'lg']), ('Tone', ['Default', 'Destructive']), ('Footer', ['Yes', 'No'])], build_modal, ['Size'])


# ------------------------------------------------------------------ EmptyState
def build_empty(Actions):
    comp = component(vname(Actions=Actions), dir='v', main='center', cross='center', gap=10, sw='fixed', w=420, pad=(32, 32, 32, 32))
    comp.add(frame('Icon bg', I.icon('inbox', 28, '--ui-text-muted', 'Icon'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=56, h=56,
                   radius='radius/full', fill='--ui-bg-elevated'))
    comp.add(text('Title', 'Nothing here yet', 'Nexa/Subheading', '--ui-text-highlighted'))
    comp.add(text('Description', 'Start by adding the first item, or import from a file.', 'Nexa/Body', '--ui-text-muted'))
    if Actions != 'None':
        row = frame('Actions', dir='h', gap=8, pad=(6, 0, 0, 0))
        if Actions == 'Two':
            sa = use('Button', name='Secondary action', Color='Neutral', Variant='Outline', Size='md', State='Default', Icon='None')
            set_text(sa, 'Label', 'Import CSV')
            row.add(sa)
        pa = use('Button', name='Primary action', Color='Primary', Variant='Solid', Size='md', State='Default', Icon='Leading')
        set_text(pa, 'Label', 'Add item')
        row.add(pa)
        comp.add(row)
    comp.props = {'Title': text_prop('Nothing here yet'), 'Description': text_prop('Start by adding the first item, or import from a file.'), 'Icon': swap_prop('inbox')}
    return comp


def empty_set():
    return make_set('EmptyState', 'Use when a list, table or search has no content. Always offer the next step.',
                    [('Actions', ['None', 'One', 'Two'])], build_empty, ['Actions'])
