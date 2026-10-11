import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { FieldTypeSchema, type EntityDefinition, type FieldDefinition } from '@nexa/meta';
import { validateRecordData, RecordValidationError } from '../../engine/entity/index';
import MetaFieldInput from '../src/components/MetaFieldInput.vue';
import MetaFieldValue from '../src/components/MetaFieldValue.vue';
import { inputKindByFieldType } from '../src/render/field-kinds';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

const entity: EntityDefinition = { id: 'e', moduleId: 'm', name: 'e', label: 'E', pluralLabel: 'Es', description: '', settings: {} };
const choices = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

function makeField(type: FieldDefinition['type'], options: Partial<FieldDefinition['options']> = {}): FieldDefinition {
  return {
    id: 'f', entityId: 'e', name: 'f', label: 'Field', type, position: 0,
    options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options },
  };
}

/** Per-type options that the field definition requires, and a sample the user could realistically enter. */
const setup: Record<string, { options?: Partial<FieldDefinition['options']> }> = {
  select: { options: { choices } }, multiSelect: { options: { choices } }, reference: { options: { referenceEntityId: 'other' } },
};

const allTypes = FieldTypeSchema.options;

describe('every field type has a renderer', () => {
  it('the input table covers exactly the field types in @nexa/meta', () => {
    expect(Object.keys(inputKindByFieldType).sort()).toEqual([...allTypes].sort());
  });

  it.each(allTypes)('%s: MetaFieldInput mounts and renders something', (type) => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField(type, setup[type]?.options), modelValue: undefined }, attachTo: document.body }, 'en');
    expect(wrapper.html().length).toBeGreaterThan(0);
    expect(wrapper.element.nodeType).not.toBe(8); // not just an empty v-if comment
    wrapper.unmount();
  });

  it.each(allTypes)('%s: MetaFieldValue renders an empty value without throwing', (type) => {
    const wrapper = mountWithI18n(MetaFieldValue, { props: { field: makeField(type, setup[type]?.options), value: undefined } }, 'en');
    expect(wrapper.text()).toBe('—');
  });

  it.each(allTypes)('%s: MetaFieldValue localises its empty marker', (type) => {
    const wrapper = mountWithI18n(MetaFieldValue, { props: { field: makeField(type, setup[type]?.options), value: null } }, 'th');
    expect(wrapper.text().length).toBeGreaterThan(0);
  });
});

/**
 * What each editor emits for a realistic user entry must be accepted by the real engine validator. This is the
 * check that the UI and the API agree, not just that the UI agrees with itself.
 */
const emitted = (wrapper: ReturnType<typeof mountWithI18n>) => wrapper.emitted('update:modelValue')?.at(-1)?.[0];
const accepted = (type: FieldDefinition['type'], value: unknown, options: Partial<FieldDefinition['options']> = {}) =>
  validateRecordData(entity, [makeField(type, options)], { f: value }, { mode: 'create' });

