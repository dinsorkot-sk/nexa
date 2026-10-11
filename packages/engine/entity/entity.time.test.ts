import { describe, expect, it } from 'vitest';
import type { EntityDefinition, FieldDefinition } from '@nexa/meta';
import { RecordValidationError, validateRecordData } from './index';

const entity: EntityDefinition = {
  id: 'shift',
  moduleId: 'hr',
  name: 'shift',
  label: 'Shift',
  pluralLabel: 'Shifts',
  description: '',
  settings: {},
};

const timeField = (options: Partial<FieldDefinition['options']> = {}): FieldDefinition => ({
  id: 'starts',
  entityId: 'shift',
  name: 'starts',
  label: 'Starts',
  type: 'time',
  position: 0,
  options: {
    required: false, unique: false, readonly: false, hidden: false, searchable: false,
    sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...options,
  },
});

const accepts = (value: unknown, options?: Partial<FieldDefinition['options']>) =>
  validateRecordData(entity, [timeField(options)], { starts: value }, { mode: 'create' });
const rejects = (value: unknown) => expect(() => accepts(value)).toThrow(RecordValidationError);

describe('time fields are a time of day (Phase 19)', () => {
  it('accepts the values <input type="time"> produces', () => {
    expect(accepts('14:30')).toEqual({ starts: '14:30' });
    expect(accepts('14:30:45')).toEqual({ starts: '14:30:45' });
    expect(accepts('00:00')).toEqual({ starts: '00:00' });
    expect(accepts('23:59:59')).toEqual({ starts: '23:59:59' });
  });

  it('stores the value unchanged, with no timezone conversion', () => {
    expect(accepts('09:05').starts).toBe('09:05');
  });

  it('rejects hours, minutes or seconds out of range', () => {
    for (const bad of ['24:00', '25:00', '12:60', '12:30:60', '99:99']) rejects(bad);
  });

  it('rejects malformed shapes and things that are not a time of day', () => {
    for (const bad of ['', '1:30', '14', '14:3', '14:30:4', '14-30', '14:30pm', 'noon', ' 14:30', '14:30 ']) rejects(bad);
  });

  it('rejects full timestamps, which are datetimes and not a time of day', () => {
    rejects('2026-10-11T14:30:00Z');
    rejects('2026-10-11T14:30');
    rejects('1970-01-01T14:30:00Z');
  });

  it('rejects non-string values', () => {
    for (const bad of [1430, true, {}, ['14:30']]) rejects(bad);
  });

  it('still enforces required, and allows an absent value when optional', () => {
    expect(() => accepts(null, { required: true })).toThrow(RecordValidationError);
    expect(accepts(null)).toBeDefined();
  });

  it('reports the failure against the field', () => {
    try { accepts('25:00'); throw new Error('expected a validation error'); } catch (error) {
      expect(error).toBeInstanceOf(RecordValidationError);
      expect(JSON.stringify((error as RecordValidationError).issues)).toContain('starts');
    }
  });
});

describe('records that already hold a legacy timestamp in a time field', () => {
  const legacy = { starts: '2026-10-11T14:30:00Z', note: 'a' };
  const fields = [timeField(), { ...timeField(), id: 'note', name: 'note', label: 'Note', type: 'text' as const }];

  it('can still be edited when the legacy value is left unchanged', () => {
    const updated = validateRecordData(entity, fields, { note: 'b' }, { mode: 'update', existing: legacy });
    expect(updated).toMatchObject({ starts: '2026-10-11T14:30:00Z', note: 'b' });
  });

  it('accepts the legacy value being sent back unchanged in a full-record update', () => {
    expect(() => validateRecordData(entity, fields, { starts: '2026-10-11T14:30:00Z', note: 'b' }, { mode: 'update', existing: legacy })).not.toThrow();
  });

  it('rejects changing it to another timestamp, and accepts replacing it with a time of day', () => {
    expect(() => validateRecordData(entity, fields, { starts: '2026-10-12T09:00:00Z' }, { mode: 'update', existing: legacy })).toThrow(RecordValidationError);
    expect(validateRecordData(entity, fields, { starts: '09:00' }, { mode: 'update', existing: legacy })).toMatchObject({ starts: '09:00' });
  });

  it('does not let a new record use a timestamp', () => {
    expect(() => validateRecordData(entity, fields, { starts: '2026-10-11T14:30:00Z' }, { mode: 'create' })).toThrow(RecordValidationError);
  });

  it('does not excuse a garbage value that was somehow stored', () => {
    expect(() => validateRecordData(entity, fields, { note: 'b' }, { mode: 'update', existing: { starts: 'noon', note: 'a' } })).toThrow(RecordValidationError);
  });
});

describe('date and datetime behaviour is unchanged by the time fix', () => {
  const field = (type: 'date' | 'datetime'): FieldDefinition => ({ ...timeField(), id: 'when', name: 'when', type });
  const run = (type: 'date' | 'datetime', value: unknown) =>
    validateRecordData(entity, [field(type)], { when: value }, { mode: 'create' });

  it('date still accepts ISO dates and rejects non-dates', () => {
    expect(run('date', '2026-10-11')).toEqual({ when: '2026-10-11' });
    expect(() => run('date', '10/11/2026')).toThrow(RecordValidationError);
  });

  it('datetime still accepts the ISO forms it accepted before', () => {
    expect(run('datetime', '2026-10-11T14:30:00Z')).toBeDefined();
    expect(run('datetime', '2026-10-11T14:30')).toBeDefined();
    expect(() => run('datetime', 'not a date')).toThrow(RecordValidationError);
  });
});
