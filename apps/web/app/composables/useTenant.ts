export function useTenant() {
  const slug = useState('tenant:slug', () => {
    if (typeof window === 'undefined') return 'loghoizon';
    return localStorage.getItem('nexa:tenant') ?? 'loghoizon';
  });

  const { queryClient } = useNuxtApp();

  function setTenant(next: string) {
    if (next === slug.value) return;
    slug.value = next;
    localStorage.setItem('nexa:tenant', next);
    queryClient.clear();
    navigateTo(useRoute().fullPath, { replace: true });
  }

  return { slug: readonly(slug), setTenant };
}
