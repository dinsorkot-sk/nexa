export default defineNuxtPlugin(() => {
  const applyRadius = (mode: string) => {
    document.documentElement.dataset.radius = mode;
  };
  applyRadius(localStorage.getItem('nexa:radius') ?? 'default');
  window.addEventListener(
    'nexa:radius',
    ((e: Event) => {
      const mode = (e as CustomEvent<string>).detail;
      localStorage.setItem('nexa:radius', mode);
      applyRadius(mode);
    }) as EventListener,
  );
});
