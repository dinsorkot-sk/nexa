from comp_base import *
import found

CATS = [
    ('Actions', 'Buttons trigger an action. Pick Color for intent and Variant for emphasis.', [
        ('Button', ['Button']), ('IconButton', ['IconButton'])]),
    ('Data display', 'Components that present status, identity and content.', [
        ('Badge', ['Badge']), ('Indicator', ['Indicator']), ('Chip', ['Chip']), ('Avatar', ['Avatar']), ('Kbd', ['Kbd']), ('Logo', ['Logo']),
        ('Card', ['Card']), ('Alert', ['Alert']), ('Toast', ['Toast']), ('Tooltip', ['Tooltip']), ('Skeleton', ['Skeleton']),
        ('Separator', ['Separator']), ('EmptyState', ['EmptyState'])]),
    ('Forms', 'Inputs and the FormField wrapper. Every control has Default, Hover, Focus, Error and Disabled.', [
        ('Input', ['Input']), ('Textarea', ['Textarea']), ('Select', ['Select']), ('Checkbox', ['Checkbox']), ('Radio', ['Radio']),
        ('Switch', ['Switch']), ('FormField', ['FormField']), ('SelectMenu', ['SelectMenuTrigger', 'SelectMenu']), ('DatePicker', ['DayCell', 'Calendar', 'DatePicker'])]),
    ('Field renderers', 'Input and display for all 23 field types of @nexa/meta. Use FieldInput inside FormField; use FieldValue in tables, record detail and kanban cards.', [
        ('FieldInput', ['FieldInput']), ('FieldValue', ['FieldValue']), ('ReferenceSelect', ['ReferenceSelect'])]),
    ('Navigation', 'Moving around: tabs, segmented control, sidebar items, breadcrumb, pagination and menus.', [
        ('Tabs', ['Tab', 'Tabs']), ('Segmented control', ['Segment', 'Segmented']), ('NavItem', ['NavItem', 'NavGroupLabel']),
        ('Breadcrumb', ['BreadcrumbItem', 'Breadcrumb']), ('Pagination', ['PageButton', 'Pagination']), ('Menu', ['MenuItem', 'Menu'])]),
    ('Data and records', 'Tables, KPI tiles, progress and record cards.', [
        ('Table', ['TableRow', 'Table']), ('StatCard', ['StatCard']), ('Progress', ['Progress']), ('Stepper', ['Step', 'Stepper']),
        ('KanbanCard', ['KanbanCard']), ('FileUpload', ['FileUpload']), ('Calendar view', ['CalendarEvent', 'CalendarDay', 'CalendarView']),
        ('Charts', ['ChartLegend', 'BarChart', 'LineChart', 'DonutChart', 'ChartCard']),
        ('Activity', ['ActivityItem', 'Timeline'])]),
    ('Content and feedback', 'Smaller pieces for help text, grouping and system messages.', [
        ('Banner', ['Banner']), ('Accordion', ['AccordionItem', 'Accordion']), ('Popover', ['Popover']), ('AvatarGroup', ['AvatarGroup']),
        ('Link', ['Link']), ('CodeBlock', ['CodeBlock'])]),
    ('Builder', 'Pieces of the module builder screens: entity designer, formula editor, workflow designer, permissions and package preview.', [
        ('FieldRow', ['FieldRow']), ('FormulaEditor', ['FormulaEditor']), ('Workflow', ['WorkflowNode', 'WorkflowEdge']),
        ('PermissionsTable', ['PermissionCell', 'PermissionsTable']), ('PackageDiff', ['DiffRow', 'PackageDiff'])]),
    ('App shell', 'Dashboard layout pieces used by every signed-in screen.', [
        ('Sidebar', ['OrgSwitcher', 'Sidebar']), ('Navbar', ['Navbar']), ('PageHeader', ['PageHeader'])]),
    ('Overlays', 'Floating surfaces above the page.', [('Modal', ['Modal']), ('Slideover', ['Slideover']), ('CommandPalette', ['CommandPalette'])]),
]


def props_note(setname, s):
    axes = AXES[setname]
    first = s.children[0]
    pr = ', '.join(f'{k} ({v["type"]})' for k, v in (first.props or {}).items())
    vals = '; '.join(f'{a}: ' + '/'.join(dict.fromkeys(c.name.split(f'{a}=')[1].split(',')[0] for c in s.children)) for a in axes)
    out = f'{setname} variants - {vals}.'
    if pr:
        out += f'  Component properties - {pr}.'
    return out


