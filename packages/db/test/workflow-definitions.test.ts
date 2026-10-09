import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDb,
  createTenantContext,
  definitionRepository,
  DefinitionConflictError,
  moduleRepository,
  runMigrations,
  SYSTEM_TENANT_ID,
} from '../src/index';
import { auditLog, tenants } from '../src/schema';
import type { DbHandle } from '../src/client';

const handles: DbHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup(status: 'draft' | 'published' = 'draft') {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const ctx = createTenantContext(SYSTEM_TENANT_ID);
  await moduleRepository(handle, ctx).create({ id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] });
  const defs = definitionRepository(handle, ctx);
  await defs.createEntity('fleet', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {} });
  await defs.createField('fleet', 'vehicle', { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'draft', label: 'Draft' }, { value: 'done', label: 'Done' }] } } as never);
  if (status === 'published') {
    await moduleRepository(handle, ctx).transition('fleet', 'review');
    await moduleRepository(handle, ctx).transition('fleet', 'published');
  }
  return { handle, defs };
}

const actionInput = {
  id: 'mark-done', name: 'mark-done', label: 'Mark done', kind: 'updateRecord' as const, config: { set: { status: 'done' } },
};

const workflowInput = {
  id: 'lifecycle', name: 'Lifecycle', stateFieldId: 'status',
  states: [
    { id: 'draft', name: 'draft', label: 'Draft', initial: true },
    { id: 'done', name: 'done', label: 'Done', terminal: true },
  ],
  transitions: [{ id: 'finish', from: 'draft', to: 'done', label: 'Finish', actions: [{ actionId: 'mark-done', input: {} }] }],
  entityId: 'vehicle', moduleId: 'fleet',
};

describe('workflow and action definitions', () => {
  it('stores an action and a workflow that reference each other, and audits both', async () => {
    const { handle, defs } = await setup();
    await defs.createAction('fleet', { ...actionInput, moduleId: 'fleet', entityId: 'vehicle' } as never);
    await defs.createWorkflow('fleet', workflowInput as never);
    expect((await defs.listWorkflows('fleet')).map((w) => w.id)).toEqual(['lifecycle']);
    expect((await defs.listActions('fleet')).map((a) => a.id)).toEqual(['mark-done']);
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.tenantId, SYSTEM_TENANT_ID));
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(['action.created', 'workflow.created']));
  });

  it('rejects a workflow that references an action which does not exist', async () => {
    const { defs } = await setup();
    await expect(defs.createWorkflow('fleet', workflowInput as never)).rejects.toThrow(DefinitionConflictError);
  });

  it('rejects workflow definitions once the module is published', async () => {
    const { defs } = await setup('published');
    await expect(defs.createAction('fleet', { ...actionInput, moduleId: 'fleet', entityId: 'vehicle' } as never)).rejects.toThrow(DefinitionConflictError);
  });
});
