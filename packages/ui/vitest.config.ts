import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// The suite must give the same result whatever the shell says. Vue's production build drops the devtools hook
// @vue/test-utils uses to record emitted events, so a shell that exports NODE_ENV=production would otherwise fail
// the tests that read `wrapper.emitted()`. The value is set here as well as in `test.env` below, because the first
// one only reaches the test runtime: the transform pipeline reads NODE_ENV when the config is loaded.
process.env.NODE_ENV = 'test';

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
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
