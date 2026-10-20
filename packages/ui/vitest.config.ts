import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
  ],
  test: {
    environment: 'happy-dom',
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
