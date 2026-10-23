export default defineNuxtConfig({
  compatibilityDate: '2026-10-23',
  // @nuxt/ui is registered as a module here (packages/ui uses its Vite plugin) because the
  // package's stylesheet imports `@nuxt/ui`, whose generated CSS only the module provides.
  modules: ['@nuxt/ui'],
  devtools: { enabled: false },
  ssr: false,
  css: ['@nexa/ui/styles.css'],
  ui: { colorMode: false },
  // @nexa/ui is type-checked by its own stricter config; here its sources are only consumed.
  typescript: { tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } } },
  vite: {
    // Escape hatch for a slow first boot on WSL's /mnt/d (9p): point Vite's cache at the
    // Linux filesystem for the session, e.g. NEXA_VITE_CACHE_DIR=/tmp/opencode/nexa-vite.
    ...(process.env.NEXA_VITE_CACHE_DIR ? { cacheDir: process.env.NEXA_VITE_CACHE_DIR } : {}),
  },
  // Same-origin proxy so the session cookie never crosses an origin (see packages/sdk). A route
  // rule works in dev and in the built server alike; NEXA_API_URL is the API's origin.
  routeRules: {
    '/v1/**': { proxy: `${process.env.NEXA_API_URL ?? 'http://localhost:3001'}/v1/**` },
  },
});
