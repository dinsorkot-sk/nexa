import { describe, it, expect } from 'vitest';
import { computeFormula, generateJunctionTable, cascadeAction } from './relations';

describe('computeFormula', () => {
  it('evaluates arithmetic on record fields', () => {
    expect(computeFormula('price * quantity', { price: 10, quantity: 3 })).toBe(30);
  });
  it('handles missing fields gracefully', () => {
    expect(computeFormula('a + b', { a: 1 })).toBeNull();
  });
});

describe('generateJunctionTable', () => {
  it('creates a junction table def', () => {
    const entity = { id: 'e1', name: 'Order', tableName: 'order', version: 1, status: 'published' as const, isSystem: false, createdAt: '', updatedAt: '' };
    const relation = { id: 'r1', entityId: 'e1', name: 'items', type: 'manyToMany' as const, targetEntity: 'Item', foreignKey: 'item_id', junctionTable: null, cascade: null, createdAt: '' };
    const jt = generateJunctionTable(entity, relation);
    expect(jt.name).toBe('order_item');
    expect(jt.columns.length).toBe(3);
    expect(jt.columns.map((c) => c.physicalName)).toContain('order_id');
    expect(jt.columns.map((c) => c.physicalName)).toContain('item_id');
  });

  it('uses explicit junctionTable name', () => {
    const entity = { id: 'e1', name: 'Order', tableName: 'order', version: 1, status: 'published' as const, isSystem: false, createdAt: '', updatedAt: '' };
    const relation = { id: 'r1', entityId: 'e1', name: 'items', type: 'manyToMany' as const, targetEntity: 'Item', foreignKey: 'item_id', junctionTable: 'order_items', cascade: null, createdAt: '' };
    const jt = generateJunctionTable(entity, relation);
    expect(jt.name).toBe('order_items');
  });
});

describe('cascadeAction', () => {
  it('defaults to restrict', () => {
    expect(cascadeAction(null)).toBe('restrict');
  });
  it('passes through', () => {
    expect(cascadeAction('cascade')).toBe('cascade');
    expect(cascadeAction('setNull')).toBe('setNull');
  });
});