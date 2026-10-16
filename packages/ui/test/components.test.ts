import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import NxAlert from '../src/components/NxAlert.vue';
import NxAvatar from '../src/components/NxAvatar.vue';
import NxBadge from '../src/components/NxBadge.vue';
import NxButton from '../src/components/NxButton.vue';
import NxCheckbox from '../src/components/NxCheckbox.vue';
import NxChip from '../src/components/NxChip.vue';
import NxFieldWrapper from '../src/components/NxFieldWrapper.vue';
import NxIconButton from '../src/components/NxIconButton.vue';
import NxInput from '../src/components/NxInput.vue';
import NxModal from '../src/components/NxModal.vue';
import NxRadio from '../src/components/NxRadio.vue';
import NxSegment from '../src/components/NxSegment.vue';
import NxSelect from '../src/components/NxSelect.vue';
import NxSwitch from '../src/components/NxSwitch.vue';
import NxTabs from '../src/components/NxTabs.vue';
import NxTextarea from '../src/components/NxTextarea.vue';
import NxToaster from '../src/components/NxToaster.vue';
import { dismissToast, pushToast, toastQueue } from '../src/lib/toast';
import { Star, X } from 'lucide-vue-next';

afterEach(() => { document.body.innerHTML = ''; });

describe('NxButton', () => {
  it('renders a button of type button by default and emits native clicks', async () => {
    const wrapper = mount(NxButton, { slots: { default: 'Save' } });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    await wrapper.trigger('click');
    expect(wrapper.text()).toBe('Save');
  });

  it('is disabled and marked busy while loading', () => {
    const wrapper = mount(NxButton, { props: { loading: true }, slots: { default: 'Saving' } });
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-busy')).toBe('true');
  });

  it('renders the leading icon', () => {
    const wrapper = mount(NxButton, { props: { icon: Star }, slots: { default: 'Star' } });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });
});

describe('NxIconButton', () => {
  it('uses its label as the accessible name', () => {
    const wrapper = mount(NxIconButton, { props: { icon: X, label: 'Close' } });
    expect(wrapper.attributes('aria-label')).toBe('Close');
    expect(wrapper.attributes('title')).toBe('Close');
  });
});

describe('display components', () => {
  it('NxBadge renders a dot when asked', () => {
    const wrapper = mount(NxBadge, { props: { color: 'success', dot: true }, slots: { default: 'Active' } });
    expect(wrapper.find('span.rounded-full.size-1\\.5').exists()).toBe(true);
    expect(wrapper.text()).toBe('Active');
  });

  it('NxChip exposes a named remove button and emits remove', async () => {
    const wrapper = mount(NxChip, { props: { removable: true, removeLabel: 'Remove Draft' }, slots: { default: 'Draft' } });
    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe('Remove Draft');
    await button.trigger('click');
    expect(wrapper.emitted('remove')).toHaveLength(1);
  });

  it('NxAlert uses role alert for errors and status otherwise', () => {
    expect(mount(NxAlert, { props: { color: 'error', title: 'Conflict' } }).attributes('role')).toBe('alert');
    expect(mount(NxAlert, { props: { color: 'info', title: 'Note' } }).attributes('role')).toBe('status');
  });

  it('NxAvatar shows initials from the name when there is no image', () => {
    expect(mount(NxAvatar, { props: { name: 'ada lovelace' } }).text()).toBe('AL');
    expect(mount(NxAvatar, { props: { name: 'Grace' } }).text()).toBe('G');
  });
});

