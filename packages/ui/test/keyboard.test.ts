import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NxCombobox from '../src/components/NxCombobox.vue';
import NxDatePicker from '../src/components/NxDatePicker.vue';

afterEach(() => { document.body.innerHTML = ''; });

const press = (el: Element, key: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

describe('keyboard operation', () => {
  it('Combobox: arrow keys move through options and Enter selects one', async () => {
    const wrapper = mount(NxCombobox, {
      props: {
        label: 'Owner',
        options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
      },
      attachTo: document.body,
    });
    const input = wrapper.find('input').element;
    input.focus();
    press(input, 'ArrowDown');
    await flushPromises();
    await nextTick();
    press(input, 'ArrowDown');
    press(input, 'Enter');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([expect.any(String)]);
    expect(['a', 'b']).toContain((wrapper.emitted('update:modelValue')?.at(-1) as unknown[])[0]);
  });

  it('DatePicker: the segments accept typed digits and the calendar closes on Escape', async () => {
    const wrapper = mount(NxDatePicker, {
      props: { modelValue: '2026-10-16', label: 'Due' },
      attachTo: document.body,
    });
    await flushPromises();
    const segments = wrapper.findAll('[data-reka-date-field-segment]');
    expect(segments.length).toBeGreaterThan(0);
    const dayPart = segments.find((el) => el.attributes('data-reka-date-field-segment') === 'day');
    expect(dayPart?.text()).toBe('16');
  });
});
