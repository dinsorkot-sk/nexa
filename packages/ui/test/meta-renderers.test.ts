import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { FieldDefinition, FormDefinition, ViewDefinition } from '@nexa/meta';
import NxMetaCalendar from '../src/components/NxMetaCalendar.vue';
import NxMetaDetail from '../src/components/NxMetaDetail.vue';
import NxMetaForm from '../src/components/NxMetaForm.vue';
import NxMetaGallery from '../src/components/NxMetaGallery.vue';
import NxMetaKanban from '../src/components/NxMetaKanban.vue';
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

describe('NxMetaDetail shows a record', () => {
  const record = { id: 'v1', data: { plate: 'AB-1234', odometer: 42150 } };

  it('shows the value of every field beside the record', () => {
    const wrapper = mount(NxMetaDetail, { props: { record, fields } });
    expect(wrapper.findAll('dt').map((dt) => dt.text())).toEqual(['Plate', 'Odometer', 'Secret']);
    expect(wrapper.text()).toContain('AB-1234');
    // The odometer is a number, so it is formatted rather than shown raw.
    expect(wrapper.text()).toContain('42,150');
  });

  it('lists what each relation links to and opens one', async () => {
    const wrapper = mount(NxMetaDetail, {
      props: {
        record,
        fields,
        relations: [{ id: 'owner', name: 'Owner', targets: [{ id: 'u1', label: 'Ada Lovelace' }] }],
      },
    });
    expect(wrapper.text()).toContain('Owner');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['u1']);
  });

  it('says when a relation links to nothing', () => {
    const wrapper = mount(NxMetaDetail, {
      props: { record, fields, relations: [{ id: 'owner', name: 'Owner', targets: [] }] },
    });
    expect(wrapper.text()).toContain('No linked records');
  });

  it('shows the activity trail', () => {
    const wrapper = mount(NxMetaDetail, {
      props: {
        record,
        fields,
        activity: [{ id: 'a1', actor: 'Ada', action: 'created', time: '2 hours ago' }],
      },
    });
    expect(wrapper.text()).toContain('Ada');
    expect(wrapper.text()).toContain('created');
  });
});

describe('NxMetaKanban places the records in columns', () => {
  const statusField: FieldDefinition = {
    id: 'status', entityId: 'vehicle', name: 'status', label: 'Status', type: 'select', position: 3,
    options: { ...options, choices: [{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }] },
  };
  const boardFields = [...fields, statusField];
  const board: ViewDefinition = {
    id: 'board', moduleId: 'fleet', entityId: 'vehicle', name: 'Board', type: 'kanban', isDefault: false,
    columns: [{ fieldId: 'plate', visible: true }, { fieldId: 'odometer', visible: true }],
    sort: [], filters: {}, settings: {},
    groupBy: 'status',
    titleField: 'plate',
  };
  const boardRecords = [
    { id: 'v1', data: { plate: 'AB-1', odometer: 10, status: 'active' } },
    { id: 'v2', data: { plate: 'AB-2', odometer: 20, status: 'closed' } },
    { id: 'v3', data: { plate: 'AB-3', odometer: 30, status: 'active' } },
  ];

  it('makes a column for each choice of the field it groups by', () => {
    const wrapper = mount(NxMetaKanban, { props: { view: board, fields: boardFields, records: boardRecords } });
    const headings = wrapper.findAll('section > h3').map((heading) => heading.text());
    expect(headings[0]).toContain('Active');
    expect(headings[1]).toContain('Closed');
  });

  it('puts each record in the column of its group', () => {
    const wrapper = mount(NxMetaKanban, { props: { view: board, fields: boardFields, records: boardRecords } });
    const columns = wrapper.findAll('section');
    expect(columns[0].findAll('article')).toHaveLength(2);
    expect(columns[1].findAll('article')).toHaveLength(1);
    expect(columns[0].text()).toContain('AB-1');
  });

  it('emits the record and the group a card was dropped on', async () => {
    const wrapper = mount(NxMetaKanban, { props: { view: board, fields: boardFields, records: boardRecords } });
    await wrapper.findAll('section')[1].trigger('drop', { dataTransfer: { getData: () => 'v1' } });
    expect(wrapper.emitted('move')?.[0]).toEqual(['v1', 'closed']);
  });

  it('offers the other columns on the card and emits the move when one is picked', async () => {
    const wrapper = mount(NxMetaKanban, {
      props: { view: board, fields: boardFields, records: boardRecords },
      attachTo: document.body,
    });
    const trigger = wrapper.find('button[aria-label="Move AB-1"]');
    expect(trigger.classes()).toContain('size-6');
    await trigger.trigger('click');
    await nextTick();
    const items = wrapper.findAll('[role="menuitem"]');
    // The column the card is already in is not offered.
    expect(items.map((item) => item.text())).toEqual(['Closed']);
    await items[0]!.trigger('click');
    expect(wrapper.emitted('move')?.at(-1)).toEqual(['v1', 'closed']);
    wrapper.unmount();
  });
});

