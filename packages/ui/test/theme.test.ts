import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, initTheme, resolveTheme, setTheme, themeStorageKey, watchSystemTheme } from '../src/theme';

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

describe('watchSystemTheme', () => {
  type Listener = (event: { matches: boolean }) => void;

  /** A matchMedia stub whose `matches` can be flipped, capturing the change listeners. */
  function stubOsWith(initial: boolean) {
    let matches = initial;
    const listeners: Listener[] = [];
    const media = {
      get matches() { return matches; },
      addEventListener: (_: string, fn: Listener) => listeners.push(fn),
      removeEventListener: (_: string, fn: Listener) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    };
    vi.stubGlobal('matchMedia', () => media);
    return {
      flip(next: boolean) { matches = next; listeners.forEach((fn) => fn({ matches: next })); },
      get listenerCount() { return listeners.length; },
    };
  }

  it('re-resolves system mode live when the OS preference flips', () => {
    const os = stubOsWith(false);
    initTheme(); // default mode: system → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const dispose = watchSystemTheme();
    os.flip(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    os.flip(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    dispose();
  });

  it('does not override an explicit saved mode', () => {
    const os = stubOsWith(false);
    setTheme('dark');
    const dispose = watchSystemTheme();
    os.flip(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    dispose();
  });

  it('the disposer removes the listener and later changes are ignored', () => {
    const os = stubOsWith(false);
    initTheme();
    const dispose = watchSystemTheme();
    expect(os.listenerCount).toBe(1);
    dispose();
    expect(os.listenerCount).toBe(0);
    os.flip(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('replaces a previous watcher instead of leaking listeners', () => {
    const os = stubOsWith(false);
    initTheme();
    watchSystemTheme();
    const disposeSecond = watchSystemTheme();
    expect(os.listenerCount).toBe(1);
    disposeSecond();
    expect(os.listenerCount).toBe(0);
  });

  it('is a no-op disposer where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(watchSystemTheme()).toBeTypeOf('function');
    expect(() => watchSystemTheme()()).not.toThrow();
  });
});