def build_components_page(SETS):
    pg = page('Components')
    secs = []
    for cat, cdesc, items in CATS:
        secs.append(frame(f'Category / {cat}', text('Category', cat, 'Nexa/Display', '--ui-text-highlighted'),
                          text('Category note', cdesc, 'Nexa/Body Large', '--ui-text-muted'), dir='v', gap=4, pad=(48, 0, 0, 0)))
        for title, keys in items:
            contents = []
            notes = []
            desc = SETS[keys[0]].description
            for k in keys:
                notes.append(props_note(k, SETS[k]))
            for k in keys:
                contents.append(frame(f'Set / {k}', *( [text('Set name', k, 'Nexa/Subheading', '--ui-text-highlighted')] if len(keys) > 1 else []), SETS[k], dir='v', gap=8))
            if len(keys) > 1:
                desc = ' '.join(SETS[k].description for k in keys)
            secs.append(section(title, desc, notes, *contents))
    head = frame('Components / Header', text('Title', 'Nexa Components', 'Nexa/Display', '--ui-text-highlighted'),
                 text('Intro', 'Built from the Foundations variables and the Nuxt UI v4 component structure: one component set per component, with Color, Variant, Size and State as variant properties and Label/Icon as component properties. Pick a variant in the right panel after placing an instance.',
                      'Nexa/Body Large', '--ui-text-muted', sw='fixed', w=1100, autoh=True),
                 text('Intro2', 'Dark preview at the end of this page shows the same components in the Dark variable mode (no separate dark components).', 'Nexa/Body', '--ui-text-muted'),
                 dir='v', gap=8)
    root = frame('Components', head, *secs, dir='v', gap=56, pad=(64, 64, 64, 64))
    return pg, root


def dark_preview(light=False):
    mode = 'Light' if light else 'Dark'

    def col(*kids):
        return frame('Column', *kids, dir='v', gap=16)

    btns = frame('Buttons', use('Button', name='Primary', Color='Primary', Variant='Solid', Size='md', State='Default', Icon='Leading'),
                 use('Button', name='Neutral', Color='Neutral', Variant='Outline', Size='md', State='Default', Icon='None'),
                 use('Button', name='Soft', Color='Primary', Variant='Soft', Size='md', State='Default', Icon='None'),
                 use('Button', name='Ghost', Color='Neutral', Variant='Ghost', Size='md', State='Default', Icon='None'),
                 use('Button', name='Error', Color='Error', Variant='Solid', Size='md', State='Default', Icon='None'), dir='h', gap=8, cross='center')
    badges = frame('Badges', *[use('Badge', name=c, Color=c, Variant=v, Size='md', Leading='Dot' if v == 'Soft' else 'None') for c, v in
                               (('Primary', 'Solid'), ('Success', 'Soft'), ('Info', 'Subtle'), ('Warning', 'Soft'), ('Error', 'Outline'), ('Neutral', 'Soft'))], dir='h', gap=8, cross='center')
    controls = frame('Controls', use('Input', name='Input', Variant='Outline', Size='md', State='Default', Icon='Leading', Value='Filled'),
                     use('Select', name='Select', Variant='Soft', Size='md', State='Default', Icon='None', Value='Placeholder'),
                     use('Checkbox', name='Checkbox', Checked='Checked', State='Default', Size='md', Label='Yes'),
                     use('Radio', name='Radio', Checked='Checked', State='Default', Size='md', Label='Yes'),
                     use('Switch', name='Switch', Checked='On', State='Default', Size='md', Label='Yes'), dir='v', gap=12)
    c1 = col(btns, badges, controls, use('Tabs', name='Tabs', Size='md', Count='3'), use('Segmented', name='Segmented', Size='md', Count='3'))
    c2 = col(use('Alert', name='Alert', Color='Info', Variant='Subtle', Description='Yes'), use('Alert', name='Alert error', Color='Error', Variant='Soft', Description='No'),
             use('Card', name='Card', Variant='Outline', Header='Yes', Footer='Yes'), use('FormField', name='FormField', State='Error', Required='Yes', Hint='Yes', Size='md'))
    c3 = col(frame('Sidebar', use('NavGroupLabel', name='Group', Collapsed='No'), use('NavItem', name='Active', State='Active', Layout='Label', Trailing='None'),
                   use('NavItem', name='Default', State='Default', Layout='Label', Trailing='Count'), use('NavItem', name='Hover', State='Hover', Layout='Label', Trailing='None'),
                   dir='v', gap=4, pad=(12, 12, 12, 12), radius='radius/lg', fill='--ui-bg-muted', stroke='--ui-border'),
             use('Menu', name='Menu', Kind='Actions'), use('Toast', name='Toast', Color='Success', Action='Button'))
    c4 = col(use('Modal', name='Modal', Size='sm', Tone='Destructive', Footer='Yes'), use('EmptyState', name='Empty', Actions='One'))
    body = frame(f'Preview / {mode}', text('Title', f'{mode} mode preview', 'Nexa/Heading', '--ui-text-highlighted'),
                 frame('Columns', c1, c2, c3, c4, dir='h', gap=48), dir='v', gap=24, pad=(32, 32, 32, 32), fill='--ui-bg', radius='radius/xl',
                 stroke='--ui-border', var_modes={'Nexa / Semantic colors': mode})
    return body
