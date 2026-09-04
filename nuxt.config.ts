// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxthub/core', '@nuxt/ui'],
  hub: {
    db: 'sqlite'
  },
  devtools: { enabled: true }
})