describe('form controls', () => {
  it('NxInput emits the typed value and reflects modelValue', async () => {
    const wrapper = mount(NxInput, { props: { modelValue: 'a' } });
    expect((wrapper.element as HTMLInputElement).value).toBe('a');
    await wrapper.setValue('bc');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['bc']);
  });

  it('NxInput marks itself invalid for assistive technology', () => {
    expect(mount(NxInput, { props: { invalid: true } }).attributes('aria-invalid')).toBe('true');
    expect(mount(NxInput).attributes('aria-invalid')).toBeUndefined();
  });

  it('NxTextarea emits the typed value', async () => {
    const wrapper = mount(NxTextarea);
    await wrapper.setValue('line one\nline two');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['line one\nline two']);
  });

  it('NxSelect emits the chosen value, and undefined for the placeholder', async () => {
    const wrapper = mount(NxSelect, {
      props: { options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], placeholder: 'Choose' },
      attrs: { 'aria-label': 'Status' },
    });
    expect(wrapper.find('select').attributes('aria-label')).toBe('Status');
    await wrapper.find('select').setValue('b');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b']);
    await wrapper.find('select').setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);
  });

  it('NxCheckbox toggles through Reka and emits a boolean', async () => {
    const wrapper = mount(NxCheckbox, { props: { modelValue: false }, slots: { default: 'Remember' } });
    await wrapper.find('button[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
  });

  it('NxSwitch toggles through Reka and emits a boolean', async () => {
    const wrapper = mount(NxSwitch, { props: { modelValue: false }, slots: { default: 'Notify' } });
    await wrapper.find('button[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
  });

  it('NxRadio emits the chosen option', async () => {
    const wrapper = mount(NxRadio, {
      props: { modelValue: 'a', label: 'Status', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    });
    expect(wrapper.attributes('aria-label')).toBe('Status');
    await wrapper.findAll('button[role="radio"]')[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b']);
  });

  it('NxFieldWrapper links the label, hint and error to the control', () => {
    const wrapper = mount(NxFieldWrapper, {
      props: { id: 'plate', label: 'Plate', hint: 'As printed', error: 'Required', required: true },
      slots: { default: '<input id="plate" aria-describedby="plate-hint plate-error">' },
    });
    expect(wrapper.find('label').attributes('for')).toBe('plate');
    expect(wrapper.find('label').text()).toContain('Plate');
    expect(wrapper.find('[role="alert"]').text()).toBe('Required');
    expect(wrapper.find('#plate-hint').text()).toBe('As printed');
  });

  it('NxFieldWrapper passes describedBy and invalid to the slot', () => {
    const wrapper = mount(NxFieldWrapper, {
      props: { id: 'x', label: 'X', error: 'Bad' },
      slots: { default: '<template #default="p"><span :data-described="p.describedBy" :data-invalid="p.invalid" /></template>' },
    });
    expect(wrapper.html()).toContain('x-error');
  });
});

describe('navigation and overlays', () => {
  it('NxTabs emits the tab the user selects', async () => {
    const wrapper = mount(NxTabs, {
      props: { modelValue: 'a', label: 'Sections', items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      attachTo: document.body,
    });
    await wrapper.findAll('[role="tab"]')[1].trigger('mousedown');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b']);
  });

  it('NxSegment emits the selected view', async () => {
    const wrapper = mount(NxSegment, {
      props: { modelValue: 'table', label: 'View', items: [{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }] },
      attachTo: document.body,
    });
    await wrapper.findAll('button')[1].trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['kanban']);
  });

  it('NxModal renders its title in a portal and closes on Escape', async () => {
    const open = ref(true);
    mount({
      components: { NxModal },
      setup: () => ({ open }),
      template: '<NxModal v-model:open="open" title="Delete vehicle?" description="Cannot be undone">Body</NxModal>',
    }, { attachTo: document.body });
    await flushPromises();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Delete vehicle?');
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(open.value).toBe(false);
  });

  it('NxToaster shows a queued toast and removes it on dismiss', async () => {
    const id = pushToast({ title: 'Record saved', color: 'success', duration: 0 });
    const wrapper = mount(NxToaster, { attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Record saved');
    dismissToast(id);
    await nextTick();
    expect(toastQueue.some((item) => item.id === id)).toBe(false);
    wrapper.unmount();
  });
});
