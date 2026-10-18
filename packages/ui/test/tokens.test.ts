import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

/** Custom properties declared inside one selector block of tokens.css. */
function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--ui-[a-z-]+):\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

const tokens = read('src/styles/tokens.css');
const light = block(tokens, ':root');
const dark = block(tokens, '.dark');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A translucent foreground drawn over an opaque background, in sRGB, as the browser composites it. */
function over(fg: string, alpha: number, bg: string): string {
  const [fr, fgG, fb] = hexToRgb(fg);
  const [br, bgG, bb] = hexToRgb(bg);
  const mix = (f: number, b: number) => Math.round(alpha * f + (1 - alpha) * b);
  return `#${[mix(fr, br), mix(fgG, bgG), mix(fb, bb)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

describe('design tokens', () => {
  it('defines the same token names in Light and Dark', () => {
    // Radius and motion are mode-independent, so they are declared once, in :root.
    const shared = ['--ui-radius'];
    const colours = (names: string[]) => names.filter((name) => !shared.includes(name) && !name.startsWith('--ui-motion') && !name.startsWith('--ui-ease')).sort();
    expect(colours(Object.keys(dark))).toEqual(colours(Object.keys(light)));
  });

  it('every token in theme.css refers to a defined custom property', () => {
    const theme = read('src/styles/theme.css');
    const refs = [...theme.matchAll(/var\((--ui-[a-z-]+)\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(light, ref).toHaveProperty(ref);
  });

  // Each pair is a text or icon colour the components actually use, with the background it sits on.
  const textPairs: Array<[string, string, 'light' | 'dark', string]> = [];
  for (const mode of ['light', 'dark'] as const) {
    textPairs.push(
      ['--ui-text', '--ui-bg', mode, 'body text'],
      ['--ui-text-highlighted', '--ui-bg', mode, 'headings'],
      ['--ui-text-toned', '--ui-bg', mode, 'secondary text'],
      ['--ui-text-muted', '--ui-bg', mode, 'placeholder, hint'],
      ['--ui-text-muted', '--ui-bg-muted', mode, 'read-only field'],
      ['--ui-text-toned', '--ui-bg-elevated', mode, 'chip, nav hover'],
      ['--ui-text-inverted', '--ui-bg-inverted', mode, 'tooltip'],
      ['--ui-on-solid', '--ui-primary', mode, 'primary button'],
      ['--ui-on-solid', '--ui-error', mode, 'danger button'],
      ['--ui-error-text', '--ui-bg', mode, 'error message'],
      ['--ui-info-text', '--ui-bg', mode, 'info icon (non-text)'],
      ['--ui-success-text', '--ui-bg', mode, 'success icon (non-text)'],
      ['--ui-error-text', '--ui-bg', mode, 'error icon (non-text)'],
    );
  }

  it.each(textPairs)('%s on %s meets WCAG AA in %s mode (%s)', (fgName, bgName, mode, use) => {
    const t = mode === 'light' ? light : dark;
    const ratio = contrast(t[fgName], t[bgName]);
    // Icon-only uses need 3:1 (WCAG 1.4.11); text needs 4.5:1 (WCAG 1.4.3).
    const required = use.includes('non-text') ? 3 : 4.5;
    expect(ratio).toBeGreaterThanOrEqual(required);
  });

  it('badge and secondary labels meet AA on their translucent tint', () => {
    for (const [mode, t] of [['light', light], ['dark', dark]] as const) {
      const tints: Array<[string, number]> = [['--ui-primary', 0.15], ['--ui-success', 0.15], ['--ui-info', 0.15], ['--ui-warning', 0.2], ['--ui-error', 0.15]];
      for (const [name, alpha] of tints) {
        const backdrop = over(t[name], alpha, t['--ui-bg']);
        expect(contrast(t['--ui-text-highlighted'], backdrop), `${mode} ${name} tint`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('documents the mockup pairs that fail AA and are therefore not used', () => {
    // Recorded so the decision stays visible: these fail with the mockup values, so no component uses them for text.
    expect(contrast('#00c16a', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#fb2c36', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#d08700', '#ffffff')).toBeLessThan(4.5);
  });
});

describe('no hardcoded colours in components', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    }).filter((path) => /\.(vue|ts|css)$/.test(path));
  }

  const sources = [...files(join(root, 'src/components')), ...files(join(root, 'src/lib'))];

  it('scans a non-empty source set', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(sources.map((path) => [path.slice(root.length + 1), path] as const))('%s uses token colours only', (_name, path) => {
    const text = readFileSync(path, 'utf8');
    expect(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(text.match(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/g) ?? []).toEqual([]);
    expect(text.match(/\b(bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|placeholder|divide|decoration)-(white|black)\b/g) ?? []).toEqual([]);
    expect(text.match(/\b(bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|placeholder|divide|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g) ?? []).toEqual([]);
  });
});
