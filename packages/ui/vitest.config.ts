import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Fixed so datetime tests are deterministic: Bangkok is UTC+7 with no daylight saving.
process.env.TZ = 'Asia/Bangkok';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // Components are mounted for real, so they need a DOM.
    environment: 'happy-dom',
    testTimeout: 30_000,
  },
});
