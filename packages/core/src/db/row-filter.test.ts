import { describe, it, expect } from 'vitest';
import { parseRowFilter } from './row-filter';

describe('parseRowFilter', () => {
  it('parses simple condition', () => {
    const f = parseRowFilter("status = 'active'");
    expect(f).toEqual({ kind: 'condition', field: 'status', op: 'eq', value: 'active' });
  });

  it('parses and/or groups', () => {
    const f = parseRowFilter("a = 1 && b = 2 || c = 3");
    expect(f.kind).toBe('group');
  });

  it('parses contains', () => {
    const f = parseRowFilter("name contains 'foo'");
    expect(f).toMatchObject({ kind: 'condition', field: 'name', op: 'contains', value: 'foo' });
  });

  it('parses in', () => {
    const f = parseRowFilter("status in ('a', 'b')");
    expect(f).toMatchObject({ kind: 'condition', field: 'status', op: 'in', value: ['a', 'b'] });
  });

  it('parses parentheses', () => {
    const f = parseRowFilter("(a = 1 || b = 2) && c = 3");
    expect(f.kind).toBe('group');
    expect((f as { op: string }).op).toBe('and');
  });

  it('parses comparison ops', () => {
    expect(parseRowFilter('age >= 18')).toMatchObject({ op: 'gte', value: 18 });
    expect(parseRowFilter('price < 100')).toMatchObject({ op: 'lt', value: 100 });
  });
});