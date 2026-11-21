import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  ui: {
    fonts: false,
  },
  icon: {
    serverBundle: { collections: ['lucide'] },
  },
})
