export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  compatibilityDate: '2026-11-19',
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Nexa Studio',
    },
  },
  runtimeConfig: {
    apiBase: 'http://127.0.0.1:3001/api',
  },
})