describe('values the editors emit are accepted by the engine', () => {
  async function typeIn(type: FieldDefinition['type'], text: string, options: Partial<FieldDefinition['options']> = {}) {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField(type, options), modelValue: undefined }, attachTo: document.body }, 'en');
    const input = wrapper.find('input, textarea');
    await input.setValue(text);
    const value = emitted(wrapper);
    wrapper.unmount();
    return value;
  }

  it('text, longText, email, phone, url', async () => {
    expect(accepted('text', await typeIn('text', 'hello'))).toEqual({ f: 'hello' });
    expect(accepted('longText', await typeIn('longText', 'line one\nline two'))).toEqual({ f: 'line one\nline two' });
    expect(accepted('email', await typeIn('email', 'ada@example.com'))).toEqual({ f: 'ada@example.com' });
    expect(accepted('phone', await typeIn('phone', '+66 81 234 5678'))).toEqual({ f: '+66 81 234 5678' });
    expect(accepted('url', await typeIn('url', 'https://example.com/a'))).toEqual({ f: 'https://example.com/a' });
  });

  it('numbers: integer, decimal, currency and percentage honour min, max and precision', async () => {
    expect(accepted('integer', await typeIn('integer', '7.6'))).toEqual({ f: 8 });
    expect(accepted('decimal', await typeIn('decimal', '3.14159', { precision: 2 }))).toEqual({ f: 3.14 });
    expect(accepted('currency', await typeIn('currency', '19.999'))).toEqual({ f: 20 });
    expect(accepted('percentage', await typeIn('percentage', '12.5', { min: 0, max: 100 }))).toEqual({ f: 12.5 });
    expect(() => accepted('percentage', 120, { min: 0, max: 100 })).toThrow(RecordValidationError);
  });

  it('an emptied optional field emits undefined, which the API treats as no value', async () => {
    for (const type of ['text', 'email', 'phone', 'url', 'number', 'time'] as const) {
      const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField(type), modelValue: type === 'number' ? 5 : 'x' }, attachTo: document.body }, 'en');
      await wrapper.find('input').setValue('');
      expect(emitted(wrapper), type).toBeUndefined();
      expect(accepted(type, emitted(wrapper))).toBeDefined();
      wrapper.unmount();
    }
  });

  it('a cleared required field is refused by the engine, never silently sent as an empty string', () => {
    expect(() => accepted('text', undefined, { required: true })).toThrow(RecordValidationError);
    expect(() => accepted('email', '')).toThrow(RecordValidationError);
  });

  it('time emits a time of day the engine accepts', async () => {
    expect(accepted('time', await typeIn('time', '14:30'))).toEqual({ f: '14:30' });
  });

  it('datetime emits a UTC instant the engine accepts', async () => {
    const value = await typeIn('datetime', '2026-10-11T14:30');
    expect(value).toBe('2026-10-11T07:30:00.000Z');
    expect(accepted('datetime', value)).toEqual({ f: '2026-10-11T07:30:00.000Z' });
  });

  it('boolean emits a real boolean', async () => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField('boolean'), modelValue: false }, attachTo: document.body }, 'en');
    await wrapper.get('[role="checkbox"]').trigger('click');
    expect(emitted(wrapper)).toBe(true);
    expect(accepted('boolean', emitted(wrapper))).toEqual({ f: true });
    wrapper.unmount();
  });

  it('select emits a choice value, and clearing it emits undefined', async () => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField('select', { choices }), modelValue: undefined }, attachTo: document.body }, 'en');
    await wrapper.get('select').setValue('b');
    expect(emitted(wrapper)).toBe('b');
    expect(accepted('select', 'b', { choices })).toEqual({ f: 'b' });
    await wrapper.get('select').setValue('');
    expect(emitted(wrapper)).toBeUndefined();
    wrapper.unmount();
  });

  it('multiSelect emits an array of choice values the engine accepts', async () => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField('multiSelect', { choices }), modelValue: ['a', 'b'] }, attachTo: document.body }, 'en');
    await nextTick();
    (document.body.querySelector('button[aria-label="Remove Alpha"]') as HTMLButtonElement).click();
    await nextTick();
    expect(emitted(wrapper)).toEqual(['b']);
    expect(accepted('multiSelect', emitted(wrapper), { choices })).toEqual({ f: ['b'] });
    wrapper.unmount();
  });

  it('reference emits the record id, not its label', async () => {
    const wrapper = mountWithI18n(MetaFieldInput, {
      props: {
        field: makeField('reference', { referenceEntityId: 'other' }), modelValue: undefined,
        loadReferenceOptions: async () => [{ value: 'rec-1', label: 'Alice' }],
      },
      attachTo: document.body,
    }, 'en');
    const input = document.body.querySelector('input') as HTMLInputElement;
    input.focus(); input.value = 'a'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick(); await new Promise((resolve) => setTimeout(resolve, 300)); await flushPromises();
    (document.body.querySelector('[role="option"]') as HTMLElement).click();
    await flushPromises();
    expect(emitted(wrapper)).toBe('rec-1');
    expect(accepted('reference', emitted(wrapper), { referenceEntityId: 'other' })).toEqual({ f: 'rec-1' });
    wrapper.unmount();
  });

  it('json emits an object or array, and refuses text that is not', async () => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField('json'), modelValue: undefined }, attachTo: document.body }, 'en');
    const box = wrapper.get('textarea');
    await box.setValue('{"a": [1, 2]}');
    expect(emitted(wrapper)).toEqual({ a: [1, 2] });
    expect(accepted('json', emitted(wrapper))).toEqual({ f: { a: [1, 2] } });
    await box.setValue('{"a": ');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(emitted(wrapper)).toEqual({ a: [1, 2] }); // the invalid text did not replace the last good value
    await box.setValue('42');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await box.setValue('');
    expect(emitted(wrapper)).toBeUndefined();
    wrapper.unmount();
  });

  it('file and image emit a trimmed URL the engine accepts, and nothing for an empty box', async () => {
    for (const type of ['file', 'image'] as const) {
      expect(accepted(type, await typeIn(type, '  https://example.com/x.pdf  '))).toEqual({ f: 'https://example.com/x.pdf' });
      expect(await typeIn(type, '')).toBeUndefined();
    }
  });
});

