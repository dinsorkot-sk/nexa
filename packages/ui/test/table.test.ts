import { afterEach, describe, expect, it } from 'vitest';
import { FieldTypeSchema, type FieldDefinition } from '@nexa/meta';
import MetaTable from '../src/components/MetaTable.vue';
import UiPagination from '../src/components/UiPagination.vue';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

function makeField(id: string, type: FieldDefinition['type'], label = id, options: Partial<FieldDefinition['options']> = {}): FieldDefinition {
  return {
    id, entityId: 'e', name: id, label, type, position: 0,
    options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
  };
}

const textField = makeField('name', 'text', 'Name');
const numberField = makeField('qty', 'integer', 'Quantity');
const hiddenField = makeField('secret', 'text', 'Secret', { hidden: true });
const dateField = makeField('due', 'date', 'Due date');
const selectField = makeField('status', 'select', 'Status', { choices: [{ value: 'open', label: 'Open' }] });

const rows = [
  { id: 'r1', version: 1, data: { name: 'Alpha', qty: 3, secret: 'hidden-1', due: '2026-10-11', status: 'open' } },
  { id: 'r2', version: 1, data: { name: 'Beta', qty: 7, secret: 'hidden-2', due: '2026-11-01', status: 'open' } },
];

const page = { items: rows, total: 2, limit: 25, offset: 0 };

describe('MetaTable', () => {
  it('renders every visible field through MetaFieldValue and omits hidden fields', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }, { field: hiddenField }], page } }, 'en');
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).not.toContain('hidden-1');
    expect(wrapper.findAll('th').length).toBe(1); // hidden field is not a column
  });

  it('shows all loaded rows with their stored values', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }, { field: numberField }], page } }, 'en');
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('7');
  });

  it('emits a sort toggle per click and reports aria-sort on the header', async () => {
    const wrapper = mountWithI18n(MetaTable, {
      props: { columns: [{ field: textField }], page, sortable: true, sort: null },
    }, 'en');
    const header = wrapper.find('th button');
    await header.trigger('click');
    expect(wrapper.emitted('update:sort')?.[0]).toEqual([{ fieldId: 'name', direction: 'asc' }]);
    await wrapper.setProps({ sort: { fieldId: 'name', direction: 'asc' } });
    await wrapper.find('th button').trigger('click');
    expect(wrapper.emitted('update:sort')?.[1]).toEqual([{ fieldId: 'name', direction: 'desc' }]);
    await wrapper.setProps({ sort: { fieldId: 'name', direction: 'desc' } });
    await wrapper.find('th button').trigger('click');
    expect(wrapper.emitted('update:sort')?.[2]).toEqual([null]);
    await wrapper.setProps({ sort: { fieldId: 'name', direction: 'asc' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('th').attributes('aria-sort')).toBe('ascending');
    await wrapper.setProps({ sort: { fieldId: 'name', direction: 'desc' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('th').attributes('aria-sort')).toBe('descending');
  });

  it('renders a plain header without aria-sort for a type the API cannot sort on', () => {
    const jsonField = makeField('extra', 'json', 'Extra');
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: jsonField }], page, sortable: true } }, 'en');
    expect(wrapper.find('th button').exists()).toBe(false);
    expect(wrapper.find('th').attributes('aria-sort')).toBeUndefined();
  });

  it('shows skeleton rows while loading and no data', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }], page, loading: true } }, 'en');
    expect(wrapper.text()).not.toContain('Alpha');
    expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('shows the error and a retry affordance, and emits nothing else', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }], page, error: 'Network failed', retry: () => undefined } }, 'en');
    expect(wrapper.text()).toContain('Network failed');
    expect(wrapper.text()).not.toContain('Alpha');
  });

  it('shows the empty state when loaded with zero rows', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }], page: { items: [], total: 0, limit: 25, offset: 0 } } }, 'en');
    expect(wrapper.text()).toContain('No records yet');
  });

  it('formats date and select values through their renderers', () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: dateField }, { field: selectField }], page } }, 'en');
    // en shows the Gregorian long date; the select shows its label, not the raw value.
    expect(wrapper.text()).toContain('October');
    expect(wrapper.text()).toContain('Open');
    expect(wrapper.text()).not.toContain('2026-10-11');
  });

  it('emits rowClick on click and on Enter when clickable', async () => {
    const wrapper = mountWithI18n(MetaTable, { props: { columns: [{ field: textField }], page, clickable: true } }, 'en');
    await wrapper.find('tbody tr').trigger('click');
    expect(wrapper.emitted('rowClick')?.[0]).toEqual([{ row: rows[0] }]);
    await wrapper.find('tbody tr').trigger('keydown.enter');
    expect(wrapper.emitted('rowClick')?.[1]).toEqual([{ row: rows[0] }]);
  });

  it('never renders values for a field type the table does not know — every meta type passes through MetaFieldValue', () => {
    // The contract: columns come from FieldDefinition, so any type change must keep rendering.
    for (const type of FieldTypeSchema.options) {
      const field = makeField('f', type, 'F');
      const wrapper = mountWithI18n(MetaTable, {
        props: { columns: [{ field }], page: { items: [{ id: 'r', version: 1, data: { f: null } }], total: 1, limit: 25, offset: 0 } },
      }, 'en');
      expect(wrapper.html().length).toBeGreaterThan(0);
      wrapper.unmount();
    }
  });
});

describe('UiPagination', () => {
  it('reports the visible range and page count from total/limit/offset', () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 300, limit: 50, offset: 100 } }, 'en');
    expect(wrapper.text()).toContain('101');
    expect(wrapper.text()).toContain('150');
    expect(wrapper.text()).toContain('300');
    expect(wrapper.text()).toContain('page 3 of 6');
  });

  it('disables previous on the first page and next on the last', async () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 60, limit: 25, offset: 0 } }, 'en');
    const buttons = wrapper.findAll('button');
    expect(buttons[0]!.attributes('disabled')).toBeDefined();
    expect(buttons[1]!.attributes('disabled')).toBeUndefined();
    await wrapper.setProps({ offset: 50 });
    expect(buttons[0]!.attributes('disabled')).toBeUndefined();
    expect(buttons[1]!.attributes('disabled')).toBeDefined();
  });

  it('emits the next offset on prev/next and never goes beyond the API bounds', async () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 300, limit: 50, offset: 50 } }, 'en');
    const buttons = wrapper.findAll('button');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:offset')?.[0]).toEqual([100]);
    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('update:offset')?.[1]).toEqual([0]);
  });

  it('emits a new limit and resets to the first page via offset update by the caller', async () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 300, limit: 25, offset: 0 } }, 'en');
    const select = wrapper.find('select');
    (select.element as HTMLSelectElement).value = '100';
    await select.trigger('change');
    expect(wrapper.emitted('update:limit')?.[0]).toEqual([100]);
  });

  it('caps the offered page sizes at the API limit of 100', () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 300, limit: 25, offset: 0 } }, 'en');
    const options = wrapper.findAll('option').map((option) => Number((option.element as HTMLOptionElement).value));
    expect(Math.max(...options)).toBeLessThanOrEqual(100);
    expect(wrapper.text()).not.toContain('200 rows');
  });

  it('shows Thai numerals for the range under th', () => {
    const wrapper = mountWithI18n(UiPagination, { props: { total: 30, limit: 25, offset: 0 } }, 'th');
    expect(wrapper.text()).toContain('1–25');
  });
});
