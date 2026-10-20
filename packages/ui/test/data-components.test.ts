import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import NxAccordion from '../src/components/NxAccordion.vue';
import NxBarChart from '../src/components/NxBarChart.vue';
import NxCalendarView from '../src/components/NxCalendarView.vue';
import NxCommandPalette from '../src/components/NxCommandPalette.vue';
import NxFileUpload from '../src/components/NxFileUpload.vue';
import NxLink from '../src/components/NxLink.vue';
import NxMenu from '../src/components/NxMenu.vue';
import NxPagination from '../src/components/NxPagination.vue';
import NxPermissionsTable from '../src/components/NxPermissionsTable.vue';
import NxProgress from '../src/components/NxProgress.vue';
import NxTable from '../src/components/NxTable.vue';

afterEach(() => { document.body.innerHTML = ''; });

describe('NxTable', () => {
  it('renders data, supports custom cells, and emits sort changes', async () => {
    const wrapper = mount(NxTable, {
      props: {
        columns: [{ key: 'name', label: 'Name', sortable: true }],
        rows: [{ id: 'a', name: 'Ada' }],
        rowKey: 'id',
      },
      slots: { 'cell-name': ({ value }: { value: unknown }) => h('strong', String(value)) },
    });
    expect(wrapper.find('tbody strong').text()).toBe('Ada');
    await wrapper.find('thead button').trigger('click');
    expect(wrapper.emitted('update:sort')?.at(-1)).toEqual([{ key: 'name', direction: 'asc' }]);
  });

  it('shows the empty state when there are no rows', () => {
    const wrapper = mount(NxTable, {
      props: { columns: [{ key: 'name', label: 'Name' }], rows: [] },
    });
    expect(wrapper.text()).toContain('No results');
  });
});

describe('NxPagination and NxProgress', () => {
  it('does not move past the final page', async () => {
    const wrapper = mount(NxPagination, { props: { modelValue: 2, pageSize: 10, total: 20 } });
    expect(wrapper.text()).toContain('Showing 11-20 of 20');
    await wrapper.find('button[aria-label="Next page"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('shows a page button per page and emits the page that was clicked', async () => {
    const wrapper = mount(NxPagination, { props: { modelValue: 1, pageSize: 10, total: 50, size: 'sm' } });
    const buttons = wrapper.findAll('button[aria-label^="Page "]');
    expect(buttons).toHaveLength(5);
    expect(buttons[0].classes()).toContain('bg-ui-primary');
    expect(buttons[0].classes()).toContain('size-7');
    await buttons[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]);
  });

  it('collapses a long page list into an ellipsis', () => {
    const wrapper = mount(NxPagination, { props: { modelValue: 6, pageSize: 10, total: 120 } });
    expect(wrapper.text()).toContain('…');
    expect(wrapper.find('button[aria-current="page"]').text()).toBe('6');
  });

  it('clamps progress to the declared range', () => {
    const wrapper = mount(NxProgress, { props: { value: 150, max: 100, label: 'Import' } });
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
    // The bar grows by a transform, so a full bar sits at a zero offset.
    expect(wrapper.find('[role="progressbar"] > div').attributes('style')).toMatch(/translateX\(-?0%\)/);
  });
});

describe('data and builder controls', () => {
  it('selects a calendar day and emits its ISO date', async () => {
    const wrapper = mount(NxCalendarView, {
      props: { month: '2026-10', label: 'Calendar' },
    });
    await wrapper.find('button[aria-label="2026-10-17"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-10-17']);
  });

  it('emits permission matrix changes immutably', async () => {
    const wrapper = mount(NxPermissionsTable, {
      props: {
        roles: [{ id: 'admin', label: 'Admin' }],
        permissions: [{ id: 'read', label: 'Read' }],
        modelValue: { admin: { read: false } },
        label: 'Permissions',
      },
    });
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ admin: { read: true } }]);
  });

  it('keeps chart data accessible to assistive technology', () => {
    const wrapper = mount(NxBarChart, {
      props: { labels: ['Oct'], series: [{ label: 'Records', values: [20] }], label: 'Records by month' },
    });
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('Records by month');
    expect(wrapper.find('.bg-ui-primary').attributes('style')).toContain('100%');
  });
});

describe('content and action components', () => {
  it('opens an accordion item and exposes its content', async () => {
    const wrapper = mount(NxAccordion, {
      props: { items: [{ value: 'details', title: 'Details', content: 'Record information' }] },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Record information');
  });

  it('emits the chosen menu action and closes the menu', async () => {
    const wrapper = mount(NxMenu, {
      props: { label: 'Actions', items: [{ value: 'export', label: 'Export' }] },
    });
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click');
    await wrapper.find('[role="menuitem"]').trigger('click');
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['export']);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it('emits selected files without uploading them', async () => {
    const wrapper = mount(NxFileUpload, { props: { label: 'Choose a file' } });
    const file = new File(['example'], 'example.csv', { type: 'text/csv' });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] as unknown as FileList });
    await input.trigger('change');
    expect(wrapper.emitted('select')?.at(-1)).toEqual([[file]]);
  });

  it('does not render an unsafe link as a link', () => {
    const wrapper = mount(NxLink, { props: { href: 'javascript:alert(1)' }, slots: { default: 'Open' } });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.attributes('aria-disabled')).toBe('true');
  });
});

describe('NxCommandPalette', () => {
  it('filters commands and selects the highlighted command by keyboard', async () => {
    const wrapper = mount(NxCommandPalette, {
      attachTo: document.body,
      props: {
        open: true,
        label: 'Commands',
        commands: [
          { id: 'home', label: 'Go home' },
          { id: 'settings', label: 'Open settings' },
        ],
      },
    });
    await flushPromises();
    const input = document.body.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error('Command palette search input was not teleported to the document');
    input.value = 'settings';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.emitted('select')?.at(-1)?.[0]).toMatchObject({ id: 'settings' });
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('finds a command by a partial or misspelled term', async () => {
    const wrapper = mount(NxCommandPalette, {
      attachTo: document.body,
      props: {
        open: true,
        label: 'Commands',
        commands: [
          { id: 'home', label: 'Go home' },
          { id: 'settings', label: 'Open settings' },
        ],
      },
    });
    await flushPromises();
    const input = document.body.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error('Command palette search input was not teleported to the document');
    input.value = 'setings';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    const options = document.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Open settings');
    wrapper.unmount();
  });
});
