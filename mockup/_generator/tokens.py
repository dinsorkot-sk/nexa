"""Foundation tokens: variables and styles for Nexa. Values come from the Nuxt UI palette used in the mockup (nexa - Copy.figcraft)."""
from figlib import DOC
import figlib

RAMPS = {
    'green': {'50': '#effdf5', '100': '#d9fbe8', '200': '#b3f5d1', '300': '#75edae', '400': '#00dc82', '500': '#00c16a', '600': '#00a155', '700': '#007f45', '800': '#016538', '900': '#0a5331', '950': '#052e16'},
    'blue': {'50': '#eff6ff', '100': '#dbeafe', '200': '#bedbff', '300': '#8ec5ff', '400': '#51a2ff', '500': '#2b7fff', '600': '#155dfc', '700': '#1447e6', '800': '#193cb8', '900': '#1c398e', '950': '#162456'},
    'yellow': {'50': '#fefce8', '100': '#fef9c2', '200': '#fff085', '300': '#ffdf20', '400': '#fcc800', '500': '#efb100', '600': '#d08700', '700': '#a65f00', '800': '#894b00', '900': '#733e0a', '950': '#432004'},
    'red': {'50': '#fef2f2', '100': '#ffe2e2', '200': '#ffc9c9', '300': '#ffa2a2', '400': '#ff6467', '500': '#fb2c36', '600': '#e7000b', '700': '#c10007', '800': '#9f0712', '900': '#82181a', '950': '#460809'},
    'slate': {'50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cad5e2', '400': '#90a1b9', '500': '#62748e', '600': '#45556c', '700': '#314158', '800': '#1d293d', '900': '#0f172b', '950': '#020618'},
}
STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
# semantic color -> primitive ramp
BRAND = {'primary': 'green', 'secondary': 'blue', 'success': 'green', 'info': 'blue', 'warning': 'yellow', 'error': 'red'}
SPACE = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64]
RADIUS = {  # role: multiplier of the base radius (Nuxt UI scale)
    'xs': 0.5, 'sm': 1, 'md': 1.5, 'lg': 2, 'xl': 3, '2xl': 4}
RADIUS_MODES = {'Default (4)': 4, 'Compact (2)': 2, 'Comfortable (6)': 6, 'Round (8)': 8}


