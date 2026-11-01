import { Hono } from 'hono';
import { z } from 'zod';
import { getTenantContext } from '@nexa/core';
import { getTenantDb } from './tenant-db';
import {
  buildZodSchema,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  writeAuditLog,
  parseRowFilter,
  findPermission,
  canPerform,
  readableFields,
  writableFields,
} from '@nexa/core';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '@nexa/core';

export function createCrudRoutes() {
  const r = new Hono();

  async function loadEntity(db: Kysely<TenantDatabase>, name: string) {
    const entity = await db.selectFrom('meta_entity').selectAll().where('name', '=', name).executeTakeFirst();
    if (!entity) return null;
    const fields = await db.selectFrom('meta_field').selectAll().where('entity_id', '=', entity.id).execute();
    const perms = await db.selectFrom('meta_permission').selectAll().where('entity_id', '=', entity.id).execute();
    return { entity, fields, perms };
  }

  r.get('/:entity', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const loaded = await loadEntity(db, c.req.param('entity'));
    if (!loaded) return c.json({ error: 'entity not found' }, 404);
    const { entity, fields, perms } = loaded;
    const role = 'admin'; // TODO: resolve from session
    const perm = findPermission(perms as never, role);
    if (!canPerform(perm, 'read')) return c.json({ error: 'forbidden' }, 403);
    const rf = perm?.rowFilter ? parseRowFilter(perm.rowFilter) : null;
    const rows = await listRecords({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, { filter: rf });
    // field-level read filter
    const readable = readableFields(perm, fields.map((f: { name: string }) => f.name));
    const projected = (rows as Record<string, unknown>[]).map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of readable) out[f] = row[f];
      // always include id
      if (row.id !== undefined) out.id = row.id;
      return out;
    });
    return c.json({ data: projected });
  });

  r.get('/:entity/:id', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const loaded = await loadEntity(db, c.req.param('entity'));
    if (!loaded) return c.json({ error: 'entity not found' }, 404);
    const { entity, fields, perms } = loaded;
    const role = 'admin';
    const perm = findPermission(perms as never, role);
    if (!canPerform(perm, 'read')) return c.json({ error: 'forbidden' }, 403);
    const row = await getRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json({ data: row });
  });

  r.post('/:entity', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const loaded = await loadEntity(db, c.req.param('entity'));
    if (!loaded) return c.json({ error: 'entity not found' }, 404);
    const { entity, fields, perms } = loaded;
    const role = 'admin';
    const perm = findPermission(perms as never, role);
    if (!canPerform(perm, 'create')) return c.json({ error: 'forbidden' }, 403);
    const body = await c.req.json();
    const schema = buildZodSchema(fields as never);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400);
    const data = parsed.data as Record<string, unknown>;
    // audit: before = null
    await createRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, data);
    await writeAuditLog(db, {
      tenantId: ctx.tenant.id,
      entity: entity.name,
      recordId: String(data.id ?? ''),
      action: 'create',
      userId: null,
      before: null,
      after: data,
    });
    return c.json({ data }, 201);
  });

  r.patch('/:entity/:id', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const loaded = await loadEntity(db, c.req.param('entity'));
    if (!loaded) return c.json({ error: 'entity not found' }, 404);
    const { entity, fields, perms } = loaded;
    const role = 'admin';
    const perm = findPermission(perms as never, role);
    if (!canPerform(perm, 'update')) return c.json({ error: 'forbidden' }, 403);
    const id = c.req.param('id');
    const before = await getRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, id);
    const body = await c.req.json();
    const schema = buildZodSchema(fields as never).partial();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400);
    const data = parsed.data as Record<string, unknown>;
    const writable = writableFields(perm, Object.keys(data));
    const filtered: Record<string, unknown> = {};
    for (const k of writable) if (data[k] !== undefined) filtered[k] = data[k];
    await updateRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, id, filtered);
    const after = await getRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, id);
    await writeAuditLog(db, {
      tenantId: ctx.tenant.id,
      entity: entity.name,
      recordId: id,
      action: 'update',
      userId: null,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown> | null,
    });
    return c.json({ data: after });
  });

  r.delete('/:entity/:id', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const loaded = await loadEntity(db, c.req.param('entity'));
    if (!loaded) return c.json({ error: 'entity not found' }, 404);
    const { entity, perms } = loaded;
    const role = 'admin';
    const perm = findPermission(perms as never, role);
    if (!canPerform(perm, 'delete')) return c.json({ error: 'forbidden' }, 403);
    const id = c.req.param('id');
    const before = await getRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, id);
    await deleteRecord({ db, table: entity.table_name, userId: null, tenantId: ctx.tenant.id }, id);
    await writeAuditLog(db, {
      tenantId: ctx.tenant.id,
      entity: entity.name,
      recordId: id,
      action: 'delete',
      userId: null,
      before: before as Record<string, unknown> | null,
      after: null,
    });
    return c.json({ ok: true });
  });

  return r;
}