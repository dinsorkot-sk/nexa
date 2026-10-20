import { createApp, h } from 'vue';
import UApp from '@nuxt/ui/components/App.vue';
import ui from '@nuxt/ui/vue-plugin';
import '@nexa/ui/styles.css';
import App from './App.vue';

const app = createApp({
  render: () => h(UApp, null, { default: () => h(App) }),
});
// Nuxt UI's plugin provides the app config, the toast and tooltip providers, and the icon renderer.
app.use(ui);
app.mount('#app');
