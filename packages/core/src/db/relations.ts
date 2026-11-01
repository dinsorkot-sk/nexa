import type { MetaRelation, MetaEntity, MetaField } from '@nexa/types';
import type { TableDef, ColumnDef } from './dialect';

/** Generate a junction table definition for an N:N relation. */
export function generateJunctionTable(entity: MetaEntity, relation: MetaRelation): TableDef {
  const name = relation.junctionTable ?? `${entity.tableName}_${relation.targetEntity.toLowerCase()}`;
  const columns: ColumnDef[] = [
    { name: 'id', logicalType: 'uuid', nullable: false, physicalName: 'id' },
    { name: `${entity.name.toLowerCase()}_id`, logicalType: 'uuid', nullable: false, physicalName: `${entity.name.toLowerCase()}_id` },
    { name: `${relation.targetEntity.toLowerCase()}_id`, logicalType: 'uuid', nullable: false, physicalName: `${relation.targetEntity.toLowerCase()}_id` },
  ];
  return { name, columns, primaryKey: 'id' };
}

/** Evaluate a computed field formula against a record. Formula references fields by name. */
export function computeFormula(formula: string, record: Record<string, unknown>): unknown {
  // Simple, safe-ish evaluation: build a function with record keys as params.
  const keys = Object.keys(record);
  const values = Object.values(record);
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return ${formula};`);
    return fn(...values);
  } catch {
    return null;
  }
}

/** Apply cascade rule name. */
export function cascadeAction(cascade: MetaRelation['cascade']): 'restrict' | 'cascade' | 'setNull' {
  return cascade ?? 'restrict';
}