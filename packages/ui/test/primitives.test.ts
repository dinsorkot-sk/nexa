import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import UiBadge from '../src/components/UiBadge.vue';
import UiButton from '../src/components/UiButton.vue';
import UiCard from '../src/components/UiCard.vue';
import UiDialog from '../src/components/UiDialog.vue';
import UiInput from '../src/components/UiInput.vue';
import UiLabel from '../src/components/UiLabel.vue';
import UiSelect from '../src/components/UiSelect.vue';
import UiTextarea from '../src/components/UiTextarea.vue';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

describe('UiButton', () => {
  it('renders its slot and uses the primary tokens by default', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Save' } });
    expect(wrapper.text()).toBe('Save');
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.attributes('type')).toBe('button');
  });

  it('emits click, and does nothing when disabled or loading', async () => {
    const wrapper = mount(UiButton, { slots: { default: 'Go' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    const loading = mount(UiButton, { props: { loading: true }, slots: { default: 'Go' } });
    expect(loading.attributes('disabled')).toBeDefined();
    expect(loading.attributes('aria-busy')).toBe('true');
  });

  it('maps each variant to semantic classes only', () => {
    expect(mount(UiButton, { props: { variant: 'danger' } }).classes()).toContain('bg-danger');
    expect(mount(UiButton, { props: { variant: 'secondary' } }).classes()).toContain('bg-surface-muted');
    expect(mount(UiButton, { props: { variant: 'ghost' } }).classes()).toContain('text-foreground-muted');
  });

  it('lets a caller class override a conflicting utility', () => {
    const wrapper = mount(UiButton, { props: { class: 'px-8' } });
    expect(wrapper.classes()).toContain('px-8');
    expect(wrapper.classes()).not.toContain('px-3');
  });
});

describe('form primitives', () => {
  it('UiInput emits the typed value and passes attributes through', async () => {
    const wrapper = mount(UiInput, { props: { modelValue: '' }, attrs: { placeholder: 'Name', id: 'name' } });
    const input = wrapper.get('input');
    expect(input.attributes('placeholder')).toBe('Name');
    await input.setValue('Ada');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Ada']);
  });

  it('UiTextarea emits the typed value', async () => {
    const wrapper = mount(UiTextarea, { props: { modelValue: '' } });
    await wrapper.get('textarea').setValue('hello');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hello']);
  });

  it('UiSelect emits the chosen option', async () => {
    const wrapper = mount(UiSelect, { props: { modelValue: 'a' }, slots: { default: '<option value="a">A</option><option value="b">B</option>' } });
    await wrapper.get('select').setValue('b');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['b']);
  });

  it('UiLabel follows a changing `for` prop', async () => {
    const wrapper = mount(UiLabel, { props: { for: 'one' }, slots: { default: 'Name' } });
    expect(wrapper.get('label').attributes('for')).toBe('one');
    await wrapper.setProps({ for: 'two' });
    expect(wrapper.get('label').attributes('for')).toBe('two');
  });
});

describe('display primitives', () => {
  it('UiCard renders its slot inside a token-styled surface', () => {
    const wrapper = mount(UiCard, { slots: { default: 'Body' } });
    expect(wrapper.text()).toBe('Body');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-surface', 'border-border']));
  });

  it.each([
    ['neutral', 'bg-neutral-soft'],
    ['success', 'bg-success-soft'],
    ['warning', 'bg-warning-soft'],
    ['danger', 'bg-danger-soft'],
  ] as const)('UiBadge %s uses %s', (tone, cls) => {
    expect(mount(UiBadge, { props: { tone }, slots: { default: 'x' } }).classes()).toContain(cls);
  });
});

describe('UiDialog', () => {
  it('opens, shows its title, and localises the close button', async () => {
    const wrapper = mountWithI18n(UiDialog, {
      props: { modelValue: true },
      slots: { title: 'Confirm', default: 'Are you sure?' },
      attachTo: document.body,
    }, 'en');
    await nextTick();
    expect(document.body.textContent).toContain('Confirm');
    expect(document.body.textContent).toContain('Are you sure?');
    expect(document.body.querySelector('[aria-label="Close dialog"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('uses the Thai label when the locale is th', async () => {
    const wrapper = mountWithI18n(UiDialog, {
      props: { modelValue: true },
      slots: { title: 'ยืนยัน', default: 'แน่ใจหรือไม่' },
      attachTo: document.body,
    }, 'th');
    await nextTick();
    expect(document.body.querySelector('[aria-label="ปิดหน้าต่าง"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('emits update:modelValue=false when the close button is clicked', async () => {
    const wrapper = mountWithI18n(UiDialog, {
      props: { modelValue: true },
      slots: { title: 'T', default: 'B' },
      attachTo: document.body,
    }, 'en');
    await nextTick();
    (document.body.querySelector('[aria-label="Close dialog"]') as HTMLElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});
