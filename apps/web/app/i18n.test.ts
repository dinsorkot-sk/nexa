import fs from 'node:fs';
import path from 'node:path';

const appDir = path.resolve(import.meta.dirname);

function collectVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectVueFiles(p, out);
    else if (entry.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

function loadLocale(code: string): Record<string, unknown> {
  const localesDir = path.join(appDir, '..', 'i18n', 'locales');
  return JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8')) as Record<string, unknown>;
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

const usedKeys = new Set<string>();
const files = collectVueFiles(path.join(appDir, 'pages'))
  .concat(collectVueFiles(path.join(appDir, 'components')))
  .concat(collectVueFiles(path.join(appDir, 'layouts')))
  .concat(collectVueFiles(appDir).filter((f) => f.endsWith('.vue') && path.dirname(f) === appDir));

const keyPattern = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
const dynamicPattern = /\bt\(\s*`([a-zA-Z0-9_.]+)\$\{/g;

// known dynamic suffixes for prefix keys like t(`builder.status.${s}`)
const DYNAMIC_SUFFIXES: Record<string, string[]> = {
  'errors.title': ['401', '403', '404', '500'],
  'errors.description': ['401', '403', '404', '500'],
  'builder.status': ['draft', 'review', 'published', 'enabled', 'disabled', 'archived'],
  'records.views': ['table', 'kanban', 'calendar', 'gallery', 'detail'],
  'shell.role': ['owner', 'admin', 'member', 'viewer'],
  'builder.modules.options': ['blank', 'template', 'import'],
  'builder.versions': ['workingCopy', 'published'],
  'fields.placeholder': ['text', 'longText', 'email', 'phone', 'url', 'integer', 'number', 'decimal', 'currency', 'percentage', 'select', 'multiSelect', 'date', 'datetime', 'time', 'json', 'file', 'image'],
  'gallery.variant': ['Solid', 'Soft', 'Outline', 'Ghost', 'Link'],
  'gallery.tab': ['1', '2', '3'],
  'settings.numberFormat': ['Th', 'En'],
};

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const m of content.matchAll(keyPattern)) usedKeys.add(m[1]);
  for (const m of content.matchAll(dynamicPattern)) {
    const prefix = m[1];
    const suffixes = DYNAMIC_SUFFIXES[prefix];
    if (suffixes) {
      for (const s of suffixes) usedKeys.add(`${prefix}${s}`);
    }
  }
}

// also scan .ts files under app (composables/utils)
for (const file of collectVueFiles(appDir).filter((f) => f.endsWith('.ts'))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const m of content.matchAll(keyPattern)) usedKeys.add(m[1]);
}

const th = flatten(loadLocale('th'));
const en = flatten(loadLocale('en'));

describe('i18n dictionaries', () => {
  test('th and en have identical key sets', () => {
    const thKeys = Object.keys(th);
    const enKeys = Object.keys(en);
    expect(thKeys.length).toBeGreaterThan(0);
    for (const k of thKeys) {
      expect(enKeys, `missing in en: ${k}`).toContain(k);
    }
    for (const k of enKeys) {
      expect(thKeys, `missing in th: ${k}`).toContain(k);
    }
  });

  test('every t() key used in templates exists in both locales', () => {
    const missing: string[] = [];
    for (const k of usedKeys) {
      if (!(k in th)) missing.push(`th:${k}`);
      if (!(k in en)) missing.push(`en:${k}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('no hardcoded user-visible strings', () => {
  const BRAND = new Set(['Nexa']);
  const SHORTCUT = /^[A-Z0-9+ ]+$/;

  function templateOf(content: string): string {
    const m = content.match(/<template>([\s\S]*?)<\/template>/);
    return m ? m[1] : '';
  }

  function stripExpressions(text: string): string {
    return text.replace(/\{\{[\s\S]*?\}\}/g, '');
  }

  function stripTags(text: string): string[] {
    // collect text nodes: content between > and < that is not whitespace-only
    const nodes: string[] = [];
    for (const m of text.matchAll(/>([^<>]*)</g)) {
      const node = m[1];
      if (!node || !node.trim()) continue;
      nodes.push(node.trim());
    }
    return nodes;
  }

  const violations: string[] = [];

  for (const file of collectVueFiles(appDir)) {
    const template = stripExpressions(templateOf(fs.readFileSync(file, 'utf8')));
    for (const node of stripTags(template)) {
      // strip leading symbols/whitespace-only
      const text = node.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!text) continue;
      if (BRAND.has(text)) continue;
      // single tokens without spaces (data, icons values, codes, shortcuts)
      if (!/\s/.test(text) && !/[\u0E00-\u0E77]/.test(text)) continue;
      if (SHORTCUT.test(text)) continue;
      if (/^[0-9%+\-–—:.,/() ]+$/.test(text)) continue;
      violations.push(`${path.relative(appDir, file)}: "${text}"`);
    }
  }

  test('templates contain no raw text outside $t()', () => {
    expect(violations).toEqual([]);
  });
});
