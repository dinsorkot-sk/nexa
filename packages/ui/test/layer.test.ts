import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { en, th } from '@nuxt/ui/locale';
import DemoButton from './fixtures/DemoButton.vue';

describe('@nexa/ui layer', () => {
  it('auto-imports Nuxt UI components into templates', () => {
    const wrapper = mount(DemoButton);
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.text()).toBe('Save');
  });

  it('ships the Thai and English locales', () => {
    expect(th.code).toBe('th');
    expect(en.code).toBe('en');
  });
});
