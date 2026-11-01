import { Hono } from 'hono';
import { getTenantContext } from '@nexa/core/db';
import { getTenantDb } from './tenant-db';

export function createPdpaRoutes() {
  const r = new Hono();

  // Data export: return all records for a given entity for the requester
  r.get('/export/:entity', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const entityRow = await db.selectFrom('meta_entity').selectAll().where('name', '=', c.req.param('entity')).executeTakeFirst();
    if (!entityRow) return c.json({ error: 'entity not found' }, 404);
    const rows = await db.selectFrom(entityRow.table_name as never).selectAll().execute();
    return c.json({ entity: entityRow.name, data: rows });
  });

  // Erasure: anonymize personal fields (retain audit/tax records with legal justification)
  r.post('/erase/:entity/:id', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const db = getTenantDb(ctx.namespace);
    const entityRow = await db.selectFrom('meta_entity').selectAll().where('name', '=', c.req.param('entity')).executeTakeFirst();
    if (!entityRow) return c.json({ error: 'entity not found' }, 404);
    const fields = await db.selectFrom('meta_field').selectAll().where('entity_id', '=', entityRow.id).execute();
    const personalFields = fields.filter((f) => /name|email|phone|address/i.test(f.name));
    const anon: Record<string, unknown> = {};
    for (const f of personalFields) {
      anon[f.physical_name] = f.logical_type === 'text' ? '[redacted]' : null;
    }
    if (Object.keys(anon).length === 0) return c.json({ error: 'no personal fields to anonymize' }, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).updateTable(entityRow.table_name).set(anon).where('id', '=', c.req.param('id')).execute();
    return c.json({ ok: true, anonymized: Object.keys(anon) });
  });

  return r;
}