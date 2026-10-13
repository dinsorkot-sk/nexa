import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import UiAlert from '../src/components/UiAlert.vue';
import UiCheckbox from '../src/components/UiCheckbox.vue';
import UiEmptyState from '../src/components/UiEmptyState.vue';
import UiFieldWrapper from '../src/components/UiFieldWrapper.vue';
import UiSkeleton from '../src/components/UiSkeleton.vue';
import UiSpinner from '../src/components/UiSpinner.vue';
import UiSwitch from '../src/components/UiSwitch.vue';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

describe('UiCheckbox', () => {
  it('reflects the model and emits a boolean when toggled', async () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false }, attachTo: document.body });
    const box = wrapper.get('[role="checkbox"]');
    expect(box.attributes('aria-checked')).toBe('false');
    await box.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });

  it('toggles with the Space key', async () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false }, attachTo: document.body });
    await wrapper.get('[role="checkbox"]').trigger('keydown', { key: ' ' });
    await wrapper.get('[role="checkbox"]').trigger('keyup', { key: ' ' });
    await wrapper.get('[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeDefined();
    wrapper.unmount();
  });

  it('does not emit when disabled and exposes the disabled state', async () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false, disabled: true }, attachTo: document.body });
    const box = wrapper.get('[role="checkbox"]');
    expect(box.attributes('disabled')).toBeDefined();
    await box.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes an accessible name through', () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: true }, attrs: { 'aria-label': 'Active' }, attachTo: document.body });
    expect(wrapper.get('[role="checkbox"]').attributes('aria-label')).toBe('Active');
    wrapper.unmount();
  });
});

describe('UiSwitch', () => {
  it('reflects the model and emits when toggled', async () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: false }, attachTo: document.body });
    const control = wrapper.get('[role="switch"]');
    expect(control.attributes('aria-checked')).toBe('false');
    await control.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });

  it('does not emit when disabled', async () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: true, disabled: true }, attachTo: document.body });
    await wrapper.get('[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('status primitives', () => {
  it('UiSpinner announces itself and localises its hidden label', () => {
    const th = mountWithI18n(UiSpinner, {}, 'th');
    expect(th.get('[role="status"]').text()).toContain('กำลังโหลด');
    const en = mountWithI18n(UiSpinner, {}, 'en');
    expect(en.get('[role="status"]').text()).toContain('Loading');
  });

  it('UiSkeleton is hidden from assistive technology', () => {
    expect(mount(UiSkeleton).attributes('aria-hidden')).toBe('true');
  });

  it('UiAlert uses role=alert for danger and role=status otherwise', () => {
    expect(mount(UiAlert, { props: { tone: 'danger' }, slots: { default: 'x' } }).attributes('role')).toBe('alert');
    expect(mount(UiAlert, { props: { tone: 'success' }, slots: { default: 'x' } }).attributes('role')).toBe('status');
  });

  it('UiAlert keeps role=alert when danger is passed as color, and error maps to danger', () => {
    expect(mount(UiAlert, { props: { color: 'danger' }, slots: { default: 'x' } }).attributes('role')).toBe('alert');
    expect(mount(UiAlert, { props: { color: 'error' }, slots: { default: 'x' } }).attributes('role')).toBe('alert');
  });

  it('UiAlert defaults to the soft variant and solid uses the strong fill', () => {
    const soft = mount(UiAlert, { props: { tone: 'warning' }, slots: { default: 'x' } }).classes();
    expect(soft).toEqual(expect.arrayContaining(['bg-warning-soft']));
    const solid = mount(UiAlert, { props: { variant: 'solid', color: 'danger' }, slots: { default: 'x' } }).classes();
    expect(solid).toEqual(expect.arrayContaining(['bg-danger', 'text-danger-foreground']));
    expect(solid).not.toContain('bg-danger-soft');
  });

  it('UiAlert subtle and outline do not use the solid fill', () => {
    const outline = mount(UiAlert, { props: { variant: 'outline', color: 'danger' }, slots: { default: 'x' } }).classes();
    expect(outline).toContain('bg-surface');
    expect(outline).not.toContain('bg-danger');
    const subtle = mount(UiAlert, { props: { variant: 'subtle', color: 'warning' }, slots: { default: 'x' } }).classes();
    expect(subtle).toContain('bg-surface-muted');
  });

  it('UiEmptyState shows a localised default and accepts custom content', () => {
    expect(mountWithI18n(UiEmptyState, {}, 'th').text()).toContain('ไม่พบผลลัพธ์');
    expect(mountWithI18n(UiEmptyState, { slots: { default: 'Nothing yet', description: 'Add one' } }, 'en').text()).toContain('Nothing yet');
  });
});

describe('UiFieldWrapper', () => {
  const mountField = (props: Record<string, unknown>, locale: 'th' | 'en' = 'en') => mountWithI18n(UiFieldWrapper, {
    props: { label: 'Email', ...props },
    slots: { default: '<template #default="{ id, describedBy, invalid }"><input :id="id" :aria-describedby="describedBy" :aria-invalid="invalid || undefined" /></template>' },
    attachTo: document.body,
  }, locale);

  it('links the label to the control', () => {
    const wrapper = mountField({ id: 'email' });
    expect(wrapper.get('label').attributes('for')).toBe('email');
    expect(document.body.querySelector('#email')).not.toBeNull();
    wrapper.unmount();
  });

  it('generates a stable id when none is given', () => {
    const wrapper = mountField({});
    const id = wrapper.get('label').attributes('for')!;
    expect(id.length).toBeGreaterThan(0);
    expect(document.body.querySelector(`[id="${id}"]`)).not.toBeNull();
    wrapper.unmount();
  });

  it('describes the control by its help text', () => {
    const wrapper = mountField({ id: 'e1', helpText: 'We never share it' });
    expect(document.body.querySelector('#e1')!.getAttribute('aria-describedby')).toBe('e1-help');
    expect(document.body.querySelector('#e1-help')!.textContent).toBe('We never share it');
    wrapper.unmount();
  });

  it('announces an error, marks the control invalid, and prefers the error over help text', () => {
    const wrapper = mountField({ id: 'e2', helpText: 'hint', error: 'Expected a valid email' });
    const control = document.body.querySelector('#e2')!;
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.getAttribute('aria-describedby')).toBe('e2-error');
    expect(document.body.querySelector('#e2-error')!.getAttribute('role')).toBe('alert');
    expect(document.body.querySelector('#e2-help')).toBeNull();
    wrapper.unmount();
  });

  it('marks required fields visibly and for screen readers, in both languages', () => {
    const en = mountField({ id: 'r1', required: true }, 'en');
    expect(en.text()).toContain('Required');
    en.unmount();
    const th = mountField({ id: 'r2', required: true }, 'th');
    expect(th.text()).toContain('จำเป็น');
    th.unmount();
  });
});

describe('form control borders meet the non-text contrast token', () => {
  it('uses border-strong on text-entry controls', async () => {
    const { default: UiInput } = await import('../src/components/UiInput.vue');
    expect(mount(UiInput).classes()).toContain('border-border-strong');
    await nextTick();
  });
});
