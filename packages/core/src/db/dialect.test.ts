import { describe, it, expect } from 'vitest';
import { PostgresDialectAdapter } from './postgres-dialect';
import { SqliteDialectAdapter } from './sqlite-dialect';

describe('PostgresDialectAdapter', () => {
  const a = new PostgresDialectAdapter();
  it('maps logical types', () => {
    expect(a.mapType('boolean')).toBe('boolean');
    expect(a.mapType('decimal', { precision: 10, scale: 2 })).toBe('numeric(10,2)');
    expect(a.mapType('text', { length: 50 })).toBe('varchar(50)');
    expect(a.mapType('json')).toBe('jsonb');
  });
  it('quotes identifiers', () => {
    expect(a.quoteIdentifier('foo')).toBe('"foo"');
    expect(a.quoteIdentifier('a"b')).toBe('"a""b"');
  });
  it('qualifies tables', () => {
    expect(a.qualifyTable('t_yic', 'customer')).toBe('"t_yic"."customer"');
  });
  it('capabilities', () => {
    expect(a.capabilities.transactionalDDL).toBe(true);
    expect(a.capabilities.alterColumnConstraints).toBe(true);
    expect(a.capabilities.schemas).toBe(true);
  });
});

describe('SqliteDialectAdapter', () => {
  const a = new SqliteDialectAdapter();
  it('maps logical types', () => {
    expect(a.mapType('boolean')).toBe('integer');
    expect(a.mapType('decimal')).toBe('integer');
    expect(a.mapType('json')).toBe('text');
    expect(a.mapType('datetime')).toBe('text');
  });
  it('quotes identifiers', () => {
    expect(a.quoteIdentifier('foo')).toBe('"foo"');
  });
  it('qualifyTable ignores namespace (no schemas)', () => {
    expect(a.qualifyTable('t_yic', 'customer')).toBe('"customer"');
  });
  it('capabilities', () => {
    expect(a.capabilities.transactionalDDL).toBe(true);
    expect(a.capabilities.alterColumnConstraints).toBe(false);
    expect(a.capabilities.schemas).toBe(false);
  });
  it('buildRebuildStep uses atomic SQLite procedure', () => {
    const step = a.buildRebuildStep('customer', {
      name: 'customer',
      primaryKey: 'id',
      columns: [
        { name: 'id', logicalType: 'uuid', nullable: false, physicalName: 'id' },
        { name: 'name', logicalType: 'text', nullable: true, physicalName: 'name' },
      ],
    });
    expect(step.sql).toContain('PRAGMA foreign_keys = OFF');
    expect(step.sql).toContain('BEGIN IMMEDIATE');
    expect(step.sql).toContain('PRAGMA foreign_key_check');
    expect(step.sql).toContain('COMMIT');
    expect(step.sql).toContain('PRAGMA foreign_keys = ON');
    expect(step.sql).toContain('DROP TABLE');
    expect(step.sql).toContain('RENAME TO');
  });
});