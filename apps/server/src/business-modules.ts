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

function buildModule(name: string, entities: { entity: MetaEntity; fields: MetaField[] }[]): ModuleDefinition {
  return {
    name,
    version: '1.0.0',
    entities: entities.map((e) => e.entity),
    fields: entities.flatMap((e) => e.fields),
    relations: [],
    views: [],
    permissions: [],
    migrations: [],
  };
}

// Inventory
const productEntity = makeEntity('Product', 'product');
const productFields = [
  makeField(productEntity.id, 'id', 'uuid', { nullable: false, unique: true }),
  makeField(productEntity.id, 'name', 'text', { required: true, nullable: false }),
  makeField(productEntity.id, 'sku', 'text', { unique: true }),
  makeField(productEntity.id, 'quantity', 'integer'),
  makeField(productEntity.id, 'unitPrice', 'decimal', { scale: 2, precision: 12 }),
];

// Sales
const salesOrderEntity = makeEntity('SalesOrder', 'sales_order');
const salesFields = [
  makeField(salesOrderEntity.id, 'id', 'uuid', { nullable: false, unique: true }),
  makeField(salesOrderEntity.id, 'orderNumber', 'text', { required: true, nullable: false }),
  makeField(salesOrderEntity.id, 'customerId', 'uuid', { referenceEntity: 'Customer' }),
  makeField(salesOrderEntity.id, 'total', 'decimal', { scale: 2, precision: 12 }),
  makeField(salesOrderEntity.id, 'status', 'text'),
];

// Purchase
const purchaseOrderEntity = makeEntity('PurchaseOrder', 'purchase_order');
const purchaseFields = [
  makeField(purchaseOrderEntity.id, 'id', 'uuid', { nullable: false, unique: true }),
  makeField(purchaseOrderEntity.id, 'orderNumber', 'text', { required: true, nullable: false }),
  makeField(purchaseOrderEntity.id, 'supplierId', 'uuid'),
  makeField(purchaseOrderEntity.id, 'total', 'decimal', { scale: 2, precision: 12 }),
  makeField(purchaseOrderEntity.id, 'status', 'text'),
];

export const inventoryModule = buildModule('inventory', [{ entity: productEntity, fields: productFields }]);
export const salesModule = buildModule('sales', [{ entity: salesOrderEntity, fields: salesFields }]);
export const purchaseModule = buildModule('purchase', [{ entity: purchaseOrderEntity, fields: purchaseFields }]);

export const businessModules = [inventoryModule, salesModule, purchaseModule];