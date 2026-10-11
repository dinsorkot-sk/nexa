import { mount, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';
import { createNexaI18n, type Locale } from '../src/i18n';

/** Mounts a component with the same i18n plugin the app installs. */
export function mountWithI18n(component: Component, options: Parameters<typeof mount>[1] = {}, locale: Locale = 'en'): VueWrapper {
  const i18n = createNexaI18n(locale);
  return mount(component, { ...options, global: { ...(options.global ?? {}), plugins: [i18n, ...((options.global?.plugins as never[]) ?? [])] } });
}
