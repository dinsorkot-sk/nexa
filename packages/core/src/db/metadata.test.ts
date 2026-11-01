import { describe, it, expect } from 'vitest';
import type { MetaEntity, MetaField } from '@nexa/types';
import { diffMetadata, diffFields, entityToTableDef } from './metadata-diff';
import { StepRunner, restoreRunner } from './step-runner';
import { softDeleteField, isSoftDeleted, activeFields } from './soft-delete';

function makeEntity(id: string, name: string, tableName: string): MetaEntity {
  return { id, name, tableName, version: 1, status: 'published', isSystem: false, createdAt: '', updatedAt: '' };
}

function makeField(id: string, entityId: string, name: string, physicalName: string, logicalType: MetaField['logicalType'], opts: Partial<MetaField> = {}): MetaField {
  return {
    id, entityId, name, label: name, logicalType, physicalName,
    nullable: true, unique: false, required: false, isSystem: false,
    scale: null, precision: null, length: null, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '',
    ...opts,
  };
}

describe('diffFields', () => {
  it('detects added, dropped, altered columns', () => {
    const oldF = [makeField('1', 'e1', 'name', 'name', 'text')];
    const newF = [makeField('1', 'e1', 'name', 'name', 'text', { nullable: false }), makeField('2', 'e1', 'age', 'age', 'integer')];
    const alter = diffFields('t', oldF, newF);
    expect(alter.addedColumns.map((c) => c.physicalName)).toEqual(['age']);
    expect(alter.droppedColumns).toEqual([]);
    expect(alter.alteredColumns.map((c) => c.name)).toEqual(['name']);
  });

  it('detects dropped columns', () => {
    const oldF = [makeField('1', 'e1', 'name', 'name', 'text'), makeField('2', 'e1', 'age', 'age', 'integer')];
    const newF = [makeField('1', 'e1', 'name', 'name', 'text')];
    const alter = diffFields('t', oldF, newF);
    expect(alter.droppedColumns).toEqual(['age']);
  });
});

describe('diffMetadata', () => {
  it('detects added and dropped tables', () => {
    const e1 = makeEntity('e1', 'Customer', 'customer');
    const e2 = makeEntity('e2', 'Item', 'item');
    const oldSnap = { entities: [e1], fieldsByEntity: new Map([['e1', []]]) };
    const newSnap = { entities: [e1, e2], fieldsByEntity: new Map([['e1', []], ['e2', []]]) };
    const diff = diffMetadata(oldSnap, newSnap);
    expect(diff.addedTables.map((t) => t.name)).toEqual(['item']);
    expect(diff.droppedTables).toEqual([]);
  });

  it('detects dropped table', () => {
    const e1 = makeEntity('e1', 'Customer', 'customer');
    const oldSnap = { entities: [e1], fieldsByEntity: new Map([['e1', []]]) };
    const newSnap = { entities: [], fieldsByEntity: new Map() };
    const diff = diffMetadata(oldSnap, newSnap);
    expect(diff.droppedTables).toEqual(['customer']);
  });
});

describe('entityToTableDef', () => {
  it('builds table def with PK', () => {
    const e = makeEntity('e1', 'Customer', 'customer');
    const f = [makeField('1', 'e1', 'id', 'id', 'uuid', { nullable: false }), makeField('2', 'e1', 'name', 'name', 'text')];
    const td = entityToTableDef(e, f);
    expect(td.name).toBe('customer');
    expect(td.primaryKey).toBe('id');
    expect(td.columns.length).toBe(2);
  });
});

describe('StepRunner', () => {
  it('runs steps and tracks status', async () => {
    const runner = new StepRunner('m1', 1, ['s1', 's2']);
    const exec = async (_sql: string) => {};
    const state = await runner.run([{ id: 's1', sql: 'SQL1' }, { id: 's2', sql: 'SQL2' }], exec);
    expect(state.steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('is idempotent: skips completed steps on re-run', async () => {
    const runner = new StepRunner('m1', 1, ['s1', 's2']);
    let calls = 0;
    const exec = async (_sql: string) => { calls++; };
    await runner.run([{ id: 's1', sql: 'SQL1' }, { id: 's2', sql: 'SQL2' }], exec);
    const callsBefore = calls;
    await runner.run([{ id: 's1', sql: 'SQL1' }, { id: 's2', sql: 'SQL2' }], exec);
    expect(calls).toBe(callsBefore); // no new calls
  });

  it('stops on failure and marks step failed', async () => {
    const runner = new StepRunner('m1', 1, ['s1', 's2']);
    const exec = async (sql: string) => {
      if (sql === 'SQL2') throw new Error('boom');
    };
    await expect(runner.run([{ id: 's1', sql: 'SQL1' }, { id: 's2', sql: 'SQL2' }], exec)).rejects.toThrow('boom');
    const state = runner.getState();
    expect(state.steps.find((s) => s.id === 's1')?.status).toBe('completed');
    expect(state.steps.find((s) => s.id === 's2')?.status).toBe('failed');
  });

  it('restores from persisted state', () => {
    const state = { id: 'm1', version: 1, steps: [{ id: 's1', status: 'completed' as const }, { id: 's2', status: 'pending' as const }] };
    const runner = restoreRunner(state);
    expect(runner.getState().steps.length).toBe(2);
    expect(runner.getState().steps[0].status).toBe('completed');
  });
});

describe('soft-delete', () => {
  it('marks field as soft-deleted with renamed physical column', () => {
    const f = makeField('1', 'e1', 'name', 'name', 'text', { required: true, unique: true, nullable: false });
    const sd = softDeleteField(f);
    expect(sd.physicalName).toBe('_deleted_name');
    expect(sd.name).toBe('_deleted_name');
    expect(sd.nullable).toBe(true);
    expect(sd.unique).toBe(false);
    expect(sd.required).toBe(false);
    expect(isSoftDeleted(sd)).toBe(true);
  });

  it('activeFields excludes soft-deleted', () => {
    const f1 = makeField('1', 'e1', 'name', 'name', 'text');
    const f2 = softDeleteField(makeField('2', 'e1', 'age', 'age', 'integer'));
    expect(activeFields([f1, f2]).length).toBe(1);
  });
});