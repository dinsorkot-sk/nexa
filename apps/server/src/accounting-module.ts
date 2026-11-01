import type { ModuleDefinition, MetaEntity, MetaField } from '@nexa/types';
import { randomBytes } from 'node:crypto';

function uuid() { return randomBytes(16).toString('hex'); }
const now = () => new Date().toISOString();

function makeEntity(name: string, tableName: string): MetaEntity {
  return { id: uuid(), name, tableName, version: 1, status: 'published', isSystem: true, createdAt: now(), updatedAt: now() };
}

function makeField(entityId: string, name: string, logicalType: MetaField['logicalType'], opts: Partial<MetaField> = {}): MetaField {
  return {
    id: uuid(), entityId, name, label: name.charAt(0).toUpperCase() + name.slice(1),
    logicalType, physicalName: name, nullable: true, unique: false, required: false,
    isSystem: true, scale: null, precision: null, length: null, default: null,
    referenceEntity: null, formula: null, deletedAt: null, createdAt: now(), ...opts,
  };
}

// Journal entry (double-entry)
const journalEntity = makeEntity('JournalEntry', 'journal_entry');
const journalFields = [
  makeField(journalEntity.id, 'id', 'uuid', { nullable: false, unique: true }),
  makeField(journalEntity.id, 'date', 'datetime', { required: true, nullable: false }),
  makeField(journalEntity.id, 'description', 'text'),
  makeField(journalEntity.id, 'debit', 'decimal', { scale: 2, precision: 14 }),
  makeField(journalEntity.id, 'credit', 'decimal', { scale: 2, precision: 14 }),
  makeField(journalEntity.id, 'account', 'text', { required: true, nullable: false }),
];

// Period
const periodEntity = makeEntity('Period', 'period');
const periodFields = [
  makeField(periodEntity.id, 'id', 'uuid', { nullable: false, unique: true }),
  makeField(periodEntity.id, 'name', 'text', { required: true, nullable: false }),
  makeField(periodEntity.id, 'startDate', 'datetime', { required: true, nullable: false }),
  makeField(periodEntity.id, 'endDate', 'datetime', { required: true, nullable: false }),
  makeField(periodEntity.id, 'closed', 'boolean'),
];

export const accountingModule: ModuleDefinition = {
  name: 'accounting',
  version: '1.0.0',
  entities: [journalEntity, periodEntity],
  fields: [...journalFields, ...periodFields],
  relations: [],
  views: [],
  permissions: [],
  migrations: [],
};