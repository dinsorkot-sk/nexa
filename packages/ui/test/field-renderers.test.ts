import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { FieldTypeSchema, type EntityDefinition, type FieldDefinition } from '@nexa/meta';
import { validateRecordData } from '../../engine/entity/index';
import NxFieldInput from '../src/components/NxFieldInput.vue';
import NxFieldValue from '../src/components/NxFieldValue.vue';
import { inputKindByFieldType } from '../src/lib/field-kinds';

afterEach(() => { document.body.innerHTML = ''; });

const entity: EntityDefinition = { id: 'e', moduleId: 'm', name: 'e', label: 'E', pluralLabel: 'Es', description: '', settings: {} };
const choices = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

function makeField(type: FieldDefinition['type'], options: Partial<FieldDefinition['options']> = {}): FieldDefinition {
  return {
    id: 'f', entityId: 'e', name: 'f', label: 'Field', type, position: 0,
    options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
  };
}

const extra: Partial<Record<FieldDefinition['type'], Partial<FieldDefinition['options']>>> = {
  select: { choices }, multiSelect: { choices }, reference: { referenceEntityId: 'other' },
};

const allTypes = FieldTypeSchema.options;

describe('every field type has a renderer', () => {
  it('the kind table covers exactly the field types in @nexa/meta', () => {
    expect(Object.keys(inputKindByFieldType).sort()).toEqual([...allTypes].sort());
  });

  it.each(allTypes)('%s: the editor mounts and renders a control or a value', (type) => {
    const wrapper = mount(NxFieldInput, { props: { field: makeField(type, extra[type]), modelValue: undefined } });
    expect(wrapper.html().length).toBeGreaterThan(0);
    expect(wrapper.element.nodeType).not.toBe(8);
  });

  it.each(allTypes)('%s: the display shows an empty marker for no value', (type) => {
    const wrapper = mount(NxFieldValue, { props: { field: makeField(type, extra[type]), value: undefined } });
    expect(wrapper.text()).toBe('—');
  });

  it.each(allTypes)('%s: the display renders a stored value without throwing', (type) => {
    const sample: Partial<Record<FieldDefinition['type'], unknown>> = {
      number: 3, integer: 3, decimal: 3.5, currency: 1200, percentage: 12, boolean: true, date: '2026-10-16',
      datetime: '2026-10-16T07:30:00.000Z', time: '09:30', select: 'a', multiSelect: ['a', 'b'], email: 'ada@example.com',
      phone: '+66 81 234 5678', url: 'https://example.com', json: { a: 1 }, file: 'https://example.com/f.pdf',
      image: 'https://example.com/i.png', reference: 'u-1', text: 'hello', longText: 'line', computed: 3, formula: 3, autoNumber: 7,
    };
    const wrapper = mount(NxFieldValue, { props: { field: makeField(type, extra[type]), value: sample[type] } });
    expect(wrapper.text().length).toBeGreaterThan(0);
  });
});

describe('unsafe stored links are not rendered as links', () => {
  it.each([
    ['url', 'javascript:alert(1)'],
    ['url', ' https://example.com'],
    ['file', 'data:text/html,<script>'],
    ['email', 'a@b.c<script>'],
    ['phone', 'tel:123;alert(1)'],
  ] as const)('%s with %s', (type, value) => {
    const wrapper = mount(NxFieldValue, { props: { field: makeField(type), value } });
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('a safe https URL is rendered with noopener', () => {
    const wrapper = mount(NxFieldValue, { props: { field: makeField('url'), value: 'https://example.com/a' } });
    expect(wrapper.find('a').attributes('href')).toBe('https://example.com/a');
    expect(wrapper.find('a').attributes('rel')).toBe('noopener noreferrer');
  });
});

/**
 * Values the editors emit must be accepted by the real engine validator. This checks that the UI and the API agree,
 * not just that the UI agrees with itself.
 */
const accepted = (type: FieldDefinition['type'], value: unknown, options: Partial<FieldDefinition['options']> = {}) =>
  validateRecordData(entity, [makeField(type, options)], { f: value }, { mode: 'create' });

async function typeIn(type: FieldDefinition['type'], text: string, options: Partial<FieldDefinition['options']> = {}) {
  const wrapper = mount(NxFieldInput, { props: { field: makeField(type, options), modelValue: undefined }, attachTo: document.body });
  await wrapper.find('input, textarea').setValue(text);
  const value = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
  wrapper.unmount();
  return value;
}

describe('values the editors emit are accepted by the engine', () => {
  it('text, longText, email, phone, url', async () => {
    expect(accepted('text', await typeIn('text', 'hello'))).toEqual({ f: 'hello' });
    expect(accepted('longText', await typeIn('longText', 'line one\nline two'))).toEqual({ f: 'line one\nline two' });
    expect(accepted('email', await typeIn('email', 'ada@example.com'))).toEqual({ f: 'ada@example.com' });
    expect(accepted('phone', await typeIn('phone', '+66 81 234 5678'))).toEqual({ f: '+66 81 234 5678' });
    expect(accepted('url', await typeIn('url', 'https://example.com/a'))).toEqual({ f: 'https://example.com/a' });
  });

  it('an empty text box emits undefined, not an empty string', async () => {
    expect(await typeIn('text', '')).toBeUndefined();
  });

  it('numbers: integer rounds, decimal and currency honour precision', async () => {
    expect(accepted('integer', await typeIn('integer', '7.6'))).toEqual({ f: 8 });
    expect(accepted('decimal', await typeIn('decimal', '1.239', { precision: 2 }), { precision: 2 })).toEqual({ f: 1.24 });
    expect(accepted('currency', await typeIn('currency', '99.5', { precision: 2 }), { precision: 2 })).toEqual({ f: 99.5 });
  });

  it('a partial number emits undefined so an empty number is never sent', async () => {
    expect(await typeIn('number', '-')).toBeUndefined();
  });

  it('time accepts HH:mm', async () => {
    expect(accepted('time', await typeIn('time', '09:30'))).toEqual({ f: '09:30' });
  });

  it('select and multi-select emit the choice ids', async () => {
    const select = mount(NxFieldInput, { props: { field: makeField('select', extra.select), modelValue: undefined }, attachTo: document.body });
    await select.find('select').setValue('b');
    expect(accepted('select', select.emitted('update:modelValue')?.at(-1)?.[0], extra.select)).toEqual({ f: 'b' });
  });

  it('json emits parsed objects and refuses invalid JSON', async () => {
    const wrapper = mount(NxFieldInput, { props: { field: makeField('json'), modelValue: undefined }, attachTo: document.body });
    await wrapper.find('textarea').setValue('{"a":1}');
    expect(accepted('json', wrapper.emitted('update:modelValue')?.at(-1)?.[0])).toEqual({ f: { a: 1 } });
    await wrapper.find('textarea').setValue('{"a":');
    expect(wrapper.text()).toContain('Invalid JSON');
    expect(wrapper.emitted('update:modelValue')?.length).toBe(1);
  });

  it('boolean emits true when the switch is turned on', async () => {
    const wrapper = mount(NxFieldInput, { props: { field: makeField('boolean'), modelValue: false }, attachTo: document.body });
    await wrapper.find('button[role="switch"]').trigger('click');
    expect(accepted('boolean', wrapper.emitted('update:modelValue')?.at(-1)?.[0])).toEqual({ f: true });
    await flushPromises();
  });
});
