import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // Components are mounted for real, so they need a DOM.
    environment: 'happy-dom',
    testTimeout: 30_000,
  },
});
