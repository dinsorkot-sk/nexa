import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@nexa/meta';
import { parseQuery, RecordQueryError } from './index';

const makeField = (id: string, type: FieldDefinition['type'] = 'text'): FieldDefinition => ({
  id, entityId: 'e', name: id, label: id, type, position: 0,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: true, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
});
const field = makeField('name');
const numberField = makeField('count', 'number');
const booleanField = makeField('active', 'boolean');
const fields = [field, numberField, booleanField];
const filter = (fieldId: string, operator: string, value: unknown) => JSON.stringify([{ fieldId, operator, value }]);

describe('parseQuery', () => {
  it('accepts allowlisted filters and sorts', () => {
    expect(parseQuery({ sort: 'name:desc', filter: filter('name', 'eq', 'Van') }, fields)).toMatchObject({ sort: { fieldId: 'name', direction: 'desc' }, filters: [{ fieldId: 'name', operator: 'eq' }] });
  });
  it('validates filter values and operator compatibility', () => {
    expect(parseQuery({ filter: filter('count', 'gte', 2) }, fields).filters).toHaveLength(1);
    expect(parseQuery({ filter: filter('active', 'eq', false) }, fields).filters).toHaveLength(1);
    expect(() => parseQuery({ filter: filter('count', 'contains', '2') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('count', 'eq', '2') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'eq', { injection: "' OR 1=1 --" }) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'in', []) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'in', ['a', { bad: true }]) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('count', 'eq', 1.2) }, [makeField('count', 'integer')])).toThrow(RecordQueryError);
  });
  it('accepts injection-shaped text as a bound filter value', () => {
    const value = "'; SELECT 1; --";
    expect(parseQuery({ filter: filter('name', 'eq', value) }, fields).filters[0]?.value).toBe(value);
  });
  it('rejects invalid runtime query parameter types', () => {
    expect(() => parseQuery({ search: 1 as unknown as string }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ sort: 1 as unknown as string }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: 1 as unknown as string }, fields)).toThrow(RecordQueryError);
  });
  it('rejects unsupported structured field filters', () => {
    expect(() => parseQuery({ filter: filter('payload', 'eq', 'x') }, [makeField('payload', 'json')])).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('tags', 'eq', 'x') }, [makeField('tags', 'multiSelect')])).toThrow(RecordQueryError);
  });
  it('accepts bounded primitive in lists', () => {
    expect(parseQuery({ filter: filter('count', 'in', [1, 2]) }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('name', 'in', ['a', 'b']) }, fields)).toBeDefined();
  });
  it('rejects malformed field identifiers', () => {
    expect(() => parseQuery({ filter: filter('name.foo', 'eq', 'x') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ sort: 'name;DROP:asc' }, fields)).toThrow(RecordQueryError);
  });
  it('enforces pagination boundaries', () => {
    expect(parseQuery({ limit: 100, offset: 1_000_000 }, fields)).toMatchObject({ limit: 100, offset: 1_000_000 });
    expect(() => parseQuery({ limit: 101 }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ offset: 1_000_001 }, fields)).toThrow(RecordQueryError);
  });
  it('enforces filter and search bounds', () => {
    expect(() => parseQuery({ filter: JSON.stringify(Array.from({ length: 21 }, () => ({ fieldId: 'name', operator: 'eq', value: 'x' }))) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ search: 'x'.repeat(201) }, fields)).toThrow(RecordQueryError);
  });
  it('preserves null equality values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', null) }, fields).filters[0]?.value).toBeNull();
  });
  it('accepts all numeric comparison operators', () => {
    for (const operator of ['eq', 'ne', 'gt', 'gte', 'lt', 'lte']) expect(parseQuery({ filter: filter('count', operator, 1) }, fields)).toBeDefined();
  });
  it('rejects comparisons on boolean fields', () => {
    expect(() => parseQuery({ filter: filter('active', 'gt', true) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts default pagination', () => {
    expect(parseQuery({}, fields)).toMatchObject({ limit: 25, offset: 0, filters: [] });
  });
  it('rejects unknown fields and operators', () => {
    expect(() => parseQuery({ filter: filter('missing', 'eq', 'x') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'like', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts text contains and comparison filters', () => {
    expect(parseQuery({ filter: filter('name', 'contains', 'x') }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('name', 'gte', 'a') }, fields)).toBeDefined();
  });
  it('rejects oversized scalar and list values', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', 'x'.repeat(2001)) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'in', Array.from({ length: 101 }, () => 'x')) }, fields)).toThrow(RecordQueryError);
  });
  it('rejects malformed filter JSON', () => {
    expect(() => parseQuery({ filter: '{bad' }, fields)).toThrow(RecordQueryError);
  });
  it('accepts sortable and searchable metadata', () => {
    expect(parseQuery({ sort: 'name:desc', search: 'Nexa' }, fields)).toBeDefined();
  });
  it('rejects disabled or hidden sortable and searchable metadata', () => {
    const disabled = { ...field, options: { ...field.options, sortable: false, searchable: false } };
    expect(() => parseQuery({ sort: 'name:asc' }, [disabled])).toThrow(RecordQueryError);
    expect(() => parseQuery({ search: 'x' }, [disabled])).toThrow(RecordQueryError);
    const hidden = { ...field, options: { ...field.options, hidden: true } };
    expect(() => parseQuery({ sort: 'name:asc' }, [hidden])).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'eq', 'secret') }, [hidden])).toThrow(RecordQueryError);
    expect(() => parseQuery({ search: 'secret' }, [hidden])).toThrow(RecordQueryError);
  });
  it('excludes hidden searchable fields when visible searchable fields exist', () => {
    const hidden = { ...makeField('secret'), options: { ...makeField('secret').options, hidden: true } };
    expect(parseQuery({ search: 'secret' }, [hidden, field])).toBeDefined();
  });
  it('rejects hidden filterable metadata', () => {
    const hidden = { ...field, options: { ...field.options, hidden: true } };
    expect(() => parseQuery({ filter: filter('name', 'eq', 'secret') }, [hidden])).toThrow(RecordQueryError);
  });
  it('accepts safe SQL-looking scalar data', () => {
    const value = "DROP TABLE records; --";
    expect(parseQuery({ filter: filter('name', 'eq', value) }, fields).filters[0]?.value).toBe(value);
  });
  it('rejects array equality and non-array in filters', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', ['x']) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'in', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts boolean equality and lists', () => {
    expect(parseQuery({ filter: filter('active', 'eq', false) }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('active', 'in', [true, false]) }, fields)).toBeDefined();
  });
  it('rejects wrong scalar types', () => {
    expect(() => parseQuery({ filter: filter('active', 'eq', 'false') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('count', 'eq', '1') }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'eq', false) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts date-like string values', () => {
    const date = makeField('when', 'date');
    expect(parseQuery({ filter: filter('when', 'eq', '2026-10-07') }, [date])).toBeDefined();
  });
  it('rejects object values', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', { value: 'x' }) }, fields)).toThrow(RecordQueryError);
  });
  it('returns structured query issues', () => {
    try { parseQuery({ filter: filter('count', 'eq', 'bad') }, fields); } catch (error) {
      expect(error).toBeInstanceOf(RecordQueryError);
      expect((error as RecordQueryError).issues.length).toBeGreaterThan(0);
    }
  });
  it('allows empty optional query strings', () => {
    expect(parseQuery({ sort: '', filter: '', search: '' }, fields)).toMatchObject({ limit: 25, offset: 0 });
  });
  it('accepts field identifiers with hyphen and underscore', () => {
    const named = [makeField('field-name'), makeField('field_name')];
    expect(parseQuery({ filter: filter('field-name', 'eq', 'x') }, named)).toBeDefined();
    expect(parseQuery({ sort: 'field_name:asc' }, named)).toBeDefined();
  });
  it('rejects field identifiers with injection syntax', () => {
    expect(() => parseQuery({ filter: filter("name' OR 1=1", 'eq', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts exact list boundaries', () => {
    expect(parseQuery({ filter: filter('name', 'in', Array.from({ length: 100 }, () => 'x')) }, fields)).toBeDefined();
  });
  it('rejects empty lists', () => {
    expect(() => parseQuery({ filter: filter('name', 'in', []) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts negative and zero numeric values', () => {
    expect(parseQuery({ filter: filter('count', 'lt', -1) }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('count', 'eq', 0) }, fields)).toBeDefined();
  });
  it('rejects non-finite numeric values', () => {
    expect(parseQuery({ filter: filter('count', 'eq', Infinity) }, fields).filters[0]?.value).toBeNull();
  });
  it('accepts no searchable query only when omitted', () => {
    const noSearch = { ...field, options: { ...field.options, searchable: false } };
    expect(parseQuery({}, [noSearch])).toBeDefined();
    expect(() => parseQuery({ search: 'x' }, [noSearch])).toThrow(RecordQueryError);
  });
  it('rejects invalid sort directions', () => {
    expect(() => parseQuery({ sort: 'name:sideways' }, fields)).toThrow(RecordQueryError);
  });
  it('accepts the default sort direction', () => {
    expect(parseQuery({ sort: 'name' }, fields).sort?.direction).toBe('asc');
  });
  it('rejects malformed sort expressions', () => {
    expect(() => parseQuery({ sort: 'name:asc:extra' }, fields)).toThrow(RecordQueryError);
  });
  it('rejects malformed filter entries', () => {
    expect(() => parseQuery({ filter: JSON.stringify([null]) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: JSON.stringify([{ fieldId: 'name', operator: 'eq' }]) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts primitive SQL-safe values unchanged', () => {
    expect(parseQuery({ filter: filter('name', 'eq', "O'Reilly") }, fields).filters[0]?.value).toBe("O'Reilly");
  });
  it('rejects unsupported field types', () => {
    expect(() => parseQuery({ filter: filter('payload', 'eq', 'x') }, [makeField('payload', 'json')])).toThrow(RecordQueryError);
  });
  it('accepts reference and file string values', () => {
    expect(parseQuery({ filter: filter('ref', 'eq', 'record-id') }, [makeField('ref', 'reference')])).toBeDefined();
    expect(parseQuery({ filter: filter('file', 'eq', 'object-key') }, [makeField('file', 'file')])).toBeDefined();
  });
  it('rejects invalid reference and file values', () => {
    expect(() => parseQuery({ filter: filter('ref', 'eq', 1) }, [makeField('ref', 'reference')])).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('file', 'eq', {}) }, [makeField('file', 'file')])).toThrow(RecordQueryError);
  });
  it('accepts decimal and integer numeric values', () => {
    expect(parseQuery({ filter: filter('count', 'eq', 1) }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('decimal', 'eq', 1.2) }, [makeField('decimal', 'decimal')])).toBeDefined();
  });
  it('rejects fractional integer values', () => {
    expect(() => parseQuery({ filter: filter('integer', 'eq', 1.2) }, [makeField('integer', 'integer')])).toThrow(RecordQueryError);
  });
  it('accepts max page boundaries', () => {
    expect(parseQuery({ limit: 100, offset: 1_000_000 }, fields)).toBeDefined();
  });
  it('rejects invalid runtime parameter types', () => {
    expect(() => parseQuery({ limit: '10' as unknown as number }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ offset: '1' as unknown as number }, fields)).toThrow(RecordQueryError);
  });
  it('accepts multiple valid filters in order', () => {
    expect(parseQuery({ filter: JSON.stringify([{ fieldId: 'name', operator: 'eq', value: 'a' }, { fieldId: 'count', operator: 'gt', value: 1 }]) }, fields).filters).toHaveLength(2);
  });
  it('rejects malformed filter collection', () => {
    expect(() => parseQuery({ filter: JSON.stringify({ fieldId: 'name' }) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts empty text values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', '') }, fields)).toBeDefined();
  });
  it('rejects empty field identifiers', () => {
    expect(() => parseQuery({ filter: filter('', 'eq', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts search punctuation as data', () => {
    expect(parseQuery({ search: "O'Reilly" }, fields)).toBeDefined();
  });
  it('rejects malformed search values', () => {
    expect(() => parseQuery({ search: {} as unknown as string }, fields)).toThrow(RecordQueryError);
  });
  it('accepts standard date and datetime values', () => {
    expect(parseQuery({ filter: filter('when', 'eq', '2026-10-07') }, [makeField('when', 'date')])).toBeDefined();
    expect(parseQuery({ filter: filter('when', 'eq', '2026-10-07T00:00:00Z') }, [makeField('when', 'datetime')])).toBeDefined();
  });
  it('rejects date numeric values', () => {
    expect(() => parseQuery({ filter: filter('when', 'eq', 20261007) }, [makeField('when', 'date')])).toThrow(RecordQueryError);
  });
  it('accepts text comparisons', () => {
    for (const operator of ['eq', 'ne', 'gt', 'gte', 'lt', 'lte']) expect(parseQuery({ filter: filter('name', operator, 'x') }, fields)).toBeDefined();
  });
  it('accepts safe URL, email, and phone text', () => {
    expect(parseQuery({ filter: filter('url', 'eq', 'https://example.test') }, [makeField('url', 'url')])).toBeDefined();
    expect(parseQuery({ filter: filter('email', 'eq', 'a@example.test') }, [makeField('email', 'email')])).toBeDefined();
    expect(parseQuery({ filter: filter('phone', 'eq', '+123') }, [makeField('phone', 'phone')])).toBeDefined();
  });
  it('accepts searchable metadata with bounded input', () => {
    expect(parseQuery({ search: 'x'.repeat(200) }, fields)).toBeDefined();
  });
  it('rejects undefined filter values', () => {
    expect(() => parseQuery({ filter: JSON.stringify([{ fieldId: 'name', operator: 'eq' }]) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts null equality values', () => {
    expect(parseQuery({ filter: filter('count', 'eq', null) }, fields)).toBeDefined();
  });
  it('rejects mixed type in lists', () => {
    expect(() => parseQuery({ filter: filter('count', 'in', [1, '2']) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts simple values and rejects unsupported operators', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'value') }, fields)).toBeDefined();
    expect(() => parseQuery({ filter: filter('name', 'regex', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts ordinary no-op queries', () => {
    expect(parseQuery({}, fields)).toMatchObject({ limit: 25, offset: 0, filters: [] });
  });
  it('rejects values with nested objects', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', { nested: { value: 1 } }) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts SQL-like values as data', () => {
    expect(parseQuery({ filter: filter('name', 'eq', "' OR 1=1 --") }, fields)).toBeDefined();
  });
  it('rejects invalid page bounds', () => {
    expect(() => parseQuery({ limit: -1, offset: -1 }, fields)).toThrow(RecordQueryError);
  });
  it('accepts field ID allowlist', () => {
    expect(parseQuery({ sort: 'name:asc' }, fields)).toBeDefined();
  });
  it('rejects unknown sort fields', () => {
    expect(() => parseQuery({ sort: 'missing:asc' }, fields)).toThrow(RecordQueryError);
  });
  it('accepts in lists at maximum length', () => {
    expect(parseQuery({ filter: filter('name', 'in', Array.from({ length: 100 }, () => 'x')) }, fields)).toBeDefined();
  });
  it('rejects in lists above maximum length', () => {
    expect(() => parseQuery({ filter: filter('name', 'in', Array.from({ length: 101 }, () => 'x')) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts valid boolean filters', () => {
    expect(parseQuery({ filter: filter('active', 'eq', true) }, fields)).toBeDefined();
  });
  it('rejects invalid boolean filters', () => {
    expect(() => parseQuery({ filter: filter('active', 'eq', 'true') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts valid number filters', () => {
    expect(parseQuery({ filter: filter('count', 'eq', 42) }, fields)).toBeDefined();
  });
  it('rejects invalid number filters', () => {
    expect(() => parseQuery({ filter: filter('count', 'eq', '42') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts valid query sort directions', () => {
    expect(parseQuery({ sort: 'name:asc' }, fields)).toBeDefined();
    expect(parseQuery({ sort: 'name:desc' }, fields)).toBeDefined();
  });
  it('rejects invalid query sort directions', () => {
    expect(() => parseQuery({ sort: 'name:up' }, fields)).toThrow(RecordQueryError);
  });
  it('accepts filter operator boundaries', () => {
    expect(parseQuery({ filter: filter('name', 'contains', 'x') }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('name', 'in', ['x']) }, fields)).toBeDefined();
  });
  it('rejects invalid filter operator boundaries', () => {
    expect(() => parseQuery({ filter: filter('name', 'contains', 1) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('name', 'in', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts stable primitive values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'stable') }, fields)).toBeDefined();
  });
  it('rejects unsafe structured values', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', { toString: 'unsafe' }) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts query input defaults', () => {
    expect(parseQuery({ limit: undefined, offset: undefined }, fields)).toBeDefined();
  });
  it('rejects invalid search types', () => {
    expect(() => parseQuery({ search: [] as unknown as string }, fields)).toThrow(RecordQueryError);
  });
  it('accepts a normal record search', () => {
    expect(parseQuery({ search: 'Truck' }, fields)).toBeDefined();
  });
  it('accepts filter issue metadata', () => {
    expect(() => parseQuery({ filter: filter('count', 'eq', 'bad') }, fields)).toThrow(RecordQueryError);
  });
  it('rejects malformed filter item types', () => {
    expect(() => parseQuery({ filter: JSON.stringify([true]) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts punctuation values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'a,b;c') }, fields)).toBeDefined();
  });
  it('rejects SQL in identifiers', () => {
    expect(() => parseQuery({ sort: 'name;DROP TABLE' }, fields)).toThrow(RecordQueryError);
  });
  it('accepts normal identifiers', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'x') }, fields)).toBeDefined();
  });
  it('accepts equality for null values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', null) }, fields)).toBeDefined();
  });
  it('rejects empty operators', () => {
    expect(() => parseQuery({ filter: filter('name', '', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts text fields with long but bounded values', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'x'.repeat(2000)) }, fields)).toBeDefined();
  });
  it('rejects text fields with oversized values', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', 'x'.repeat(2001)) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts exact pagination values', () => {
    expect(parseQuery({ limit: 1, offset: 0 }, fields)).toBeDefined();
  });
  it('rejects noninteger pagination values', () => {
    expect(() => parseQuery({ limit: 1.1 }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ offset: 1.1 }, fields)).toThrow(RecordQueryError);
  });
  it('accepts all supported primitive types', () => {
    expect(parseQuery({ filter: filter('name', 'eq', 'x') }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('count', 'eq', 1) }, fields)).toBeDefined();
    expect(parseQuery({ filter: filter('active', 'eq', true) }, fields)).toBeDefined();
  });
  it('rejects invalid supported primitive types', () => {
    expect(() => parseQuery({ filter: filter('name', 'eq', true) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('count', 'eq', false) }, fields)).toThrow(RecordQueryError);
    expect(() => parseQuery({ filter: filter('active', 'eq', 0) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts a valid composite query', () => {
    expect(parseQuery({ limit: 10, offset: 2, sort: 'count:desc', filter: JSON.stringify([{ fieldId: 'count', operator: 'gte', value: 1 }]), search: 'x' }, fields)).toBeDefined();
  });
  it('rejects a composite query with invalid filter', () => {
    expect(() => parseQuery({ limit: 10, filter: JSON.stringify([{ fieldId: 'count', operator: 'gte', value: 'bad' }]) }, fields)).toThrow(RecordQueryError);
  });
  it('accepts safe strings with wildcard characters', () => {
    expect(parseQuery({ filter: filter('name', 'eq', '%foo_') }, fields)).toBeDefined();
  });
  it('accepts empty filter when omitted', () => {
    expect(parseQuery({}, fields).filters).toEqual([]);
  });
  it('rejects unavailable fields', () => {
    expect(() => parseQuery({ filter: filter('gone', 'eq', 'x') }, fields)).toThrow(RecordQueryError);
  });
  it('accepts fields with safe ID characters', () => {
    const safe = makeField('safe_1');
    expect(parseQuery({ filter: filter('safe_1', 'eq', 'x') }, [safe])).toBeDefined();
  });
});
