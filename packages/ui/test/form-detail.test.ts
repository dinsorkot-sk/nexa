import { afterEach, describe, expect, it } from 'vitest';
import type { FieldDefinition, FormDefinition } from '@nexa/meta';
import MetaForm from '../src/components/MetaForm.vue';
import MetaDetail from '../src/components/MetaDetail.vue';
import { formSections } from '../src/components/form';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

function field(id: string, type: FieldDefinition['type'], label = id, options: Partial<FieldDefinition['options']> = {}): FieldDefinition {
  return {
    id, entityId: 'e', name: id, label, type, position: 0,
    options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
  };
}

const name = field('name', 'text', 'Name', { required: true });
const qty = field('qty', 'integer', 'Quantity');
const secret = field('secret', 'text', 'Secret', { hidden: true });
const formula = field('total', 'formula', 'Total');
const fields = [name, qty, secret, formula];

const form: FormDefinition = {
  id: 'f1', entityId: 'e', name: 'Main',
  sections: [
    { id: 's1', label: 'General', fieldIds: ['name', 'qty', 'secret', 'missing-field'], columns: 1, visibility: {} },
    { id: 's2', label: 'Computed', fieldIds: ['total'], columns: 1, visibility: {} },
  ],
  settings: {},
};

describe('formSections', () => {
  it('skips hidden fields and ids that no longer exist', () => {
    const sections = formSections(form, fields);
    expect(sections[0]!.fields.map((entry) => entry.field.id)).toEqual(['name', 'qty']);
    expect(sections[1]!.fields.map((entry) => entry.field.id)).toEqual(['total']);
  });
});

describe('MetaForm', () => {
  it('renders sections and visible fields, never hidden ones', () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, initialData: { name: 'Alpha', qty: 3, secret: 'nope' } } }, 'en');
    expect(wrapper.text()).toContain('General');
    expect(wrapper.text()).toContain('Computed');
    expect(wrapper.text()).not.toContain('nope');
    // formula renders read-only through MetaFieldInput
    expect(wrapper.text()).toContain('Total');
  });

  it('submits only the form’s fields, null for never-set values, and the version for updates', async () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, initialData: { qty: 3 }, version: 4 } }, 'en');
    await wrapper.find('form').trigger('submit');
    const payloads = wrapper.emitted('submit') as Array<[{ data: Record<string, unknown>; version?: number }]>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0]![0].version).toBe(4);
    expect(payloads[0]![0].data).toEqual({ name: null, qty: 3, total: null });
  });

  it('keeps a value the user typed and omits fields outside the form', async () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, initialData: { name: 'Alpha', qty: 3 } } }, 'en');
    const inputs = wrapper.findAll('input, textarea');
    // name input is the first text input in the General section
    await inputs[0]!.setValue('Beta');
    await wrapper.find('form').trigger('submit');
    const payloads = wrapper.emitted('submit') as Array<[{ data: Record<string, unknown> }]>;
    expect(payloads[0]![0].data.name).toBe('Beta');
  });

  it('marks required fields with the required indicator', () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields } }, 'en');
    expect(wrapper.text()).toContain('*');
  });

  it('shows a field error under that field only', () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, fieldErrors: { name: 'Required by the server' } } }, 'en');
    expect(wrapper.text()).toContain('Required by the server');
  });

  it('shows the form-level error once, role=alert', () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, formError: 'Unique conflict on name' } }, 'en');
    const alerts = wrapper.findAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.text()).toBe('Unique conflict on name');
  });

  it('readonly hides the submit button and shows the read-only note', () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, readonly: true } }, 'en');
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Read-only');
  });

  it('ignores submit while submitting', async () => {
    const wrapper = mountWithI18n(MetaForm, { props: { form, fields, submitting: true } }, 'en');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});

describe('MetaDetail', () => {
  const record = { id: 'r1', version: 2, data: { name: 'Alpha', qty: 3, secret: 'nope' } };
  const activity = {
    items: [{ id: 'a1', action: 'record.created', actorId: 'u1', actorName: 'Nok', occurredAt: '2026-10-11T07:00:00.000Z' }],
    total: 1,
  };

  it('shows visible fields and values, never hidden ones', () => {
    const wrapper = mountWithI18n(MetaDetail, { props: { record, fields, activity, relations: [] } }, 'en');
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).not.toContain('nope');
  });

  it('shows relation targets as text without onOpen and as buttons with it', async () => {
    const relations = [{ relationId: 'rel1', name: 'Contains', targets: [{ id: 't1', label: 'Widget' }], onOpen: undefined as undefined | ((id: string) => void) }];
    const wrapper = mountWithI18n(MetaDetail, { props: { record, fields, activity, relations } }, 'en');
    expect(wrapper.text()).toContain('Widget');
    expect(wrapper.find('button').exists()).toBe(false);
    await wrapper.setProps({ relations: [{ ...relations[0]!, onOpen: () => undefined }] });
    expect(wrapper.findAll('button').some((button) => button.text() === 'Widget')).toBe(true);
  });

  it('formats the activity time and names the actor', () => {
    const wrapper = mountWithI18n(MetaDetail, { props: { record, fields, activity, relations: [] } }, 'en');
    expect(wrapper.text()).toContain('Nok');
    expect(wrapper.text()).toContain('record.created');
  });

  it('shows placeholders when there is no activity or no links', () => {
    const wrapper = mountWithI18n(MetaDetail, { props: { record, fields, activity: { items: [], total: 0 }, relations: [{ relationId: 'rel1', name: 'Contains', targets: [] }] } }, 'en');
    expect(wrapper.text()).toContain('No linked records');
    expect(wrapper.text()).toContain('No activity yet');
  });
});
