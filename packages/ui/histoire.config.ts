import { defineConfig } from 'histoire';
import { HstVue } from '@histoire/plugin-vue';

export default defineConfig({
  plugins: [HstVue()],
  setupFile: '/histoire.setup.ts',
  theme: {
    title: 'Nexa UI',
    // Histoire's own light/dark switch sets `htw-dark` on the preview, which tokens.css keys on for the dark tokens.
    darkClass: 'htw-dark',
  },
  // Histoire's own light/dark switch drives the same data-theme attribute the app uses.
  backgroundPresets: [
    { label: 'Theme background', color: 'var(--nx-background)', contrastColor: 'var(--nx-foreground)' },
  ],
  storyMatch: ['src/**/*.story.vue'],
  tree: {
    groups: [
      { id: 'Primitives', title: 'Primitives' },
      { id: 'Views', title: 'Views' },
      { id: 'Mockups', title: 'Mockups' },
    ],
  },
  // WSL2 filesystem I/O is slow; reduce thread contention during collection.
  collectMaxThreads: 1,
});
