import type { MetaEntity, MetaField } from '@nexa/types';
import type { SchemaDiff, TableDef, ColumnDef, TableAlter } from './dialect';

function fieldToColumn(f: MetaField): ColumnDef {
  return {
    name: f.name,
    logicalType: f.logicalType,
    nullable: f.nullable,
    unique: f.unique,
    default: f.default,
    physicalName: f.physicalName,
    precision: f.precision ?? undefined,
    scale: f.scale ?? undefined,
    length: f.length ?? undefined,
  };
}

export function entityToTableDef(entity: MetaEntity, fields: MetaField[]): TableDef {
  return {
    name: entity.tableName,
    columns: fields.map(fieldToColumn),
    primaryKey: fields.find((f) => f.name === 'id')?.physicalName ?? 'id',
  };
}

export function diffFields(tableName: string, oldFields: MetaField[], newFields: MetaField[]): TableAlter {
  const oldMap = new Map(oldFields.map((f) => [f.name, f]));
  const newMap = new Map(newFields.map((f) => [f.name, f]));
  const addedColumns: ColumnDef[] = [];
  const droppedColumns: string[] = [];
  const alteredColumns: { name: string; from: string; to: string }[] = [];

  for (const nf of newFields) {
    const of = oldMap.get(nf.name);
    if (!of) {
      addedColumns.push(fieldToColumn(nf));
    } else {
      const changes: string[] = [];
      if (of.logicalType !== nf.logicalType) changes.push(`type:${of.logicalType}->${nf.logicalType}`);
      if (of.nullable !== nf.nullable) changes.push(`nullable:${of.nullable}->${nf.nullable}`);
      if (of.unique !== nf.unique) changes.push(`unique:${of.unique}->${nf.unique}`);
      if (of.scale !== nf.scale || of.precision !== nf.precision) changes.push('scale/precision changed');
      if (changes.length > 0) {
        alteredColumns.push({ name: nf.physicalName, from: of.logicalType, to: nf.logicalType });
      }
    }
  }
  for (const of of oldFields) {
    if (!newMap.has(of.name)) {
      droppedColumns.push(of.physicalName);
    }
  }
  return { table: tableName, addedColumns, droppedColumns, alteredColumns };
}

export interface MetadataSnapshot {
  entities: MetaEntity[];
  fieldsByEntity: Map<string, MetaField[]>;
}

export function diffMetadata(oldSnap: MetadataSnapshot, newSnap: MetadataSnapshot): SchemaDiff {
  const addedTables: TableDef[] = [];
  const droppedTables: string[] = [];
  const alteredTables: TableAlter[] = [];

  const oldEntityMap = new Map(oldSnap.entities.map((e) => [e.name, e]));
  const newEntityMap = new Map(newSnap.entities.map((e) => [e.name, e]));

  for (const ne of newSnap.entities) {
    const oe = oldEntityMap.get(ne.name);
    if (!oe) {
      const fields = newSnap.fieldsByEntity.get(ne.id) ?? [];
      addedTables.push(entityToTableDef(ne, fields));
    } else {
      const oldFields = oldSnap.fieldsByEntity.get(oe.id) ?? [];
      const newFields = newSnap.fieldsByEntity.get(ne.id) ?? [];
      const alter = diffFields(ne.tableName, oldFields, newFields);
      // attach newTableDef for SQLite rebuild when columns changed
      if (alter.addedColumns.length || alter.droppedColumns.length || alter.alteredColumns.length) {
        alter.newTableDef = entityToTableDef(ne, newFields);
        alteredTables.push(alter);
      }
    }
  }
  for (const oe of oldSnap.entities) {
    if (!newEntityMap.has(oe.name)) {
      droppedTables.push(oe.tableName);
    }
  }
  return { addedTables, droppedTables, alteredTables };
}