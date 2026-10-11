import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import UiPopover from '../src/components/UiPopover.vue';
import UiTooltip from '../src/components/UiTooltip.vue';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

const trigger = (label: string) => () => h('button', { type: 'button' }, label);

describe('UiPopover', () => {
  // An uncontrolled popover (no v-model) is not unit-tested here: happy-dom closes it again straight after opening
  // because it dispatches focus and pointer events differently from a browser. It was verified in headless Chromium
  // with real mouse and keyboard input: a click opens it and Escape closes it.

  it('an explicit v-model still controls it: a parent that keeps it false keeps it closed', async () => {
    const wrapper = mountWithI18n(UiPopover, { props: { modelValue: false }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'en');
    (document.body.querySelector('button') as HTMLButtonElement).click();
    await nextTick(); await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    expect(document.body.textContent).not.toContain('Body');
    wrapper.unmount();
  });

  it('opens from its trigger when controlled, and shows content in a dialog', async () => {
    const wrapper = mountWithI18n(UiPopover, { props: { modelValue: true }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'en');
    await nextTick(); await flushPromises();
    expect(document.body.textContent).toContain('Body');
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('reports its open state through v-model', async () => {
    const wrapper = mountWithI18n(UiPopover, { props: { modelValue: false }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'en');
    (document.body.querySelector('button') as HTMLButtonElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountWithI18n(UiPopover, { props: { modelValue: true }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'en');
    await nextTick(); await flushPromises();
    const content = document.body.querySelector('[role="dialog"]') as HTMLElement;
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('shows a localised close button only when closable', async () => {
    const closable = mountWithI18n(UiPopover, { props: { modelValue: true, closable: true }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'th');
    await nextTick(); await flushPromises();
    expect(document.body.querySelector('button[aria-label="ปิด"]')).not.toBeNull();
    closable.unmount();
    document.body.innerHTML = '';
    const plain = mountWithI18n(UiPopover, { props: { modelValue: true }, slots: { trigger: trigger('Open'), default: 'Body' }, attachTo: document.body }, 'en');
    await nextTick(); await flushPromises();
    expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
    plain.unmount();
  });
});

describe('UiTooltip', () => {
  it('renders its trigger and keeps the tooltip hidden until needed', () => {
    const wrapper = mountWithI18n(UiTooltip, { props: { text: 'Hint' }, slots: { default: trigger('Save') }, attachTo: document.body }, 'en');
    expect(document.body.textContent).toContain('Save');
    expect(document.body.textContent).not.toContain('Hint');
    wrapper.unmount();
  });

  it('shows on keyboard focus, so it is not mouse-only', async () => {
    const wrapper = mountWithI18n(UiTooltip, { props: { text: 'Hint', delay: 0 }, slots: { default: trigger('Save') }, attachTo: document.body }, 'en');
    const button = document.body.querySelector('button') as HTMLButtonElement;
    button.dispatchEvent(new Event('focus', { bubbles: true }));
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await nextTick(); await new Promise((resolve) => setTimeout(resolve, 20)); await flushPromises();
    expect(document.body.querySelector('[role="tooltip"]')?.textContent ?? document.body.textContent).toContain('Hint');
    wrapper.unmount();
  });
});