describe('read-only types', () => {
  it.each(['computed', 'formula', 'autoNumber'] as const)('%s has no input and says it is calculated', (type) => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField(type), modelValue: 5 }, attachTo: document.body }, 'en');
    expect(wrapper.find('input, textarea, select').exists()).toBe(false);
    expect(wrapper.text()).toContain('Calculated automatically');
    wrapper.unmount();
  });

  it('says so in Thai', () => {
    expect(mountWithI18n(MetaFieldInput, { props: { field: makeField('formula'), modelValue: 1 } }, 'th').text()).toContain('คำนวณอัตโนมัติ');
  });

  it('a field marked readonly or hidden is disabled', () => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField('text', { readonly: true }), modelValue: 'x' }, attachTo: document.body }, 'en');
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});

describe('file and image are URL fields and say upload is not supported', () => {
  it.each(['file', 'image'] as const)('%s shows a visible no-upload note in both languages', (type) => {
    const en = mountWithI18n(MetaFieldInput, { props: { field: makeField(type), modelValue: undefined } }, 'en');
    expect(en.text()).toMatch(/not supported yet/i);
    const th = mountWithI18n(MetaFieldInput, { props: { field: makeField(type), modelValue: undefined } }, 'th');
    expect(th.text()).toContain('ยังไม่รองรับการอัปโหลด');
  });

  it.each(['file', 'image'] as const)('%s renders no file chooser and no drop zone', (type) => {
    const wrapper = mountWithI18n(MetaFieldInput, { props: { field: makeField(type), modelValue: undefined } }, 'en');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.find('[draggable], [ondrop]').exists()).toBe(false);
  });

  it('image shows a preview only for an http(s) address', () => {
    const ok = mountWithI18n(MetaFieldInput, { props: { field: makeField('image'), modelValue: 'https://example.com/a.png' } }, 'en');
    expect(ok.find('img').attributes('src')).toBe('https://example.com/a.png');
    const bad = mountWithI18n(MetaFieldInput, { props: { field: makeField('image'), modelValue: 'javascript:alert(1)' } }, 'en');
    expect(bad.find('img').exists()).toBe(false);
    expect(bad.find('[role="alert"]').exists()).toBe(true);
  });
});

describe('MetaFieldValue display', () => {
  const show = (type: FieldDefinition['type'], value: unknown, locale: 'th' | 'en' = 'en', options: Partial<FieldDefinition['options']> = {}, extra: Record<string, unknown> = {}) =>
    mountWithI18n(MetaFieldValue, { props: { field: makeField(type, options), value, ...extra } }, locale);

  it('links email, phone, url and file through the safe allowlist', () => {
    expect(show('email', 'ada@example.com').get('a').attributes('href')).toBe('mailto:ada@example.com');
    expect(show('phone', '+66 81 234 5678').get('a').attributes('href')).toBe('tel:+66812345678');
    const url = show('url', 'https://example.com/');
    expect(url.get('a').attributes('href')).toBe('https://example.com/');
    expect(url.get('a').attributes('rel')).toContain('noopener');
    expect(url.get('a').attributes('target')).toBe('_blank');
    expect(show('file', 'https://example.com/a.pdf').find('a').exists()).toBe(true);
  });

  it('never renders a javascript: or data: value as a link', () => {
    for (const type of ['url', 'file'] as const) {
      for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', ' javascript:alert(1)']) {
        const wrapper = show(type, bad);
        expect(wrapper.find('a').exists(), `${type} ${bad}`).toBe(false);
        expect(wrapper.html()).not.toMatch(/href\s*=\s*["']?\s*javascript/i);
      }
    }
    expect(show('image', 'javascript:alert(1)').find('img').exists()).toBe(false);
  });

  it('escapes markup in text values instead of rendering it', () => {
    const wrapper = show('text', '<img src=x onerror=alert(1)>');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows Yes/No in the user\'s language, and the Buddhist year in Thai', () => {
    expect(show('boolean', true, 'th').text()).toBe('ใช่');
    expect(show('boolean', false, 'en').text()).toBe('No');
    expect(show('date', '2026-10-11', 'th').text()).toBe('11 ตุลาคม 2569');
    expect(show('date', '2026-10-11', 'en').text()).toBe('October 11, 2026');
  });

  it('shows multiSelect as badges and a reference by its label', () => {
    const badges = show('multiSelect', ['a', 'b'], 'en', { choices });
    expect(badges.text()).toContain('Alpha');
    expect(badges.text()).toContain('Beta');
    expect(show('reference', 'rec-1', 'en', {}, { referenceLabel: (id: string) => (id === 'rec-1' ? 'Alice' : undefined) }).text()).toBe('Alice');
  });
});