def build_tokens():
    d = DOC
    prim = d.collection('Nexa / Color primitives', ['Value'])
    for ramp, steps in RAMPS.items():
        for s in STEPS:
            d.color_var(prim, f'{ramp}/{s}', {'Value': steps[s]}, scopes=['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'])
    d.color_var(prim, 'neutral/white', {'Value': '#ffffff'})
    d.color_var(prim, 'neutral/black', {'Value': '#000000'})

    sem = d.collection('Nexa / Semantic colors', ['Light', 'Dark'])

    def tok(name, light, dark, desc=''):
        d.color_var(sem, name, {'Light': light, 'Dark': dark}, description=desc)

    # surfaces, text, borders: identical to the Nuxt UI tokens of the mockup (collection "3 - Tokens")
    tok('--ui-bg', '@neutral/white', '@slate/900', 'Page background.')
    tok('--ui-bg-muted', '@slate/50', '@slate/800', 'Subtle section background.')
    tok('--ui-bg-elevated', '@slate/100', '@slate/800', 'Raised surface, hover fill for neutral controls.')
    tok('--ui-bg-accented', '@slate/200', '@slate/700', 'Strong neutral fill, hover on elevated surfaces.')
    tok('--ui-bg-inverted', '@slate/900', '@neutral/white', 'Inverted surface (tooltips, neutral solid buttons).')
    tok('--ui-border', '@slate/200', '@slate/800', 'Default border.')
    tok('--ui-border-muted', '@slate/200', '@slate/700', 'Quiet divider.')
    tok('--ui-border-accented', '@slate/300', '@slate/700', 'Input and outline border.')
    tok('--ui-border-inverted', '@slate/900', '@neutral/white', 'Border on inverted surfaces.')
    tok('--ui-text-dimmed', '@slate/400', '@slate/500', 'Placeholder and disabled text.')
    tok('--ui-text-muted', '@slate/500', '@slate/400', 'Secondary text.')
    tok('--ui-text-toned', '@slate/600', '@slate/300', 'Tertiary-emphasis body text.')
    tok('--ui-text', '@slate/700', '@slate/200', 'Default body text.')
    tok('--ui-text-highlighted', '@slate/900', '@neutral/white', 'Headings and labels on tints.')
    tok('--ui-text-inverted', '@neutral/white', '@slate/900', 'Text on inverted surfaces.')
    tok('--ui-on-solid', '@slate/900', '@slate/900', 'Label on a solid brand/status fill. Nexa addition: the mockup white label fails WCAG AA.')
    tok('--ui-ring', '@slate/900', '@neutral/white', 'Focus ring for neutral controls.')
    tok('--ui-overlay', ('#020618', 0.5), ('#020618', 0.7), 'Scrim behind modals and slide-overs.')
    tok('--ui-neutral', '@neutral/black', '@neutral/white', 'Neutral brand color (Nuxt UI neutral).')
    tok('--ui-neutral-hover', ('#0f172b', 0.9), ('#ffffff', 0.9), 'Neutral solid hover.')
    # brand and status colors
    for name, ramp in BRAND.items():
        l500, d400 = RAMPS[ramp]['500'], RAMPS[ramp]['400']
        tok(f'--ui-{name}', f'@{ramp}/500', f'@{ramp}/400', f'{name} solid fill.')
        tok(f'--ui-{name}-text', f'@{ramp}/600', f'@{ramp}/300', f'{name} text and icons on a plain surface.')
        tok(f'--ui-{name}-hover', (l500, 0.9), (d400, 0.9), f'{name} solid hover.')
        tok(f'--ui-{name}-soft', (l500, 0.10), (d400, 0.10), f'{name} tint (Soft and Subtle fills).')
        tok(f'--ui-{name}-soft-hover', (l500, 0.15), (d400, 0.15), f'{name} tint on hover.')
        tok(f'--ui-{name}-ring', (l500, 0.25), (d400, 0.25), f'{name} subtle border.')
        tok(f'--ui-{name}-outline', (l500, 0.50), (d400, 0.50), f'{name} outline border.')

    sp = d.collection('Nexa / Spacing', ['Value'])
    for v in SPACE:
        d.number_var(sp, f'space/{v}', {'Value': v}, ['GAP', 'WIDTH_HEIGHT'] if False else ['GAP'])

    rd = d.collection('Nexa / Radius', list(RADIUS_MODES))
    for role, mul in RADIUS.items():
        d.number_var(rd, f'radius/{role}', {m: b * mul for m, b in RADIUS_MODES.items()}, ['CORNER_RADIUS'],
                     description=f'{mul}x the base radius.')
    d.number_var(rd, 'radius/full', {m: 999 for m in RADIUS_MODES}, ['CORNER_RADIUS'], description='Pill and circle.')

    # text styles ---------------------------------------------------------
    T = d.text_style
    T('Nexa/Display', 'Inter', 'Semi Bold', 32, 40, 'Page hero, auth titles.')
    T('Nexa/Title', 'Inter', 'Semi Bold', 24, 32, 'Page title.')
    T('Nexa/Heading', 'Inter', 'Semi Bold', 20, 28, 'Section heading, modal title.')
    T('Nexa/Subheading', 'Inter', 'Semi Bold', 16, 24, 'Card title, group title.')
    T('Nexa/Body Large', 'Inter', 'Regular', 16, 24, 'Lead paragraph, large control text.')
    T('Nexa/Body Large Medium', 'Inter', 'Medium', 16, 24, 'Large button label.')
    T('Nexa/Body', 'Inter', 'Regular', 14, 20, 'Default UI and paragraph text.')
    T('Nexa/Body Medium', 'Inter', 'Medium', 14, 20, 'Labels, button text, table cell emphasis.')
    T('Nexa/Body Strong', 'Inter', 'Semi Bold', 14, 20, 'Emphasised row title.')
    T('Nexa/Small', 'Inter', 'Regular', 12, 16, 'Hints, meta, table captions.')
    T('Nexa/Small Medium', 'Inter', 'Medium', 12, 16, 'Small button label, badge.')
    T('Nexa/Caption', 'Inter', 'Medium', 11, 16, 'Kbd, avatar initials, group labels.')
    T('Nexa/Mono', 'Consolas', 'Regular', 13, 20, 'Code, IDs, formulas.')
    T('Nexa/Mono Small', 'Consolas', 'Regular', 12, 16, 'Inline code, kbd keys.')

    # paint styles: one per semantic token (apply with the variable's current mode)
    for v in list(d.vars):
        if v.startswith('--ui-'):
            d.paint_style('Nexa/' + v[5:], v)
