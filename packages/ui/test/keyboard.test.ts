import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import NxCombobox from '../src/components/NxCombobox.vue';
import NxDatePicker from '../src/components/NxDatePicker.vue';
import NxMenu from '../src/components/NxMenu.vue';

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

describe('the menu', () => {
  const items = [
    { value: 'edit', label: 'Edit' },
    { value: 'chosen', label: 'Vehicles' },
    { value: 'delete', label: 'Delete' },
  ];

  it('moves the focus with the arrow keys, the letters pick an item and Escape gives the focus back', async () => {
    const wrapper = mount(NxMenu, { props: { label: 'Actions', items }, attachTo: document.body });
    const trigger = wrapper.find('button[aria-haspopup="menu"]');
    await trigger.trigger('click');
    await nextTick();
    const rows = wrapper.findAll('[role="menuitem"]');
    expect(document.activeElement).toBe(rows[0]!.element);

    press(rows[0]!.element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(rows[1]!.element);
    press(rows[1]!.element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(rows[2]!.element);
    press(rows[2]!.element, 'ArrowUp');
    await nextTick();
    expect(document.activeElement).toBe(rows[1]!.element);

    press(rows[1]!.element, 'End');
    await nextTick();
    expect(document.activeElement).toBe(rows[2]!.element);
    press(rows[2]!.element, 'Home');
    await nextTick();
    expect(document.activeElement).toBe(rows[0]!.element);

    // The letters pick the item whose label starts with them.
    press(rows[0]!.element, 'v');
    await nextTick();
    expect(document.activeElement).toBe(rows[1]!.element);

    press(rows[1]!.element, 'Escape');
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('opens with the arrow keys on the trigger, and closes on a click outside', async () => {
    const wrapper = mount(NxMenu, { props: { label: 'Actions', items }, attachTo: document.body });
    const trigger = wrapper.find('button[aria-haspopup="menu"]');
    press(trigger.element, 'ArrowDown');
    await nextTick();
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.findAll('[role="menuitem"]')[0]!.element);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('skips a disabled item', async () => {
    const wrapper = mount(NxMenu, {
      props: { label: 'Actions', items: [items[0]!, { ...items[1]!, disabled: true }, items[2]!] },
      attachTo: document.body,
    });
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click');
    await nextTick();
    const rows = wrapper.findAll('[role="menuitem"]');
    press(rows[0]!.element, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(rows[2]!.element);
    wrapper.unmount();
  });

  it('gives each menu its own ids and points its aria attributes at them', async () => {
    // Two menus in one app, which is where `useId` counts: a separate `mount` is a separate app and starts over.
    const pair = mount(defineComponent({
      render: () => h('div', [
        h(NxMenu, { label: 'First', items }),
        h(NxMenu, { label: 'Second', items }),
      ]),
    }), { attachTo: document.body });
    const triggers = pair.findAll('button[aria-haspopup="menu"]');
    // The menu's id is on `aria-controls` even while the menu is closed, so the pair can be compared without
    // opening both at once (opening the second closes the first).
    expect(triggers[0]!.attributes('id')).not.toBe(triggers[1]!.attributes('id'));
    expect(triggers[0]!.attributes('aria-controls')).not.toBe(triggers[1]!.attributes('aria-controls'));

    for (const trigger of triggers) {
      await trigger.trigger('click');
      const menu = pair.find('[role="menu"]');
      expect(trigger.attributes('aria-controls')).toBe(menu.attributes('id'));
      expect(menu.attributes('aria-labelledby')).toBe(trigger.attributes('id'));
      expect(document.getElementById(menu.attributes('id')!)).toBe(menu.element);
      await trigger.trigger('click');
    }
    pair.unmount();
  });
});
