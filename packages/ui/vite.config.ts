import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { defineConfig } from 'vite';

// The playground is a plain Vite app that exercises the library the way an application would.
export default defineConfig({
  root: 'playground',
  plugins: [
    // Nuxt UI's plugin is `enforce: 'pre'`: it has to resolve `#imports` and `#build/ui/*` before
    // the Vue plugin compiles the components that import them.
    ui({
      // The library renders links as plain anchors and never routes, so Nuxt UI does not need vue-router.
      router: false,
      ui: {
        colors: {
          primary: 'green',
          neutral: 'slate',
        },
      },
    }),
    vue(),
    tailwindcss(),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
  },
  resolve: {
    alias: {
      '@nexa/ui/styles.css': fileURLToPath(new URL('./src/styles/index.css', import.meta.url)),
    },
  },
});
