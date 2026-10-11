import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, initTheme, resolveTheme, setTheme, themeStorageKey } from '../src/theme';

afterEach(() => {
  // Restore real globals first: a test may have replaced localStorage with a stub that has no clear().
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('resolveTheme', () => {
  it('returns explicit modes unchanged and follows the OS for system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('theme controller', () => {
  it('sets data-theme on the root element', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('follows prefers-color-scheme when the mode is system', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(applyTheme('system')).toBe('dark');
  });

  it('persists the chosen mode and restores it', () => {
    setTheme('dark');
    expect(localStorage.getItem(themeStorageKey)).toBe('dark');
    document.documentElement.removeAttribute('data-theme');
    expect(initTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to system and ignores a corrupt stored value', () => {
    localStorage.setItem(themeStorageKey, 'purple');
    expect(initTheme()).toBe('system');
  });

  it('still applies the theme when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(initTheme()).toBe('system');
  });
});
