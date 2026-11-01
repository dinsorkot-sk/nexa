import type { Kysely } from 'kysely';
import type { TenantDatabase } from './tenant-schema';
import { applyRowFilter } from './row-filter-apply';
import type { FilterNode } from './row-filter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = Kysely<any>;

export interface CrudContext {
  db: AnyDB;
  table: string;
  userId: string | null;
  tenantId: string;
}

export interface ListOptions {
  filter?: FilterNode | null;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export async function listRecords(ctx: CrudContext, opts: ListOptions = {}): Promise<unknown[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = ctx.db.selectFrom(ctx.table).selectAll();
  q = applyRowFilter(q, opts.filter ?? null);
  if (opts.orderBy) q = q.orderBy(opts.orderBy, opts.orderDir ?? 'asc');
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  return q.execute();
}

export async function getRecord(ctx: CrudContext, id: string, idColumn = 'id'): Promise<unknown | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await ctx.db.selectFrom(ctx.table).selectAll().where(idColumn, '=', id).executeTakeFirst();
  return row ?? null;
}

export async function createRecord(ctx: CrudContext, data: Record<string, unknown>): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.db.insertInto(ctx.table).values(data).execute();
  const id = data.id ?? data[Object.keys(data)[0]];
  return getRecord(ctx, String(data.id ?? ''));
}

export async function updateRecord(ctx: CrudContext, id: string, data: Record<string, unknown>, idColumn = 'id'): Promise<unknown | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.db.updateTable(ctx.table).set(data).where(idColumn, '=', id).execute();
  return getRecord(ctx, id, idColumn);
}

export async function deleteRecord(ctx: CrudContext, id: string, idColumn = 'id'): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.db.deleteFrom(ctx.table).where(idColumn, '=', id).execute();
}

/** Write an audit log entry within the same transaction (caller passes tx db). */
export async function writeAuditLog(
  db: AnyDB,
  entry: { tenantId: string; entity: string; recordId: string; action: 'create' | 'update' | 'delete'; userId: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null },
): Promise<void> {
  await db.insertInto('audit_log').values({
    id: crypto.randomUUID(),
    tenant_id: entry.tenantId,
    entity: entry.entity,
    record_id: entry.recordId,
    action: entry.action,
    user_id: entry.userId,
    before_json: entry.before ? JSON.stringify(entry.before) : null,
    after_json: entry.after ? JSON.stringify(entry.after) : null,
  }).execute();
}