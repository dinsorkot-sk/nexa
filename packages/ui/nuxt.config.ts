import { fileURLToPath } from 'node:url';

// Nuxt layer: apps extend this with `extends: ['@nexa/ui']`.
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  // `~` would resolve to the consuming app, so the layer's stylesheet is referenced by absolute path.
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  compatibilityDate: '2025-07-15',
});
