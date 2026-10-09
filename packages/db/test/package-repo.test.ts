import { afterEach, describe, expect, it } from 'vitest';
import { createDb, createTenantContext, moduleRepository, packageRepository, runMigrations, SYSTEM_TENANT_ID } from '../src/index';
import { metadataDefinitions, tenants } from '../src/schema';
import type { DbHandle } from '../src/client';
import type { ModulePackage } from '@nexa/meta';

const handles: DbHandle[] = [];
afterEach(async () => { await Promise.all(handles.splice(0).map((handle) => handle.close())); });

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const ctx = createTenantContext(SYSTEM_TENANT_ID);
  const modulesRepo = moduleRepository(handle, ctx);
  await modulesRepo.create({ id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] });
  const defs = { entities: [{ id: 'vehicle', moduleId: 'fleet', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] };
  return { handle, ctx, modulesRepo, defs };
}

function asPackage(payload: unknown): ModulePackage {
  return payload as ModulePackage;
}

describe('module package export/import/upgrade', () => {
  it('exports a validated package with module and definitions, then imports it as a new module', async () => {
    const { handle, ctx, defs } = await setup();
    const packages = packageRepository(handle, ctx);
    // Insert one entity definition directly for export.
    await handle.db.insert(metadataDefinitions).values({ tenantId: SYSTEM_TENANT_ID, moduleId: 'fleet', kind: 'entity', id: 'vehicle', definition: defs.entities[0]! });
    const pkg = await packages.exportPackage('fleet');
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet', version: '1.0.0' });
    expect(pkg.entities.map((entity) => entity.id)).toEqual(['vehicle']);

    const imported = await packages.importPackage({ ...pkg, manifest: { ...pkg.manifest, moduleId: 'fleet-copy' }, module: { ...pkg.module, id: 'fleet-copy' } });
    expect(imported.module.id).toBe('fleet-copy');
    await expect(packages.importPackage({ ...pkg, manifest: { ...pkg.manifest, moduleId: 'fleet-copy' }, module: { ...pkg.module, id: 'fleet-copy' } })).rejects.toThrow(/already exists/);
    await expect(packages.exportPackage('ghost')).rejects.toThrow(/Module not found/);
  });

  it('upgrades a draft module only with a strictly greater version, replacing definitions atomically', async () => {
    const { handle, ctx } = await setup();
    const packages = packageRepository(handle, ctx);
    const base = {
      manifest: { formatVersion: 1 as const, moduleId: 'fleet', version: '1.0.0', dependencies: [], exportedAt: new Date().toISOString() },
      module: { id: 'fleet', tenantId: SYSTEM_TENANT_ID, owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0', description: '', status: 'draft', settings: {}, dependencies: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } as never,
      entities: [{ id: 'vehicle', moduleId: 'fleet', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] as never,
    };
    await expect(packages.upgradePackage(asPackage({ ...base, manifest: { ...base.manifest, version: '1.0.0' }, module: { ...base.module, version: '1.0.0' } }))).rejects.toThrow(/must be greater/);
    await expect(packages.upgradePackage(asPackage({ ...base, manifest: { ...base.manifest, version: '0.9.0' }, module: { ...base.module, version: '0.9.0' } }))).rejects.toThrow(/must be greater/);
    const upgraded = await packages.upgradePackage(asPackage({ ...base, manifest: { ...base.manifest, version: '1.1.0' }, module: { ...base.module, version: '1.1.0' } }));
    expect(upgraded.version).toBe('1.1.0');
    const after = await moduleRepository(handle, ctx).get('fleet');
    expect(after?.version).toBe('1.1.0');
  });
});
