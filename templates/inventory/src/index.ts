/**
 * Inventory template: pure metadata, no domain logic. Applied through the
 * same runtime as user-created modules (package import in Phase 13).
 */
export const inventoryTemplate = {
  moduleId: 'inventory',
  name: 'Inventory',
  version: '1.0.0',
  description: 'Products, warehouses, and stock levels',
  entities: [
    {
      id: 'product', name: 'product', label: 'Product', pluralLabel: 'Products', description: 'Stocked goods', settings: {},
      fields: [
        { id: 'sku', name: 'sku', label: 'SKU', type: 'text', options: { required: true, unique: true }, position: 0 },
        { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true, searchable: true }, position: 1 },
        { id: 'quantity', name: 'quantity', label: 'Quantity', type: 'integer', options: { required: true }, position: 2 },
        { id: 'reorderPoint', name: 'reorderPoint', label: 'Reorder point', type: 'integer', options: {}, position: 3 },
        { id: 'lowStock', name: 'lowStock', label: 'Low stock', type: 'boolean', options: { readonly: true }, position: 4 },
      ],
    },
    {
      id: 'warehouse', name: 'warehouse', label: 'Warehouse', pluralLabel: 'Warehouses', description: 'Storage locations', settings: {},
      fields: [
        { id: 'code', name: 'code', label: 'Code', type: 'text', options: { required: true, unique: true }, position: 0 },
        { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true, searchable: true }, position: 1 },
      ],
    },
  ],
  relations: [
    { id: 'product-warehouse', name: 'product-warehouse', sourceEntityId: 'product', targetEntityId: 'warehouse', type: 'manyToOne' },
  ],
} as const;
