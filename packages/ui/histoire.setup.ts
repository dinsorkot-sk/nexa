import './src/styles/index.css';
import './src/styles/playground.css';
import { defineSetupVue3 } from '@histoire/plugin-vue';
import { createNexaI18n } from './src/i18n';
import { watchSystemTheme } from './src/theme';

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(createNexaI18n());
  // Keep `system` mode live inside stories; Histoire's own toggle drives `htw-dark`, which tokens.css also keys on.
  watchSystemTheme();
});
