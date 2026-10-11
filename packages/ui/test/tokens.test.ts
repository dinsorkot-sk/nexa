import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve(__dirname, '../src');
const tokensCss = readFileSync(path.join(srcDir, 'styles/tokens.css'), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Source files a component author writes. The token files are the one place palette values may live. */
const authoredFiles = walk(srcDir).filter((file) => /\.(vue|ts|css)$/.test(file) && !file.endsWith(`${path.sep}tokens.css`));

const PALETTES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const paletteClass = new RegExp(`(^|[^\\w-])(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|accent|decoration|shadow|placeholder)-(?:${PALETTES}|black|white)(?:-\\d{2,3})?(?![\\w-])`);
const literalColor = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

describe('no hardcoded colors outside the token file', () => {
  it('finds the source files it is meant to scan', () => {
    expect(authoredFiles.length).toBeGreaterThan(10);
  });

  it.each(authoredFiles.map((file) => [path.relative(srcDir, file), file] as const))('%s', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text.match(paletteClass)?.[0]).toBeUndefined();
    expect(text.match(literalColor)?.[0]).toBeUndefined();
  });

  it('the scanner itself detects violations', () => {
    expect(paletteClass.test('class="bg-slate-900"')).toBe(true);
    expect(paletteClass.test('class="text-emerald-300"')).toBe(true);
    expect(paletteClass.test('class="bg-primary text-foreground-muted"')).toBe(false);
    expect(literalColor.test('color: #fff')).toBe(true);
    expect(literalColor.test('color: var(--nx-foreground)')).toBe(false);
  });
});

/* ---- WCAG contrast ---- */

function parseTokens(css: string, selector: string): Map<string, string> {
  const darkSelector = "[data-theme='dark'],\nhtml.dark,\nhtml.htw-dark {";
  const block = selector === ':root'
    ? css.slice(css.indexOf(':root'), css.indexOf(darkSelector))
    : css.slice(css.indexOf(darkSelector));
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const));
}

function resolve(name: string, light: Map<string, string>, dark: Map<string, string>, theme: 'light' | 'dark', depth = 0): string {
  const value = (theme === 'dark' ? dark.get(name) : undefined) ?? light.get(name);
  if (value === undefined) throw new Error(`Token ${name} is not defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref && depth < 8) return resolve(ref[1]!, light, dark, theme, depth + 1);
  return value;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = parseTokens(tokensCss, ':root');
const dark = parseTokens(tokensCss, 'dark');
const css2 = tokensCss;

/** [foreground token, background token, minimum ratio]. 4.5 is WCAG AA for normal text, 3 for large text and UI. */
const pairs: Array<[string, string, number]> = [
  ['--nx-foreground', '--nx-background', 4.5],
  ['--nx-foreground', '--nx-surface', 4.5],
  ['--nx-foreground-muted', '--nx-surface', 4.5],
  ['--nx-foreground-muted', '--nx-background', 4.5],
  ['--nx-foreground-subtle', '--nx-surface', 4.5],
  ['--nx-placeholder', '--nx-surface', 4.5],
  ['--nx-primary-foreground', '--nx-primary', 4.5],
  ['--nx-primary-foreground', '--nx-primary-hover', 4.5],
  ['--nx-danger-foreground', '--nx-danger', 4.5],
  ['--nx-danger-foreground', '--nx-danger-hover', 4.5],
  ['--nx-success-soft-foreground', '--nx-success-soft', 4.5],
  ['--nx-warning-soft-foreground', '--nx-warning-soft', 4.5],
  ['--nx-danger-soft-foreground', '--nx-danger-soft', 4.5],
  ['--nx-neutral-soft-foreground', '--nx-neutral-soft', 4.5],
  ['--nx-foreground', '--nx-surface-muted', 4.5],
  ['--nx-foreground-muted', '--nx-surface-muted', 4.5],
  ['--nx-ring', '--nx-surface', 3],
  ['--nx-border', '--nx-surface', 1.5],
  ['--nx-border-strong', '--nx-surface', 3],
  ['--nx-border-strong', '--nx-background', 3],
];

describe('WCAG contrast of semantic tokens', () => {
  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      it.each(pairs)('%s on %s is at least %s:1', (fg, bg, min) => {
        const ratio = contrast(resolve(fg, light, dark, theme), resolve(bg, light, dark, theme));
        expect(ratio, `${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    });
  }

  it('every semantic token exists in both themes', () => {
    const semantic = [...light.keys()].filter((key) => key.startsWith('--nx-'));
    for (const key of semantic) expect(dark.has(key), `dark theme is missing ${key}`).toBe(true);
  });

  it('the dark block is keyed on the app attribute and the Histoire toggle class', () => {
    const darkStart = css2.indexOf("[data-theme='dark']");
    expect(darkStart).toBeGreaterThan(0);
    expect(css2.slice(darkStart, css2.indexOf('{', darkStart))).toContain('html.htw-dark');
  });

  it('the contrast function matches known WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
