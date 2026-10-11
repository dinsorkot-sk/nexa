import { defineConfig } from 'histoire';
import { HstVue } from '@histoire/plugin-vue';

export default defineConfig({
  plugins: [HstVue()],
  setupFile: '/histoire.setup.ts',
  theme: { title: 'Nexa UI' },
  // Histoire's own light/dark switch drives the same data-theme attribute the app uses.
  backgroundPresets: [
    { label: 'Theme background', color: 'var(--nx-background)', contrastColor: 'var(--nx-foreground)' },
  ],
  storyMatch: ['src/**/*.story.vue'],
});
