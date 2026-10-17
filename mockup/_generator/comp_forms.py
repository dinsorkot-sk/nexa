from comp_base import *

FIELD = {'sm': dict(py=6, px=10, gap=6, icon=14, text='Nexa/Small'),
         'md': dict(py=8, px=12, gap=6, icon=16, text='Nexa/Body'),
         'lg': dict(py=10, px=16, gap=8, icon=20, text='Nexa/Body Large')}
FIELD_VARIANTS = ['Outline', 'Soft', 'Subtle']
FIELD_STATES = ['Default', 'Hover', 'Focus', 'Error', 'Disabled']


def field_look(variant, state):
    """(fill, stroke, stroke_w, opacity) for an Input / Textarea / Select."""
    v = variant.lower()
    base = {'outline': ('--ui-bg', '--ui-border-accented'), 'soft': ('--ui-bg-elevated', None), 'subtle': ('--ui-bg-elevated', '--ui-border-accented')}[v]
    fill, stroke = base
    sw, op = 1, None
    if state == 'Hover':
        if v == 'soft':
            fill = '--ui-bg-accented'
        else:
            stroke = '--ui-text-dimmed'
    elif state == 'Focus':
        stroke, sw = '--ui-primary', 2
        if v == 'soft':
            fill = '--ui-bg'
    elif state == 'Error':
        stroke = '--ui-error'
    elif state == 'Disabled':
        op = 0.5
    return fill, stroke, sw, op


