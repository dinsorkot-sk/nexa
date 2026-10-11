import { createI18n } from 'vue-i18n';
import en from './locales/en';
import th from './locales/th';

export type Locale = 'th' | 'en';
export const locales: readonly Locale[] = ['th', 'en'];
export const defaultLocale: Locale = 'th';
export const localeStorageKey = 'nexa.locale';

export const messages = { th, en } as const;

function isLocale(value: unknown): value is Locale {
  return value === 'th' || value === 'en';
}

function readStoredLocale(): Locale | undefined {
  try {
    const value = globalThis.localStorage?.getItem(localeStorageKey);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Creates the i18n instance. Thai is the default; a saved choice wins; `initial` overrides both (tests, SSR). */
export function createNexaI18n(initial?: Locale) {
  return createI18n({
    legacy: false,
    locale: initial ?? readStoredLocale() ?? defaultLocale,
    fallbackLocale: 'en',
    messages,
  });
}

export type NexaI18n = ReturnType<typeof createNexaI18n>;

/** Switches language and keeps the document's lang attribute in step so fonts and screen readers follow. */
export function setLocale(i18n: NexaI18n, locale: Locale, root: HTMLElement = document.documentElement): void {
  i18n.global.locale.value = locale;
  root.setAttribute('lang', locale);
  try {
    globalThis.localStorage?.setItem(localeStorageKey, locale);
  } catch {
    // Storage unavailable: the language still changes for this session.
  }
}
