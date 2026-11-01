import type { ModuleDefinition, MetaEntity, MetaField } from '@nexa/types';
import { randomBytes } from 'node:crypto';

function uuid() { return randomBytes(16).toString('hex'); }
const now = () => new Date().toISOString();

function makeEntity(name: string, tableName: string, isSystem = true): MetaEntity {
  return { id: uuid(), name, tableName, version: 1, status: 'published', isSystem, createdAt: now(), updatedAt: now() };
}

function makeField(entityId: string, name: string, logicalType: MetaField['logicalType'], opts: Partial<MetaField> = {}): MetaField {
  return {
    id: uuid(), entityId, name, label: name.charAt(0).toUpperCase() + name.slice(1),
    logicalType, physicalName: name, nullable: true, unique: false, required: false,
    isSystem: true, scale: null, precision: null, length: null, default: null,
    referenceEntity: null, formula: null, deletedAt: null, createdAt: now(), ...opts,
  };
}

export const itemModule: ModuleDefinition = {
  name: 'item',
  version: '1.0.0',
  entities: [],
  fields: [],
  relations: [],
  views: [],
  permissions: [],
  migrations: [],
};

// Build Item + Customer entities
const itemEntity = makeEntity('Item', 'item');
const customerEntity = makeEntity('Customer', 'customer');

const itemFields: MetaField[] = [
  makeField(itemEntity.id, 'id', 'uuid', { nullable: false, unique: true, isSystem: true }),
  makeField(itemEntity.id, 'name', 'text', { required: true, nullable: false }),
  makeField(itemEntity.id, 'sku', 'text', { unique: true }),
  makeField(itemEntity.id, 'price', 'decimal', { scale: 2, precision: 12 }),
  makeField(itemEntity.id, 'stock', 'integer'),
];

const customerFields: MetaField[] = [
  makeField(customerEntity.id, 'id', 'uuid', { nullable: false, unique: true, isSystem: true }),
  makeField(customerEntity.id, 'name', 'text', { required: true, nullable: false }),
  makeField(customerEntity.id, 'email', 'text', { unique: true }),
  makeField(customerEntity.id, 'phone', 'text'),
];

itemModule.entities = [itemEntity];
itemModule.fields = [...itemFields];
// customer as separate module entry; combine into one module for simplicity
const customerModuleEntity = customerEntity;
itemModule.entities.push(customerModuleEntity);
itemModule.fields.push(...customerFields);

export const standardModules: ModuleDefinition[] = [itemModule];