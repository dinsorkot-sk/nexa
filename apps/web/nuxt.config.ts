export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',

  ssr: false,
  srcDir: 'app/',

  extends: ['@nexa/ui'],

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@nuxt/icon'],

  icon: {
    clientBundle: true,
  },

  i18n: {
    defaultLocale: 'th',
    strategy: 'no_prefix',
    langDir: 'locales/',
    lazy: true,
    locales: [
      { code: 'th', name: 'ไทย', iso: 'th-TH', file: 'th.json' },
      { code: 'en', name: 'English', iso: 'en-US', file: 'en.json' },
    ],
    vueI18n: 'vue-i18n.config.ts',
  },

  nitro: {
    devProxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXA_API_BASE ?? '/api',
    },
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Nexa',
      htmlAttrs: { lang: 'th' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap',
          rel: 'stylesheet',
        },
      ],
    },
  },
});
