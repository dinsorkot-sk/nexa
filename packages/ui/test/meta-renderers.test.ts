import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { FieldDefinition, FormDefinition, ViewDefinition } from '@nexa/meta';
import NxMetaForm from '../src/components/NxMetaForm.vue';
import NxMetaTable from '../src/components/NxMetaTable.vue';

const options = { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} };

const fields: FieldDefinition[] = [
  { id: 'plate', entityId: 'vehicle', name: 'plate', label: 'Plate', type: 'text', position: 0, options },
  { id: 'odometer', entityId: 'vehicle', name: 'odometer', label: 'Odometer', type: 'integer', position: 1, options },
  { id: 'secret', entityId: 'vehicle', name: 'secret', label: 'Secret', type: 'text', position: 2, options },
];

const view: ViewDefinition = {
  id: 'vehicles', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicles', type: 'table', isDefault: true,
  columns: [
    { fieldId: 'plate', visible: true },
    { fieldId: 'odometer', visible: true, width: 120 },
    { fieldId: 'secret', visible: false },
  ],
  sort: [{ fieldId: 'plate', direction: 'asc' }],
  filters: {}, settings: {},
};

const form: FormDefinition = {
  id: 'vehicle-form', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicle form',
  sections: [
    { id: 'main', label: 'Main', fieldIds: ['plate', 'odometer'], columns: 2, visibility: {} },
    { id: 'more', label: 'More', fieldIds: ['secret'], columns: 1, visibility: {} },
  ],
  settings: {},
};

describe('NxMetaTable renders a view over a page of records', () => {
  it('shows the visible columns of the view, in the order the view gives them', () => {
    const wrapper = mount(NxMetaTable, {
      props: { view, fields, records: [{ id: 'r1', data: { plate: 'AB-1', odometer: 12, secret: 'hidden' } }] },
    });
    // The column the view sorts by carries the sort mark.
    expect(wrapper.findAll('th').map((header) => header.text())).toEqual(['Plate \u2191', 'Odometer']);
    expect(wrapper.text()).not.toContain('hidden');
  });

  it('formats a cell through the field that owns it', () => {
    const wrapper = mount(NxMetaTable, {
      props: { view, fields, records: [{ id: 'r1', data: { plate: 'AB-1', odometer: 1200 } }] },
    });
    expect(wrapper.text()).toContain('1,200');
  });

  it('emits the sort in the shape the records API takes', async () => {
    const wrapper = mount(NxMetaTable, { props: { view, fields, records: [] } });
    await wrapper.find('th button').trigger('click');
    expect(wrapper.emitted('update:sort')?.[0]).toEqual([[{ fieldId: 'plate', direction: 'desc' }]]);
  });

  it('shows the loading state and the empty state', () => {
    const loading = mount(NxMetaTable, { props: { view, fields, records: [], loading: true } });
    expect(loading.findAll('tbody tr').length).toBeGreaterThan(0);
    const empty = mount(NxMetaTable, { props: { view, fields, records: [] } });
    expect(empty.text()).toContain('No results');
  });

  it('shows the error and offers a retry', async () => {
    const wrapper = mount(NxMetaTable, { props: { view, fields, records: [], error: 'The records could not be loaded' } });
    expect(wrapper.text()).toContain('The records could not be loaded');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('emits the page it wants', async () => {
    const wrapper = mount(NxMetaTable, { props: { view, fields, records: [{ id: 'r1', data: { plate: 'AB-1' } }], total: 100, limit: 20, page: 1 } });
    const next = wrapper.findAll('button').find((button) => button.attributes('aria-label') === 'Next page');
    expect(next).toBeDefined();
    await next!.trigger('click');
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2]);
  });
});

describe('NxMetaForm renders a form over the fields of an entity', () => {
  it('renders the sections in order, each with the fields it names', () => {
    const wrapper = mount(NxMetaForm, { props: { form, fields, values: {} } });
    expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual(['Main', 'More']);
  });

  it('lays a section out in as many columns as the section says', () => {
    const wrapper = mount(NxMetaForm, { props: { form, fields, values: {} } });
    const grids = wrapper.findAll('.grid');
    expect(grids[0]?.attributes('style')).toContain('repeat(2');
    expect(grids[1]?.attributes('style')).toContain('repeat(1,');
  });

  it('does not render a field the form does not place', () => {
    const wrapper = mount(NxMetaForm, { props: { form: { ...form, sections: [{ ...form.sections[0]!, fieldIds: ['plate'] }] }, fields, values: {} } });
    expect(wrapper.text()).toContain('Plate');
    expect(wrapper.text()).not.toContain('Odometer');
  });

  it('emits the values as a field changes and again on submit', async () => {
    const wrapper = mount(NxMetaForm, { props: { form, fields, values: {} } });
    await wrapper.find('input').setValue('AB-9');
    expect(wrapper.emitted('update:values')?.[0]?.[0]).toEqual({ plate: 'AB-9' });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ plate: 'AB-9' });
  });

  it('keeps a field the form cannot edit out of reach', () => {
    const wrapper = mount(NxMetaForm, { props: { form, fields, values: {}, readonlyFieldIds: ['plate'] } });
    const input = wrapper.find('input');
    expect(input.attributes('disabled')).toBeDefined();
  });
});
