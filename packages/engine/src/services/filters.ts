import { AccessError, ValidationError, type Domain, type Env } from '../contracts/index.js';
import { compileDomain, compileOrder } from '../domain/compile.js';
import type { EnvImpl } from '../orm/env.js';
import { assertSystem, positiveInt, tenantDriver } from './common.js';
import { ensureDataTransferTables, modelMeta } from './data-transfer.js';

/** Saved search filters (ir.filters-like). `shared` filters (no owner) are managed by administrators only. */
export interface SavedFilterInput {
  name: string;
  model: string;
  domain?: Domain;
  context?: Record<string, unknown>;
  sort?: string | null;
  /** true = visible to everyone (admin only); false = private to the caller */
  shared?: boolean;
  isDefault?: boolean;
}
export interface SavedFilter {
  id: number; name: string; model: string; domain: Domain; context: Record<string, unknown>;
  sort: string | null; user_id: number | null; is_default: boolean;
}

const MAX_JSON = 20_000;
const CONTEXT_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

interface Row { id: number | string; name: string; model: string; domain: Domain; context: Record<string, unknown>; sort: string | null; user_id: number | string | null; is_default: boolean }
const toFilter = (r: Row): SavedFilter => ({
  id: Number(r.id), name: r.name, model: r.model, domain: r.domain, context: r.context, sort: r.sort,
  user_id: r.user_id === null ? null : Number(r.user_id), is_default: r.is_default,
});

export class SavedFilterService {
  constructor(private readonly env: Env) {}

  private validate(input: Partial<SavedFilterInput>, model: string): { name?: string; domain?: Domain; context?: Record<string, unknown>; sort?: string | null } {
    const meta = modelMeta(this.env, model);
    const out: { name?: string; domain?: Domain; context?: Record<string, unknown>; sort?: string | null } = {};
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new ValidationError('Filter name must contain 1 to 120 characters');
      out.name = input.name.trim();
    }
    if (input.domain !== undefined) {
      if (!Array.isArray(input.domain) || JSON.stringify(input.domain).length > MAX_JSON) throw new ValidationError('Invalid filter domain');
      try {
        compileDomain((this.env as EnvImpl).registry, meta, input.domain, [], 't', undefined, this.env.context.lang);
      } catch (error) {
        throw new ValidationError(`Invalid filter domain: ${error instanceof Error ? error.message.slice(0, 200) : 'malformed'}`);
      }
      out.domain = input.domain;
    }
    if (input.context !== undefined) {
      const c = input.context;
      if (typeof c !== 'object' || c === null || Array.isArray(c) || JSON.stringify(c).length > MAX_JSON || Object.keys(c).some((k) => !CONTEXT_KEY.test(k))) {
        throw new ValidationError('Invalid filter context');
      }
      out.context = c;
    }
    if (input.sort !== undefined) {
      if (input.sort !== null) {
        if (typeof input.sort !== 'string' || input.sort.length > 200) throw new ValidationError('Invalid filter sort');
        try { compileOrder(meta, input.sort, 't', this.env.context.lang); } catch { throw new ValidationError('Invalid filter sort'); }
      }
      out.sort = input.sort === null || input.sort.trim() === '' ? null : input.sort.trim();
    }
    return out;
  }

  async create(input: SavedFilterInput): Promise<number> {
    const v = this.validate(input, input.model);
    if (v.name === undefined) throw new ValidationError('Filter name is required');
    await this.env.model(input.model).checkAccess('read');
    if (input.shared) await assertSystem(this.env);
    const owner = input.shared ? null : this.env.uid;
    return this.env.transaction(async (env) => {
      await ensureDataTransferTables(env);
      if (input.isDefault) await this.clearDefault(env, input.model, owner);
      const [row] = await uniqueDefault(() => tenantDriver(env).query<{ id: number }>({
        text: `INSERT INTO nx_filter(name, model, user_id, domain, context, sort, is_default, create_uid)
          VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) RETURNING id`,
        params: [v.name, input.model, owner, JSON.stringify(v.domain ?? []), JSON.stringify(v.context ?? {}), v.sort ?? null, !!input.isDefault, env.uid],
      }));
      return Number(row!.id);
    });
  }

  /** Own and shared filters of a model (own first). */
  async list(model: string): Promise<SavedFilter[]> {
    modelMeta(this.env, model);
    await this.env.model(model).checkAccess('read');
    await ensureDataTransferTables(this.env);
    const rows = await tenantDriver(this.env).query<Row>({
      text: `SELECT id, name, model, domain, context, sort, user_id, is_default FROM nx_filter
        WHERE model = $1 AND (user_id = $2 OR user_id IS NULL) ORDER BY user_id NULLS LAST, name, id`,
      params: [model, this.env.uid],
    });
    return rows.map(toFilter);
  }

  /** The caller's default filter for a model, else the shared default. */
  async defaultFor(model: string): Promise<SavedFilter | null> {
    return (await this.list(model)).find((f) => f.is_default) ?? null;
  }

  async update(id: number, patch: Partial<Omit<SavedFilterInput, 'model' | 'shared'>>): Promise<void> {
    const current = await this.owned(id);
    const v = this.validate(patch, current.model);
    await this.env.transaction(async (env) => {
      if (patch.isDefault) await this.clearDefault(env, current.model, current.user_id);
      await uniqueDefault(() => tenantDriver(env).query({
        text: `UPDATE nx_filter SET name = COALESCE($2, name), domain = COALESCE($3::jsonb, domain), context = COALESCE($4::jsonb, context),
          sort = CASE WHEN $5 THEN $6 ELSE sort END, is_default = COALESCE($7, is_default), write_date = now() WHERE id = $1`,
        params: [id, v.name ?? null, v.domain ? JSON.stringify(v.domain) : null, v.context ? JSON.stringify(v.context) : null,
          v.sort !== undefined, v.sort ?? null, patch.isDefault ?? null],
      }));
    });
  }

  async remove(id: number): Promise<void> {
    await this.owned(id);
    await tenantDriver(this.env).query({ text: `DELETE FROM nx_filter WHERE id = $1`, params: [id] });
  }

  /** Own filter, or a shared one for administrators. Others' private filters are indistinguishable from missing ones. */
  private async owned(id: number): Promise<SavedFilter> {
    positiveInt(id, 'filter id');
    await ensureDataTransferTables(this.env);
    const [row] = await tenantDriver(this.env).query<Row>({
      text: `SELECT id, name, model, domain, context, sort, user_id, is_default FROM nx_filter WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      params: [id, this.env.uid],
    });
    if (!row) throw new AccessError('Filter is unavailable');
    const filter = toFilter(row);
    if (filter.user_id === null) await assertSystem(this.env);
    return filter;
  }

  private async clearDefault(env: Env, model: string, owner: number | null): Promise<void> {
    await tenantDriver(env).query({
      text: `UPDATE nx_filter SET is_default = false WHERE model = $1 AND user_id IS NOT DISTINCT FROM $2 AND is_default`,
      params: [model, owner],
    });
  }
}

/** The partial unique index allows one default per (model, owner); a concurrent winner surfaces as a validation error. */
async function uniqueDefault<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ValidationError('Another default filter was set at the same time; retry');
    throw error;
  }
}
