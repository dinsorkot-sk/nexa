export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  compatibilityDate: '2026-11-19',
  devtools: { enabled: false },
  // the ERP UI is a client-side app over the engine API (proxied by server/api/[...path].ts)
  ssr: false,
  runtimeConfig: {
    // NUXT_API_BASE overrides at runtime
    apiBase: 'http://127.0.0.1:3001',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Nexa',
    },
  },
})
