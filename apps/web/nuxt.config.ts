export default defineNuxtConfig({
  compatibilityDate: '2026-10-23',
  // @nuxt/ui is registered as a module here (packages/ui uses its Vite plugin) because the
  // package's stylesheet imports `@nuxt/ui`, whose generated CSS only the module provides.
  modules: ['@nuxt/ui'],
  devtools: { enabled: false },
  ssr: false,
  css: ['@nexa/ui/styles.css'],
  ui: { colorMode: false },
  // Same-origin proxy so the session cookie never crosses an origin (see packages/sdk).
  nitro: {
    devProxy: { '/v1': { target: process.env.NEXA_API_URL ?? 'http://localhost:3001/v1', changeOrigin: true } },
  },
});
