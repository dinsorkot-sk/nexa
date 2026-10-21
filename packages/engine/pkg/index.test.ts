import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '@nexa/meta';
import { ModulePackageSchema } from '@nexa/meta';
import { buildPackage, compareVersions, isUpgrade, templateToPackage } from './index';

describe('version and package helpers', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('detects upgrades strictly', () => {
    expect(isUpgrade('1.0.0', '1.0.1')).toBe(true);
    expect(isUpgrade('1.0.1', '1.0.0')).toBe(false);
    expect(isUpgrade('1.0.0', '1.0.0')).toBe(false);
  });

  it('builds a package with a v1 manifest and export timestamp', () => {
    const module: ModuleDefinition = {
      id: 'fleet',
      tenantId: 'tenant-1',
      owner: { id: 'user-1', type: 'user' },
      name: 'fleet',
      description: '',
      version: '1.2.0',
      status: 'draft',
      settings: {},
      dependencies: [{ moduleId: 'core', version: '1.0.0' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const pkg = buildPackage(
      { moduleId: 'fleet', version: '1.2.0', dependencies: [{ moduleId: 'core', version: '1.0.0' }] },
      {
        module,
        entities: [], fields: [], relations: [], views: [], forms: [],
        workflows: [], actions: [], automations: [], reports: [], dashboards: [], permissions: [],
      },
    );
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet', version: '1.2.0' });
    expect(pkg.manifest.dependencies).toEqual([{ moduleId: 'core', version: '1.0.0' }]);
    expect(typeof pkg.manifest.exportedAt).toBe('string');
  });

  it('converts a template into a package with namespaced field ids', () => {
    const template = {
      moduleId: 'inventory',
      name: 'Inventory',
      version: '1.0.0',
      description: 'Products and warehouses',
      entities: [
        {
          id: 'product', name: 'product', label: 'Product', pluralLabel: 'Products', description: 'Stocked goods', settings: {},
          fields: [
            { id: 'sku', name: 'sku', label: 'SKU', type: 'text', options: { required: true, unique: true }, position: 0 },
            { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true }, position: 1 },
          ],
        },
        {
          id: 'warehouse', name: 'warehouse', label: 'Warehouse', pluralLabel: 'Warehouses', description: 'Storage', settings: {},
          fields: [{ id: 'name', name: 'name', label: 'Name', type: 'text', options: {}, position: 0 }],
        },
      ],
      relations: [],
    };
    const pkg = templateToPackage(template, {
      moduleId: 'stock',
      tenantId: 'tenant-1',
      owner: { id: 'user-1', type: 'user' },
      now: '2026-01-01T00:00:00.000Z',
    });
    expect(ModulePackageSchema.safeParse(pkg).success).toBe(true);
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'stock', version: '1.0.0' });
    expect(pkg.module).toMatchObject({
      id: 'stock',
      tenantId: 'tenant-1',
      owner: { id: 'user-1', type: 'user' },
      name: 'Inventory',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(pkg.entities.map((entity) => entity.id)).toEqual(['product', 'warehouse']);
    expect(pkg.entities.map((entity) => entity.moduleId)).toEqual(['stock', 'stock']);
    // A definition id is unique per module, so the field ids carry the entity they belong to.
    expect(pkg.fields.map((field) => field.id)).toEqual(['product.sku', 'product.name', 'warehouse.name']);
    expect(pkg.fields.map((field) => field.entityId)).toEqual(['product', 'product', 'warehouse']);
    // The name a field is shown under is untouched.
    expect(pkg.fields.map((field) => field.name)).toEqual(['sku', 'name', 'name']);
  });

  it('names the module the caller chose, and refuses a malformed template', () => {
    const template = { moduleId: 'crm', name: 'CRM', version: '1.0.0', description: '', entities: [], relations: [] };
    const context = { moduleId: 'sales', tenantId: 'tenant-1', owner: { id: 'user-1', type: 'user' as const }, now: '2026-01-01T00:00:00.000Z' };
    expect(templateToPackage(template, { ...context, name: 'Sales CRM' }).module.name).toBe('Sales CRM');
    expect(templateToPackage(template, context).module.name).toBe('CRM');
    expect(() => templateToPackage({ ...template, version: 'v1' }, context)).toThrow();
  });
});
