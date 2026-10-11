export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const themeStorageKey = 'nexa.theme';

function readStored(): ThemeMode | undefined {
  try {
    const value = globalThis.localStorage?.getItem(themeStorageKey);
    return value === 'light' || value === 'dark' || value === 'system' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Resolves a mode to a concrete theme. `system` follows the OS preference and falls back to light. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

function systemPrefersDark(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies a theme to the document by setting data-theme, which tokens.css keys on. Returns what was applied. */
export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(mode, systemPrefersDark());
  root.setAttribute('data-theme', resolved);
  return resolved;
}

/** Reads the saved mode (default `system`), applies it, and returns it. Safe where storage is unavailable. */
export function initTheme(root?: HTMLElement): ThemeMode {
  const mode = readStored() ?? 'system';
  applyTheme(mode, root);
  return mode;
}

/** Saves and applies a mode. A storage failure does not prevent the theme from applying. */
export function setTheme(mode: ThemeMode, root?: HTMLElement): ResolvedTheme {
  try {
    globalThis.localStorage?.setItem(themeStorageKey, mode);
  } catch {
    // Private mode or blocked storage: the theme still applies for this session.
  }
  return applyTheme(mode, root);
}

let systemWatcher: { media: MediaQueryList; onChange: () => void } | undefined;

/**
 * Keeps `system` mode live: when the OS preference changes, the theme re-resolves without a reload.
 * The mode being explicit (light/dark) makes the change a no-op. Returns a disposer.
 */
export function watchSystemTheme(root: HTMLElement = document.documentElement): () => void {
  if (typeof globalThis.matchMedia !== 'function') return () => undefined;
  systemWatcher?.media.removeEventListener('change', systemWatcher.onChange);
  const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if ((readStored() ?? 'system') === 'system') applyTheme('system', root);
  };
  media.addEventListener('change', onChange);
  systemWatcher = { media, onChange };
  return () => {
    media.removeEventListener('change', onChange);
    if (systemWatcher?.media === media) systemWatcher = undefined;
  };
}
