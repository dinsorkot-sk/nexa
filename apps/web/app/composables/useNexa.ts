export function useNexa() {
  const colorMode = useColorMode();
  const { locale, setLocale } = useI18n();

  const radius = computed(() => {
    if (typeof document === 'undefined') return 'default';
    return document.documentElement.dataset.radius ?? 'default';
  });

  function setRadius(mode: 'compact' | 'default' | 'comfortable' | 'round') {
    localStorage.setItem('nexa:radius', mode);
    window.dispatchEvent(new CustomEvent('nexa:radius', { detail: mode }));
  }

  function setLanguage(next: 'th' | 'en') {
    setLocale(next);
    localStorage.setItem('nexa:locale', next);
    document.documentElement.lang = next;
  }

  const localeWritable = computed<'th' | 'en'>({
    get: () => (locale.value === 'en' ? 'en' : 'th'),
    set: (next) => setLanguage(next),
  });

  return {
    colorMode,
    locale: localeWritable,
    setLanguage,
    radius,
    setRadius,
  };
}
