from comp_base import *
from comp_forms import field_look, FIELD

# ------------------------------------------------------------------ DayCell / Calendar / DatePicker
def build_day(State):
    fill = stroke = None
    col = '--ui-text'
    r = 'radius/md'
    if State == 'Hover':
        fill = '--ui-bg-elevated'
    elif State == 'Selected':
        fill, col = '--ui-primary', '--ui-on-solid'
    elif State == 'RangeMid':
        fill, col, r = '--ui-primary-soft-hover', '--ui-text-highlighted', 0
    elif State == 'Today':
        stroke, col = '--ui-primary-outline', '--ui-text-highlighted'
    elif State == 'Outside':
        col = '--ui-text-dimmed'
    elif State == 'Disabled':
        col = '--ui-text-dimmed'
    comp = component(vname(State=State), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=36, h=36, radius=r, fill=fill, stroke=stroke,
                     opacity=0.5 if State == 'Disabled' else None)
    comp.add(text('Day', '15', 'Nexa/Body Medium' if State in ('Selected', 'Today') else 'Nexa/Body', col))
    comp.props = {'Day': text_prop('15')}
    return comp


def day_set():
    return make_set('DayCell', 'One day in a calendar. RangeMid fills a square band between the start and end of a date range.',
                    [('State', ['Default', 'Hover', 'Selected', 'RangeMid', 'Today', 'Outside', 'Disabled'])], build_day, ['State'])


