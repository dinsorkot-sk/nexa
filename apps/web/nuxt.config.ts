export default defineNuxtConfig({
  compatibilityDate: '2026-10-06',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  srcDir: 'app/',
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    },
  },
  alias: {
    '@nexa/meta': '../../packages/meta/src/index.ts',
    '@nexa/db': '../../packages/db/src/index.ts',
    '@nexa/auth': '../../packages/auth/src/index.ts',
    '@nexa/ui': '../../packages/ui/src/index.ts',
    '@nexa/sdk': '../../packages/sdk/src/index.ts',
    '@nexa/server': '../../apps/server/hono/app.ts',
  },
});
