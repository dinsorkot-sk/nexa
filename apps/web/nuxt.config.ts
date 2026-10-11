import { fileURLToPath } from 'node:url';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-06',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  srcDir: 'app/',
  components: [
    { path: '~/components' },
    { path: '~/components/runtime', pathPrefix: false },
    { path: fileURLToPath(new URL('../../packages/ui/src/components', import.meta.url)), pattern: '*.vue', pathPrefix: false },
  ],
  // Browser calls same-origin `/v1/**`; Nitro proxies them to the API process.
  routeRules: {
    '/v1/**': { proxy: `${process.env.NEXA_API_ORIGIN ?? 'http://localhost:3001'}/v1/**` },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? '',
    },
  },
  // Absolute paths: relative alias targets don't resolve in the client bundle.
  alias: {
    '@nexa/meta': fileURLToPath(new URL('../../packages/meta/src/index.ts', import.meta.url)),
    '@nexa/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
    '@nexa/auth': fileURLToPath(new URL('../../packages/auth/src/index.ts', import.meta.url)),
    '@nexa/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
    '@nexa/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
    '@nexa/server': fileURLToPath(new URL('../../apps/server/hono/app.ts', import.meta.url)),
  },
  tailwindcss: {
    configPath: 'tailwind.config.ts',
  },
});
