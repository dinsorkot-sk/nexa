import { afterEach, describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en';
import th from '../src/i18n/locales/th';
import { createNexaI18n, defaultLocale, localeStorageKey, setLocale } from '../src/i18n';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('lang'); });

describe('i18n catalogues', () => {
  it('th and en define exactly the same keys', () => {
    expect(keys(th).sort()).toEqual(keys(en).sort());
  });

  it('no message is empty in either language', () => {
    for (const catalogue of [th, en]) for (const key of keys(catalogue)) {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue);
      expect(typeof value === 'string' && value.length > 0, key).toBe(true);
    }
  });

  it('Thai strings actually contain Thai text, so a copy-pasted English value is caught', () => {
    const translated = ['common.close', 'common.loading', 'dialog.close', 'theme.dark'];
    for (const key of translated) {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], th) as string;
      expect(/[฀-๿]/.test(value), key).toBe(true);
    }
  });
});

describe('locale selection', () => {
  it('defaults to Thai', () => {
    expect(defaultLocale).toBe('th');
    expect(createNexaI18n().global.locale.value).toBe('th');
  });

  it('switches language without remounting and updates the document lang', () => {
    const i18n = createNexaI18n('th');
    expect(i18n.global.t('dialog.close')).toBe('ปิดหน้าต่าง');
    setLocale(i18n, 'en');
    expect(i18n.global.t('dialog.close')).toBe('Close dialog');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('remembers the choice for the next session', () => {
    setLocale(createNexaI18n('th'), 'en');
    expect(localStorage.getItem(localeStorageKey)).toBe('en');
    expect(createNexaI18n().global.locale.value).toBe('en');
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem(localeStorageKey, 'fr');
    expect(createNexaI18n().global.locale.value).toBe('th');
  });
});