describe('NxMetaCalendar places the records on a month', () => {
  const dueField: FieldDefinition = { id: 'due', entityId: 'vehicle', name: 'due', label: 'Due', type: 'date', position: 4, options };
  const calendarFields = [...fields, dueField];
  const month: ViewDefinition = {
    id: 'calendar', moduleId: 'fleet', entityId: 'vehicle', name: 'Calendar', type: 'calendar', isDefault: false,
    columns: [{ fieldId: 'plate', visible: true }],
    sort: [], filters: {}, settings: {},
    dateField: 'due',
    titleField: 'plate',
  };
  const monthRecords = [
    { id: 'v1', data: { plate: 'AB-1', due: '2026-03-04' } },
    { id: 'v2', data: { plate: 'AB-2', due: '2026-03-04' } },
    { id: 'v3', data: { plate: 'AB-3', due: '2026-03-09' } },
  ];

  it('puts a record on the day its date falls on', () => {
    const wrapper = mount(NxMetaCalendar, { props: { view: month, fields: calendarFields, records: monthRecords, month: '2026-03' } });
    expect(wrapper.text()).toContain('AB-1');
    expect(wrapper.text()).toContain('AB-3');
  });

  it('lists the records of the selected day', () => {
    const wrapper = mount(NxMetaCalendar, {
      props: { view: month, fields: calendarFields, records: monthRecords, month: '2026-03', selectedDate: '2026-03-04' },
    });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('AB-1');
  });

  it('emits the month the caller should show', async () => {
    const wrapper = mount(NxMetaCalendar, { props: { view: month, fields: calendarFields, records: monthRecords, month: '2026-03' } });
    await wrapper.find('button[aria-label="Next month"]').trigger('click');
    expect(wrapper.emitted('update:month')?.[0]).toEqual(['2026-04']);
  });
});

describe('NxMetaGallery shows the records as cards', () => {
  const photoField: FieldDefinition = { id: 'photo', entityId: 'vehicle', name: 'photo', label: 'Photo', type: 'image', position: 5, options };
  const galleryFields = [...fields, photoField];
  const gallery: ViewDefinition = {
    id: 'gallery', moduleId: 'fleet', entityId: 'vehicle', name: 'Gallery', type: 'gallery', isDefault: false,
    columns: [{ fieldId: 'plate', visible: true }, { fieldId: 'odometer', visible: true }],
    sort: [], filters: {}, settings: {},
    imageField: 'photo',
    titleField: 'plate',
  };

  it('shows the picture of a record and its title', () => {
    const wrapper = mount(NxMetaGallery, {
      props: { view: gallery, fields: galleryFields, records: [{ id: 'v1', data: { plate: 'AB-1', odometer: 10, photo: 'https://example.com/a.png' } }] },
    });
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/a.png');
    expect(wrapper.text()).toContain('AB-1');
  });

  it('refuses a stored value that is not a safe link', () => {
    const wrapper = mount(NxMetaGallery, {
      props: { view: gallery, fields: galleryFields, records: [{ id: 'v1', data: { plate: 'AB-1', photo: 'javascript:alert(1)' } }] },
    });
    expect(wrapper.find('img').exists()).toBe(false);
  });
});
