export default defineNuxtConfig({
  compatibilityDate: '2026-10-06',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  alias: {
    '@nexa/meta': '../../packages/meta/src/index.ts',
    '@nexa/db': '../../packages/db/src/index.ts',
    '@nexa/auth': '../../packages/auth/src/index.ts',
    '@nexa/ui': '../../packages/ui/src/index.ts',
    '@nexa/sdk': '../../packages/sdk/src/index.ts',
    '@nexa/server': '../../apps/server/hono/app.ts',
  },
});
