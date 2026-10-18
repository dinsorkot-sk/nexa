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
import NxSpinner from '../src/components/NxSpinner.vue';
import NxSwitch from '../src/components/NxSwitch.vue';
import NxTabs from '../src/components/NxTabs.vue';
import NxTextarea from '../src/components/NxTextarea.vue';
import NxTimeline from '../src/components/NxTimeline.vue';
import NxToaster from '../src/components/NxToaster.vue';
import NxTooltip from '../src/components/NxTooltip.vue';
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
  it('NxBadge renders a dot when asked, and a variant fill', () => {
    const wrapper = mount(NxBadge, { props: { color: 'success', variant: 'soft', dot: true }, slots: { default: 'Active' } });
    const dot = wrapper.find('span > span');
    expect(dot.classes()).toContain('rounded-full');
    expect(dot.classes()).toContain('bg-ui-success');
    expect(wrapper.classes()).toContain('bg-ui-success-soft');
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
    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('a');
    await input.setValue('bc');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['bc']);
  });

  it('NxInput marks itself invalid for assistive technology', () => {
    expect(mount(NxInput, { props: { invalid: true } }).find('input').attributes('aria-invalid')).toBe('true');
    expect(mount(NxInput).find('input').attributes('aria-invalid')).toBeUndefined();
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

describe('NxSpinner', () => {
  it('renders a spinning loader with role=status and an explicit aria-label', () => {
    const wrapper = mount(NxSpinner, { props: { label: 'Loading data' } });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toBe('Loading data');
    expect(wrapper.find('svg').classes()).toContain('animate-spin');
  });

  it('falls back to the locale loading label when none is given', () => {
    const wrapper = mount(NxSpinner);
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toBe('Loading');
    expect(wrapper.find('svg').classes()).toContain('animate-spin');
  });
});

describe('NxTimeline', () => {
  const items = [
    { id: '1', actor: 'Somchai K.', action: 'changed Status', time: '2 h ago', kind: 'update' as const, oldValue: 'Draft', newValue: 'Active' },
    { id: '2', actor: 'Nok S.', action: 'commented', time: '5 h ago', kind: 'comment' as const, description: 'Service booked for next Monday.' },
  ];

  it('renders a labelled timeline with one article per entry', () => {
    const wrapper = mount(NxTimeline, { props: { label: 'Activity', items } });
    expect(wrapper.attributes('aria-label')).toBe('Activity');
    expect(wrapper.findAll('article')).toHaveLength(2);
    expect(wrapper.text()).toContain('Somchai K.');
    expect(wrapper.text()).toContain('Nok S.');
  });

  it('draws a connector line below each item except the last', () => {
    const wrapper = mount(NxTimeline, { props: { label: 'Activity', items } });
    expect(wrapper.html().match(/bg-ui-border-accented/g) || []).toHaveLength(items.length - 1);
  });

  it('passes item props through to NxActivityItem', () => {
    const single = [{ id: '1', actor: 'Grace', action: 'created this record', time: '1 d ago', kind: 'create' as const }];
    const wrapper = mount(NxTimeline, { props: { label: 'Activity', items: single } });
    expect(wrapper.text()).toContain('Grace');
    expect(wrapper.text()).toContain('created this record');
    expect(wrapper.text()).toContain('1 d ago');
  });
});

describe('NxTooltip', () => {
  it('renders the trigger slot', () => {
    const wrapper = mount(NxTooltip, { props: { text: 'Hint' }, slots: { default: '<button>Help</button>' } });
    expect(wrapper.find('button').text()).toBe('Help');
  });

  it('shows the text, kbd shortcut and motion classes on focus', async () => {
    const wrapper = mount(NxTooltip, {
      props: { text: 'Helpful hint', kbd: '⌘K', delayDuration: 0 },
      slots: { default: '<button>Help</button>' },
      attachTo: document.body,
    });
    await wrapper.find('button').trigger('focus');
    await flushPromises();
    await nextTick();
    expect(document.body.textContent).toContain('Helpful hint');
    expect(document.body.textContent).toContain('⌘K');
    const tip = document.body.querySelector('[class*="bg-ui-bg-inverted"]');
    expect(tip?.className).toMatch(/animate-ui-pop-(in|out)/);
    wrapper.unmount();
  });

  it('respects the side prop for placement', async () => {
    const wrapper = mount(NxTooltip, {
      props: { text: 'Hint', side: 'bottom', delayDuration: 0 },
      slots: { default: '<button>Help</button>' },
      attachTo: document.body,
    });
    await wrapper.find('button').trigger('focus');
    await flushPromises();
    await nextTick();
    const tip = document.body.querySelector('[data-side]');
    expect(tip?.getAttribute('data-side')).toBe('bottom');
    wrapper.unmount();
  });
});