def build_input(Variant, Size, State, Icon, Value):
    S = FIELD[Size]
    fill, stroke, sw, op = field_look(Variant, State)
    comp = component(vname(Variant=Variant, Size=Size, State=State, Icon=Icon, Value=Value), dir='h', cross='center', gap=S['gap'],
                     sw='fixed', w=240, pad=(S['py'], S['px'], S['py'], S['px']), radius='radius/md' if Size != 'lg' else 'radius/lg',
                     fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
    props = {'Value': text_prop('Placeholder' if Value == 'Placeholder' else 'Value')}
    if Icon == 'Leading':
        comp.add(I.icon('search', S['icon'], '--ui-text-dimmed', 'Icon'))
        props['Icon'] = swap_prop('search')
    comp.add(text('Value', 'Placeholder' if Value == 'Placeholder' else 'Value', S['text'],
                  '--ui-text-dimmed' if Value == 'Placeholder' else '--ui-text-highlighted', sw='fill'))
    if Icon == 'Trailing':
        comp.add(I.icon('eye', S['icon'], '--ui-text-dimmed', 'Trailing icon'))
        props['Trailing icon'] = swap_prop('eye')
    comp.props = props
    return comp


def input_set():
    return make_set('Input', 'Single-line text field. Value shows the placeholder or entered text. Error uses the error border; always pair it with a message (see FormField).',
                    [('Variant', FIELD_VARIANTS), ('Size', ['sm', 'md', 'lg']), ('State', FIELD_STATES), ('Icon', ['None', 'Leading', 'Trailing']),
                     ('Value', ['Placeholder', 'Filled'])], build_input, ['Variant', 'Size', 'Value', 'Icon'])


def build_textarea(Variant, Size, State, Value):
    S = FIELD[Size]
    fill, stroke, sw, op = field_look(Variant, State)
    lines = 3
    lh = {'sm': 16, 'md': 20, 'lg': 24}[Size]
    comp = component(vname(Variant=Variant, Size=Size, State=State, Value=Value), dir='v', sw='fixed', sh='fixed', w=280, h=2 * S['py'] + lines * lh,
                     pad=(S['py'], S['px'], S['py'], S['px']), radius='radius/md' if Size != 'lg' else 'radius/lg', fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
    ph = 'Write something...' if Value == 'Placeholder' else 'A longer value that can wrap onto more than one line when the text area is narrow.'
    comp.add(text('Value', ph, S['text'], '--ui-text-dimmed' if Value == 'Placeholder' else '--ui-text-highlighted', sw='fill', autoh=True))
    comp.props = {'Value': text_prop(ph)}
    return comp


def textarea_set():
    return make_set('Textarea', 'Multi-line text field. Fixed at three lines; resize the instance height for more.',
                    [('Variant', FIELD_VARIANTS), ('Size', ['sm', 'md', 'lg']), ('State', FIELD_STATES), ('Value', ['Placeholder', 'Filled'])],
                    build_textarea, ['Variant', 'Size', 'Value'])


def build_select(Variant, Size, State, Icon, Value):
    S = FIELD[Size]
    fill, stroke, sw, op = field_look(Variant, State)
    comp = component(vname(Variant=Variant, Size=Size, State=State, Icon=Icon, Value=Value), dir='h', cross='center', gap=S['gap'],
                     sw='fixed', w=240, pad=(S['py'], S['px'], S['py'], S['px']), radius='radius/md' if Size != 'lg' else 'radius/lg',
                     fill=fill, stroke=stroke, stroke_w=sw, opacity=op)
    ph = 'Select an option' if Value == 'Placeholder' else 'Option'
    props = {'Value': text_prop(ph)}
    if Icon == 'Leading':
        comp.add(I.icon('folder', S['icon'], '--ui-text-dimmed', 'Icon'))
        props['Icon'] = swap_prop('folder')
    comp.add(text('Value', ph, S['text'], '--ui-text-dimmed' if Value == 'Placeholder' else '--ui-text-highlighted', sw='fill'))
    comp.add(I.icon('chevron-down', S['icon'], '--ui-text-dimmed', 'Trailing icon'))
    comp.props = props
    return comp


def select_set():
    return make_set('Select', 'Dropdown trigger. Open state is shown by the Menu component placed under it.',
                    [('Variant', FIELD_VARIANTS), ('Size', ['sm', 'md', 'lg']), ('State', FIELD_STATES), ('Icon', ['None', 'Leading']),
                     ('Value', ['Placeholder', 'Filled'])], build_select, ['Variant', 'Size', 'Value', 'Icon'])


# ------------------------------------------------------------------ Checkbox / Radio / Switch
CTRL = {'sm': dict(box=14, icon=10, text='Nexa/Small', gap=8), 'md': dict(box=16, icon=12, text='Nexa/Body', gap=8),
        'lg': dict(box=20, icon=14, text='Nexa/Body Large', gap=10)}
CTRL_STATES = ['Default', 'Hover', 'Focus', 'Disabled']


def _ctrl_look(checked, state, off_stroke='--ui-border-accented'):
    fill = '--ui-primary' if checked else '--ui-bg'
    stroke, sw = ('--ui-primary' if checked else off_stroke), 1
    if state == 'Hover':
        if checked:
            fill, stroke = '--ui-primary-hover', '--ui-primary'
        else:
            stroke = '--ui-text-dimmed'
    if state == 'Focus':
        stroke, sw = ('--ui-primary-outline'), 3
    return fill, stroke, sw, (0.5 if state == 'Disabled' else None)


def build_checkbox(Checked, State, Size, Label):
    S = CTRL[Size]
    on = Checked != 'Unchecked'
    fill, stroke, sw, op = _ctrl_look(on, State)
    box = frame('Box', dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=S['box'], h=S['box'], radius='radius/sm', fill=fill,
                stroke=stroke, stroke_w=sw, stroke_align='inside' if sw == 1 else 'outside')
    if Checked == 'Checked':
        box.add(I.icon('check', S['icon'], '--ui-on-solid', 'Check'))
    elif Checked == 'Indeterminate':
        box.add(I.icon('minus', S['icon'], '--ui-on-solid', 'Minus'))
    comp = component(vname(Checked=Checked, State=State, Size=Size, Label=Label), dir='h', cross='center', gap=S['gap'], opacity=op)
    comp.add(box)
    if Label == 'Yes':
        comp.add(text('Label', 'Label', S['text'], '--ui-text-highlighted'))
        comp.props = {'Label': text_prop('Label')}
    return comp


def checkbox_set():
    return make_set('Checkbox', 'Binary or tri-state choice. Indeterminate is for a parent that has some children selected.',
                    [('Checked', ['Unchecked', 'Checked', 'Indeterminate']), ('State', CTRL_STATES), ('Size', ['sm', 'md', 'lg']), ('Label', ['Yes', 'No'])],
                    build_checkbox, ['Checked', 'Size'])


def build_radio(Checked, State, Size, Label):
    S = CTRL[Size]
    on = Checked == 'Checked'
    fill, stroke, sw, op = _ctrl_look(on, State)
    box = frame('Circle', dir='h', main='center', cross='center', sw='fixed', sh='fixed', w=S['box'], h=S['box'], radius='radius/full', fill=fill,
                stroke=stroke, stroke_w=sw, stroke_align='inside' if sw == 1 else 'outside')
    if on:
        d = round(S['box'] * 0.4)
        box.add(ellipse('Dot', d, d, '--ui-on-solid'))
    comp = component(vname(Checked=Checked, State=State, Size=Size, Label=Label), dir='h', cross='center', gap=S['gap'], opacity=op)
    comp.add(box)
    if Label == 'Yes':
        comp.add(text('Label', 'Label', S['text'], '--ui-text-highlighted'))
        comp.props = {'Label': text_prop('Label')}
    return comp


def radio_set():
    return make_set('Radio', 'Single choice from a group. Stack Radio instances vertically with an 8px gap.',
                    [('Checked', ['Unchecked', 'Checked']), ('State', CTRL_STATES), ('Size', ['sm', 'md', 'lg']), ('Label', ['Yes', 'No'])],
                    build_radio, ['Checked', 'Size'])


SW = {'sm': (28, 16, 12), 'md': (36, 20, 16), 'lg': (44, 24, 20)}


def build_switch(Checked, State, Size, Label):
    w, h, k = SW[Size]
    S = CTRL[Size]
    on = Checked == 'On'
    fill = '--ui-primary' if on else '--ui-border-accented'
    stroke, sw = None, 1
    if State == 'Hover':
        fill = '--ui-primary-hover' if on else '--ui-text-dimmed'
    if State == 'Focus':
        stroke, sw = '--ui-primary-outline', 3
    track = frame('Track', ellipse('Knob', k, k, '--ui-bg'), dir='h', main='max' if on else 'min', cross='center', sw='fixed', sh='fixed', w=w, h=h,
                  pad=(2, 2, 2, 2), radius='radius/full', fill=fill, stroke=stroke, stroke_w=sw, stroke_align='outside')
    comp = component(vname(Checked=Checked, State=State, Size=Size, Label=Label), dir='h', cross='center', gap=S['gap'],
                     opacity=0.5 if State == 'Disabled' else None)
    comp.add(track)
    if Label == 'Yes':
        comp.add(text('Label', 'Label', S['text'], '--ui-text-highlighted'))
        comp.props = {'Label': text_prop('Label')}
    return comp


def switch_set():
    return make_set('Switch', 'On/off setting that applies immediately. Use Checkbox for choices that are submitted with a form.',
                    [('Checked', ['Off', 'On']), ('State', CTRL_STATES), ('Size', ['sm', 'md', 'lg']), ('Label', ['Yes', 'No'])],
                    build_switch, ['Checked', 'Size'])


# ------------------------------------------------------------------ FormField (label + control + message)
def build_formfield(State, Required, Hint, Size):
    label_style = {'sm': 'Nexa/Small Medium', 'md': 'Nexa/Body Medium'}[Size]
    comp = component(vname(State=State, Required=Required, Hint=Hint, Size=Size), dir='v', gap=6, sw='fixed', w=280)
    lab = frame('Label row', text('Label', 'Label', label_style, '--ui-text-highlighted'), dir='h', gap=2, cross='min')
    if Required == 'Yes':
        lab.add(text('Required', '*', label_style, '--ui-error-text'))
    comp.add(lab)
    ist = {'Default': 'Default', 'Error': 'Error', 'Disabled': 'Disabled'}[State]
    inp = use('Input', name='Input', Variant='Outline', Size=Size, State=ist, Icon='None', Value='Placeholder')
    inp.sw = 'fill'
    comp.add(inp)
    if State == 'Error':
        comp.add(text('Message', 'This field is required.', 'Nexa/Small', '--ui-error-text', sw='fill', autoh=True))
    elif Hint == 'Yes':
        comp.add(text('Message', 'Helper text explains what to enter.', 'Nexa/Small', '--ui-text-muted', sw='fill', autoh=True))
    comp.props = {'Label': text_prop('Label')}
    return comp


def formfield_set():
    return make_set('FormField', 'Label, control and message together. Swap the Input for a Select or Textarea instance of the same width. Error replaces the hint.',
                    [('State', ['Default', 'Error', 'Disabled']), ('Required', ['No', 'Yes']), ('Hint', ['Yes', 'No']), ('Size', ['sm', 'md'])],
                    build_formfield, ['State', 'Size'])
