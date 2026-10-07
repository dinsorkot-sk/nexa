import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { auditLog, metadataDefinitions, records, tenants } from '../src/schema';
import { eq } from 'drizzle-orm';

const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const handles: Array<ReturnType<typeof createDb>> = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values([
    { id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' },
    { id: OTHER_TENANT_ID, slug: 'other', name: 'Other' },
  ]);
  const modulesA = moduleRepository(handle, createTenantContext(SYSTEM_TENANT_ID));
  const modulesB = moduleRepository(handle, createTenantContext(OTHER_TENANT_ID));
  const input = { id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] };
  await modulesA.create(input);
  await modulesB.create(input);
  return {
    handle,
    modulesA,
    defsA: definitionRepository(handle, createTenantContext(SYSTEM_TENANT_ID)),
    defsB: definitionRepository(handle, createTenantContext(OTHER_TENANT_ID)),
  };
}

const vehicle = { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: '', settings: {} };
const driver = { id: 'driver', name: 'driver', label: 'Driver', pluralLabel: 'Drivers', description: '', settings: {} };
const textField = (id: string, name: string) => ({ id, name, label: name, type: 'text' as const, options: {}, position: 0 });

describe('@nexa/db definition repository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  }, 30000);

  it('creates, reads, updates entities and isolates tenants', async () => {
    const { defsA, defsB } = ctx;
    const created = await defsA.createEntity('fleet', vehicle);
    expect(created).toMatchObject({ id: 'vehicle', moduleId: 'fleet' });
    expect(await defsA.getEntity('fleet', 'vehicle')).toEqual(created);
    expect(await defsA.listEntities('fleet')).toHaveLength(1);
    expect(await defsB.getEntity('fleet', 'vehicle')).toBeUndefined();
    expect(await defsB.listEntities('fleet')).toEqual([]);
    await expect(defsB.updateEntity('fleet', 'vehicle', { label: 'x' })).rejects.toBeInstanceOf(DefinitionNotFoundError);

    const updated = await defsA.updateEntity('fleet', 'vehicle', { label: 'Car' });
    expect(updated.label).toBe('Car');
    await expect(defsA.createEntity('fleet', vehicle)).rejects.toBeInstanceOf(DefinitionConflictError);
    await expect(defsA.createEntity('fleet', { ...vehicle, id: 'vehicle2' })).rejects.toThrow(/not unique/);
    await expect(defsA.createEntity('missing', driver)).rejects.toBeInstanceOf(DefinitionNotFoundError);
  });

  it('manages fields and enforces per-entity name uniqueness', async () => {
    const { defsA } = ctx;
    await defsA.createEntity('fleet', vehicle);
    await expect(defsA.createField('fleet', 'ghost', textField('f1', 'plate'))).rejects.toBeInstanceOf(DefinitionNotFoundError);
    const field = await defsA.createField('fleet', 'vehicle', textField('f1', 'plate'));
    expect(field.entityId).toBe('vehicle');
    await expect(defsA.createField('fleet', 'vehicle', textField('f2', 'plate'))).rejects.toThrow(/not unique/);
    expect((await defsA.updateField('fleet', 'f1', { label: 'Plate number' })).label).toBe('Plate number');
    expect(await defsA.listFields('fleet', 'vehicle')).toHaveLength(1);
    await defsA.deleteField('fleet', 'f1');
    expect(await defsA.getField('fleet', 'f1')).toBeUndefined();
  });

  it('rejects dangling references and protects referenced definitions from deletion', async () => {
    const { defsA } = ctx;
    await defsA.createEntity('fleet', vehicle);
    await expect(defsA.createField('fleet', 'vehicle', {
      id: 'owner', name: 'owner', label: 'Owner', type: 'reference', options: { referenceEntityId: 'driver' }, position: 0,
    })).rejects.toThrow(/non-existent entity/);

    await defsA.createEntity('fleet', driver);
    await defsA.createField('fleet', 'vehicle', {
      id: 'owner', name: 'owner', label: 'Owner', type: 'reference', options: { referenceEntityId: 'driver' }, position: 0,
    });
    await expect(defsA.deleteEntity('fleet', 'driver')).rejects.toBeInstanceOf(DefinitionConflictError);

    await defsA.createRelation('fleet', {
      id: 'drives', name: 'drives', sourceEntityId: 'driver', targetEntityId: 'vehicle', type: 'oneToMany', onDelete: 'restrict',
    });
    await expect(defsA.createRelation('fleet', {
      id: 'bad', name: 'bad', sourceEntityId: 'driver', targetEntityId: 'nope', type: 'oneToMany', onDelete: 'restrict',
    })).rejects.toBeInstanceOf(DefinitionConflictError);
    expect((await defsA.updateRelation('fleet', 'drives', { name: 'operates' })).name).toBe('operates');

    await defsA.deleteField('fleet', 'owner');
    await expect(defsA.deleteEntity('fleet', 'driver')).rejects.toThrow(/does not exist/);
    await defsA.deleteRelation('fleet', 'drives');
    await defsA.deleteEntity('fleet', 'driver');
    expect(await defsA.listEntities('fleet')).toHaveLength(1);
  });

  it('refuses to delete an entity that has records', async () => {
    const { defsA, handle } = ctx;
    await defsA.createEntity('fleet', vehicle);
    await handle.db.insert(records).values({ tenantId: SYSTEM_TENANT_ID, moduleId: 'fleet', entityId: 'vehicle', data: {} });
    await expect(defsA.deleteEntity('fleet', 'vehicle')).rejects.toThrow(/has records/);
  });

  it('only allows edits while the module is draft or review', async () => {
    const { defsA, modulesA } = ctx;
    await defsA.createEntity('fleet', vehicle);
    await modulesA.transition('fleet', 'review');
    await defsA.createEntity('fleet', driver);
    await modulesA.transition('fleet', 'published');
    await expect(defsA.createField('fleet', 'vehicle', textField('f1', 'plate'))).rejects.toThrow(/published/);
    await expect(defsA.updateEntity('fleet', 'vehicle', { label: 'x' })).rejects.toBeInstanceOf(DefinitionConflictError);
    await expect(defsA.deleteEntity('fleet', 'driver')).rejects.toBeInstanceOf(DefinitionConflictError);
    expect(await defsA.listEntities('fleet')).toHaveLength(2);
  });

  it('writes audit rows and rolls back failed writes', async () => {
    const { defsA, handle } = ctx;
    await defsA.createEntity('fleet', vehicle);
    await defsA.updateEntity('fleet', 'vehicle', { label: 'Car' });
    await expect(defsA.createField('fleet', 'vehicle', {
      id: 'owner', name: 'owner', label: 'Owner', type: 'reference', options: { referenceEntityId: 'driver' }, position: 0,
    })).rejects.toBeInstanceOf(DefinitionConflictError);

    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.tenantId, SYSTEM_TENANT_ID));
    const actions = audit.map((row) => row.action).filter((action) => action.startsWith('entity.') || action.startsWith('field.'));
    expect(actions.sort()).toEqual(['entity.created', 'entity.updated']);
    const stored = await handle.db.select().from(metadataDefinitions).where(eq(metadataDefinitions.tenantId, SYSTEM_TENANT_ID));
    expect(stored.map((row) => row.kind)).toEqual(['entity']);
  });
});
