import './src/styles/index.css';
import { defineSetupVue3 } from '@histoire/plugin-vue';
import { createNexaI18n } from './src/i18n';

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(createNexaI18n());
});
