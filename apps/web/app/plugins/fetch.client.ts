export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const api = $fetch.create({
    baseURL: config.public.apiBase,
    credentials: 'include',
    async onRequest({ options }) {
      options.headers.set('x-tenant-slug', getTenantSlug());
      options.headers.set('x-correlation-id', crypto.randomUUID());
    },
    async onResponseError({ response, request }) {
      if (response.status === 401) {
        const path = typeof request === 'string' ? request : request.url;
        const current = typeof window !== 'undefined' ? window.location.pathname : '';
        if (!path.startsWith('/auth') && !current.startsWith('/login')) {
          await navigateTo('/login', { external: false, redirectCode: 302 });
        }
      }
    },
  });

  return { provide: { api } };
});

function getTenantSlug(): string {
  if (typeof window === 'undefined') return 'loghoizon';
  return localStorage.getItem('nexa:tenant') ?? 'loghoizon';
}
