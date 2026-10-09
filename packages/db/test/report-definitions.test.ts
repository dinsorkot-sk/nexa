import { afterEach, describe, expect, it } from 'vitest';
import { createDb, createTenantContext, definitionRepository, DefinitionConflictError, moduleRepository, runMigrations, SYSTEM_TENANT_ID } from '../src/index';
import { tenants } from '../src/schema';
import type { DbHandle } from '../src/client';

const handles: DbHandle[] = [];
afterEach(async () => { await Promise.all(handles.splice(0).map((handle) => handle.close())); });

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const ctx = createTenantContext(SYSTEM_TENANT_ID);
  await moduleRepository(handle, ctx).create({ id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] });
  const defs = definitionRepository(handle, ctx);
  await defs.createEntity('fleet', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {} });
  await defs.createField('fleet', 'vehicle', { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'draft', label: 'D' }] } } as never);
  return defs;
}

describe('report and dashboard definitions', () => {
  it('stores a report and dashboard and rejects unknown field or report references', async () => {
    const defs = await setup();
    await defs.createReport('fleet', { id: 'r1', name: 'R', entityId: 'vehicle', groupBy: ['status'], aggregations: [{ operation: 'count' }] } as never);
    await expect(defs.createReport('fleet', { id: 'r2', name: 'R2', entityId: 'vehicle', aggregations: [{ operation: 'sum', fieldId: 'ghost' }] } as never)).rejects.toThrow(DefinitionConflictError);
    await expect(defs.createReport('fleet', { id: 'r3', name: 'R3', entityId: 'ghost' } as never)).rejects.toThrow(DefinitionConflictError);
    await defs.createDashboard('fleet', { id: 'd1', name: 'D', widgets: [{ id: 'w1', type: 'kpi', reportId: 'r1', title: 'T', layout: { x: 0, y: 0, width: 2, height: 1 } }] } as never);
    await expect(defs.createDashboard('fleet', { id: 'd2', name: 'D2', widgets: [{ id: 'w', type: 'kpi', reportId: 'ghost', title: 'T', layout: { x: 0, y: 0, width: 2, height: 1 } }] } as never)).rejects.toThrow(DefinitionConflictError);
    await expect(defs.deleteReport('fleet', 'r1')).rejects.toThrow(DefinitionConflictError);
    await defs.deleteDashboard('fleet', 'd1');
    await defs.deleteReport('fleet', 'r1');
    expect(await defs.listReports('fleet')).toEqual([]);
  });
});
