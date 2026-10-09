import { afterEach, describe, expect, it } from 'vitest';
import {
  createDb,
  createTenantContext,
  definitionRepository,
  DefinitionConflictError,
  DefinitionNotFoundError,
  moduleRepository,
  runMigrations,
  SYSTEM_TENANT_ID,
} from '../src/index';
import { tenants } from '../src/schema';
import type { DbHandle } from '../src/client';

const handles: DbHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const ctx = createTenantContext(SYSTEM_TENANT_ID);
  await moduleRepository(handle, ctx).create({ id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] });
  const defs = definitionRepository(handle, ctx);
  await defs.createEntity('fleet', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {} });
  await defs.createAction('fleet', { id: 'notify', name: 'notify', label: 'Notify', kind: 'notification', config: { to: 'ops@example.com', subject: 'Hi', body: 'created' } } as never);
  return defs;
}

const automationInput = {
  id: 'on-created', name: 'On created', enabled: true,
  trigger: { type: 'record' as const, entityId: 'vehicle', operation: 'created' as const },
  actions: [{ actionId: 'notify', input: {} }],
};

describe('automation definitions', () => {
  it('stores an automation, audits it, and lists runs of a delivery log', async () => {
    const defs = await setup();
    const created = await defs.createAutomation('fleet', automationInput as never);
    expect(created.enabled).toBe(true);
    expect((await defs.listAutomations('fleet')).map((a) => a.id)).toEqual(['on-created']);

    const updated = await defs.updateAutomation('fleet', 'on-created', { enabled: false });
    expect(updated.enabled).toBe(false);
    await expect(defs.updateAutomation('fleet', 'ghost', { enabled: true })).rejects.toThrow(DefinitionNotFoundError);
  });

  it('rejects an automation referencing an unknown action or entity', async () => {
    const defs = await setup();
    await expect(defs.createAutomation('fleet', { ...automationInput, actions: [{ actionId: 'ghost', input: {} }] } as never)).rejects.toThrow(DefinitionConflictError);
    await expect(defs.createAutomation('fleet', { ...automationInput, trigger: { type: 'record', entityId: 'ghost', operation: 'created' } } as never)).rejects.toThrow(DefinitionConflictError);
  });

  it('deletes an automation', async () => {
    const defs = await setup();
    await defs.createAutomation('fleet', automationInput as never);
    await defs.deleteAutomation('fleet', 'on-created');
    expect(await defs.listAutomations('fleet')).toEqual([]);
  });
});