def build_calendar(Selection):
    comp = component(vname(Selection=Selection), dir='v', gap=8, sw='fixed', w=288, pad=(12, 12, 12, 12), radius='radius/xl', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_MD)
    prev = use('IconButton', name='Previous', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    swap_icon(prev, 'Icon', 'chevron-left')
    nxt = use('IconButton', name='Next', Color='Neutral', Variant='Ghost', Size='sm', State='Default')
    swap_icon(nxt, 'Icon', 'chevron-right')
    head = frame('Header', prev, frame('Label', text('Month', 'October 2026', 'Nexa/Body Medium', '--ui-text-highlighted'), dir='h', main='center', sw='fill'), nxt, dir='h', cross='center', sw='fill')
    comp.add(head)
    wk = frame('Weekdays', dir='h', gap=0, sw='fill')
    for d in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']:
        wk.add(frame('Weekday', text('Label', d, 'Nexa/Caption', '--ui-text-muted'), dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=36, h=24))
    comp.add(wk)
    days = [27, 28, 29, 30] + list(range(1, 32))
    outside = {0, 1, 2, 3}
    rng = (12, 16)
    for r in range(5):
        row = frame(f'Week {r + 1}', dir='h', gap=0, sw='fill')
        for c in range(7):
            i = r * 7 + c
            dnum = days[i]
            st = 'Outside' if i in outside else 'Default'
            if i not in outside:
                if Selection == 'Single' and dnum == 15:
                    st = 'Selected'
                elif Selection == 'Range' and dnum in (rng[0], rng[1]):
                    st = 'Selected'
                elif Selection == 'Range' and rng[0] < dnum < rng[1]:
                    st = 'RangeMid'
                elif dnum == 8 and Selection == 'None':
                    st = 'Today'
            cell = use('DayCell', name=f'Day {dnum}', State=st)
            set_text(cell, 'Day', str(dnum))
            row.add(cell)
        comp.add(row)
    return comp


def calendar_set():
    return make_set('Calendar', 'Month calendar for picking a date or a range. The DatePicker opens it under the field.',
                    [('Selection', ['None', 'Single', 'Range'])], build_calendar, ['Selection'])


def build_datepicker(State):
    comp = component(vname(State=State), dir='v', gap=6, sw='fixed', w=288)
    tr = use('Select', name='Field', Variant='Outline', Size='md', State='Focus' if State == 'Open' else 'Default', Icon='Leading', Value='Filled')
    tr.sw = 'fill'
    swap_icon(tr, 'Icon', 'calendar')
    set_text(tr, 'Value', '15 Oct 2026')
    comp.add(tr)
    if State == 'Open':
        comp.add(use('Calendar', name='Calendar', Selection='Single'))
    comp.props = {}
    return comp


def datepicker_set():
    return make_set('DatePicker', 'Date field. Closed is the field only; Open shows the Calendar popover beneath it.', [('State', ['Closed', 'Open'])], build_datepicker, ['State'])


# ------------------------------------------------------------------ Calendar view (Records - Calendar)
def build_event(Color):
    c = Color.lower()
    comp = component(vname(Color=Color), dir='h', cross='center', gap=4, sw='fill', pad=(2, 6, 2, 6), radius='radius/sm', fill=f'--ui-{c}-soft-hover')
    comp.add(ellipse('Dot', 6, 6, f'--ui-{c}'))
    comp.add(text('Title', 'AB-1234', 'Nexa/Small', '--ui-text-highlighted', sw='fill'))
    comp.props = {'Title': text_prop('AB-1234')}
    comp.sw = 'fixed'
    comp.w = 108
    return comp


def event_set():
    return make_set('CalendarEvent', 'Record shown on its date in the calendar view.', [('Color', ['Primary', 'Secondary', 'Warning', 'Error'])], build_event, ['Color'])


def build_dayblock(State, Events):
    fill = '--ui-bg-muted' if State == 'Outside' else '--ui-bg'
    comp = component(vname(State=State, Events=Events), dir='v', gap=4, sw='fixed', sh='fixed', w=120, h=104, pad=(6, 6, 6, 6), fill=fill, stroke='--ui-border', stroke_sides=(0, 1, 1, 0))
    num = frame('Number', text('Day', '15', 'Nexa/Small Medium', '--ui-text-dimmed' if State == 'Outside' else ('--ui-on-solid' if State == 'Today' else '--ui-text')), dir='h', main='center', cross='center',
                sw='fixed', sh='fixed', w=22, h=22, radius='radius/full', fill='--ui-primary' if State == 'Today' else None)
    comp.add(num)
    for i in range(int(Events)):
        e = use('CalendarEvent', name=f'Event {i + 1}', Color=['Primary', 'Warning'][i % 2])
        e.sw = 'fill'
        comp.add(e)
    comp.props = {'Day': text_prop('15')}
    return comp


def dayblock_set():
    return make_set('CalendarDay', 'Day block of the month view. Add up to two events; more should collapse into "+N more".',
                    [('State', ['Default', 'Today', 'Outside']), ('Events', ['0', '1', '2'])], build_dayblock, ['State'])


def build_calview(Weeks):
    n = int(Weeks)
    comp = component(vname(Weeks=Weeks), dir='v', sw='fixed', w=840, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', clip=True)
    wk = frame('Weekdays', dir='h', sw='fill', fill='--ui-bg-muted', stroke='--ui-border', stroke_sides=(0, 0, 1, 0))
    for d in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']:
        wk.add(frame('Weekday', text('Label', d, 'Nexa/Small Medium', '--ui-text-muted'), dir='h', main='min', cross='center', sw='fixed', sh='fixed', w=120, h=32, pad=(0, 0, 0, 8)))
    comp.add(wk)
    k = 0
    for r in range(n):
        row = frame(f'Week {r + 1}', dir='h', sw='fill')
        for c in range(7):
            out = (r == 0 and c < 4)
            st = 'Outside' if out else ('Today' if (r == 1 and c == 4) else 'Default')
            ev = '2' if (r == 1 and c in (2, 4)) else ('1' if (r + c) % 5 == 0 and not out else '0')
            d = use('CalendarDay', name='Day', State=st, Events=ev)
            num = (27 + c) if out else (r * 7 + c - 3)
            if not out:
                num = r * 7 + c - 3
            set_text(d, 'Day', str(num if num <= 31 else num - 31))
            row.add(d)
        comp.add(row)
    return comp


def calview_set():
    return make_set('CalendarView', 'Month view for the Records calendar. Compose from CalendarDay instances; set the Weeks count to 5 or 6.', [('Weeks', ['5', '6'])], build_calview, ['Weeks'])


# ------------------------------------------------------------------ Charts (static drawing; the chart library is chosen later)
DATA = [[40, 62, 35, 80, 55, 70, 48], [25, 40, 22, 55, 38, 45, 30]]
MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']


def build_bar(Series):
    ns = int(Series)
    W, Hh = 480, 200
    comp = component(vname(Series=Series), dir='h', gap=8, sw='fixed', w=W, sh='fixed', h=Hh + 28)
    yaxis = frame('Y axis', dir='v', sh='fixed', h=Hh, sw='fixed', w=32, main='min')
    for i, v in enumerate(['100', '75', '50', '25', '0']):
        yaxis.add(text('Tick', v, 'Nexa/Caption', '--ui-text-dimmed'))
        if i < 4:
            yaxis.add(frame('Gap', sw='fixed', sh='fill', w=1))
    plot_w = W - 32 - 8
    area = frame('Plot', dir='v', gap=8, sw='fixed', w=plot_w)
    plot = frame('Bars', dir='h', cross='max', sw='fixed', sh='fixed', w=plot_w, h=Hh)
    grid = frame('Grid', dir='v', sw='fixed', sh='fixed', w=plot_w, h=Hh, absolute=True)
    for i in range(5):
        grid.add(frame('Line', sw='fill', sh='fixed', h=1, fill='--ui-border'))
        if i < 4:
            grid.add(frame('Gap', sw='fill', sh='fill', h=1))
    plot.add(grid)
    for m in range(7):
        g = frame(f'Group {MONTHS[m]}', dir='h', gap=4, main='center', cross='max', sw='fill', sh='fixed', h=Hh)
        for s in range(ns):
            g.add(rect(f'Bar {s + 1}', 14, round(Hh * DATA[s][m] / 100), '--ui-primary' if s == 0 else '--ui-secondary', radius=(3, 3, 0, 0)))
        plot.add(g)
    area.add(plot)
    lab = frame('Labels', dir='h', sw='fill')
    for m in MONTHS:
        lab.add(frame('Label', text('Text', m, 'Nexa/Caption', '--ui-text-muted'), dir='h', main='center', sw='fill'))
    area.add(lab)
    comp.add(yaxis)
    comp.add(area)
    return comp


def bar_set():
    return make_set('BarChart', 'Drawn bar chart for mockups. Edit bar heights by hand; in code the chart library will render real data.', [('Series', ['1', '2'])], build_bar, ['Series'])


def build_legend(Series):
    comp = component(vname(Series=Series), dir='h', gap=16, cross='center')
    for s, nm in enumerate(['Fuel', 'Service'][:int(Series)]):
        comp.add(frame(f'Item {s + 1}', ellipse('Dot', 8, 8, '--ui-primary' if s == 0 else '--ui-secondary'), text('Label', nm, 'Nexa/Small', '--ui-text-muted'), dir='h', gap=6, cross='center'))
    return comp


def legend_set():
    return make_set('ChartLegend', 'Series legend placed above or beside a chart.', [('Series', ['1', '2'])], build_legend, ['Series'])


def build_chartcard(Series):
    comp = component(vname(Series=Series), dir='v', gap=16, sw='fixed', w=544, pad=(16, 16, 16, 16), radius='radius/xl', fill='--ui-bg', stroke='--ui-border')
    comp.add(frame('Head', text('Title', 'Cost by month', 'Nexa/Subheading', '--ui-text-highlighted', sw='fill'), use('ChartLegend', name='Legend', Series=Series), dir='h', cross='center', sw='fill'))
    comp.add(use('BarChart', name='Chart', Series=Series))
    comp.props = {'Title': text_prop('Cost by month')}
    return comp


def chartcard_set():
    return make_set('ChartCard', 'Dashboard widget: title, legend and chart inside a Card.', [('Series', ['1', '2'])], build_chartcard, ['Series'])


# ------------------------------------------------------------------ SelectMenu (searchable select)
OPTS = ['Toyota Hilux', 'Isuzu D-Max', 'Honda City', 'Mitsubishi Triton', 'Ford Ranger']


def build_smtrigger(Value, State):
    fill, stroke, sw, op = field_look('Outline', State)
    comp = component(vname(Value=Value, State=State), dir='h', cross='center', gap=8, sw='fixed', w=280, pad=(6, 12, 6, 12), radius='radius/md', fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
    inner = frame('Value', dir='h', cross='center', gap=6, sw='fill')
    if Value == 'Placeholder':
        inner.add(text('Text', 'Select vehicles', 'Nexa/Body', '--ui-text-dimmed'))
        comp.pad = (8, 12, 8, 12)
    elif Value == 'Single':
        inner.add(text('Text', 'Toyota Hilux', 'Nexa/Body', '--ui-text-highlighted'))
        comp.pad = (8, 12, 8, 12)
    else:
        for nm in OPTS[:2]:
            ch = use('Chip', name='Chip', Color='Neutral', Size='sm', Icon='None', Removable='Yes')
            set_text(ch, 'Label', nm)
            inner.add(ch)
    comp.add(inner)
    comp.add(I.icon('chevrons-up-down', 16, '--ui-text-dimmed', 'Trailing icon'))
    return comp


def smtrigger_set():
    return make_set('SelectMenuTrigger', 'Trigger of a searchable select. Multiple shows the selected items as removable Chips.',
                    [('Value', ['Placeholder', 'Single', 'Multiple']), ('State', ['Default', 'Focus', 'Error', 'Disabled'])], build_smtrigger, ['Value'])


def build_selectmenu(Mode):
    comp = component(vname(Mode=Mode), dir='v', sw='fixed', w=280, radius='radius/lg', fill='--ui-bg', stroke='--ui-border', effects=SHADOW_MD, clip=True)
    comp.add(frame('Search', I.icon('search', 16, '--ui-text-dimmed', 'Icon'), text('Query', 'Search...' if Mode != 'No results' else 'zzz', 'Nexa/Body',
                                                                                  '--ui-text-dimmed' if Mode != 'No results' else '--ui-text-highlighted', sw='fill'),
                   dir='h', cross='center', gap=8, pad=(10, 12, 10, 12), sw='fill', stroke='--ui-border', stroke_sides=(0, 0, 1, 0)))
    body = frame('Options', dir='v', gap=2, pad=(4, 4, 4, 4), sw='fill')
    if Mode == 'No results':
        body.add(frame('Empty', I.icon('search', 20, '--ui-text-dimmed', 'Icon'), text('Title', 'No matches', 'Nexa/Body Medium', '--ui-text-highlighted'),
                       text('Hint', 'Try a different search term.', 'Nexa/Small', '--ui-text-muted'), dir='v', main='center', cross='center', gap=4, pad=(20, 12, 20, 12), sw='fill'))
    else:
        for i, o in enumerate(OPTS):
            sel = i in ((0,) if Mode == 'Single' else (0, 1))
            if Mode == 'Multiple':
                cb = use('Checkbox', name='Checkbox', Checked='Checked' if sel else 'Unchecked', State='Default', Size='sm', Label='No')
                row = frame(o, cb, text('Label', o, 'Nexa/Body', '--ui-text-highlighted', sw='fill'), dir='h', cross='center', gap=8, pad=(6, 8, 6, 8), sw='fill', radius='radius/md',
                            fill='--ui-bg-elevated' if i == 2 else None)
            else:
                m = use('MenuItem', name=o, State='Selected' if sel else ('Hover' if i == 2 else 'Default'), Icon='None', Tone='Default')
                m.sw = 'fill'
                set_text(m, 'Label', o)
                row = m
            body.add(row)
    comp.add(body)
    if Mode == 'Multiple':
        comp.add(frame('Footer', text('Count', '2 selected', 'Nexa/Small', '--ui-text-muted', sw='fill'), use('Button', name='Clear', Color='Neutral', Variant='Ghost', Size='sm', State='Default', Icon='None'),
                       dir='h', cross='center', pad=(6, 8, 6, 12), sw='fill', stroke='--ui-border', stroke_sides=(1, 0, 0, 0)))
        set_text(comp.find('Clear'), 'Label', 'Clear')
    return comp


def selectmenu_set():
    return make_set('SelectMenu', 'Searchable select popover. Single marks one row; Multiple uses checkboxes and a footer; No results is the empty search.',
                    [('Mode', ['Single', 'Multiple', 'No results'])], build_selectmenu, ['Mode'])
