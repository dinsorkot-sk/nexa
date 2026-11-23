import type { Context, Env, Recordset, Registry, SqlDriver } from '../contracts/index.js';
import { RecordsetImpl } from './recordset.js';

/** Odoo convention: uid 1 is the superuser (__system__) and always runs in superuser mode. */
export const SUPERUSER_ID = 1;

/** Per-user security facts, loaded lazily once per env family (see security/access.ts). */
export interface SecurityHolder {
  promise?: Promise<unknown>;
}

/** Record cache: model -> id -> column values. */
export class RecordCache {
  private readonly data = new Map<string, Map<number, Record<string, unknown>>>();

  get(model: string, id: number): Record<string, unknown> | undefined {
    return this.data.get(model)?.get(id);
  }

  set(model: string, id: number, values: Record<string, unknown>): void {
    let m = this.data.get(model);
    if (!m) this.data.set(model, (m = new Map()));
    m.set(id, { ...m.get(id), ...values });
  }

  invalidate(model?: string, ids?: readonly number[]): void {
    if (!model) return this.data.clear();
    if (!ids) return void this.data.delete(model);
    const m = this.data.get(model);
    for (const id of ids) m?.delete(id);
  }
}

export interface EnvInit {
  tenant: string;
  uid: number;
  companyIds?: number[];
  context?: Context;
  su?: boolean;
  registry: Registry;
  db: SqlDriver;
  cache?: RecordCache;
  security?: SecurityHolder;
}

/**
 * Execution environment. Envs are meant to be short-lived (one per request/job): the cache
 * only sees writes made through this env and its derivatives (sudo/withContext/transaction).
 * Writes from other envs or raw SQL are not visible to an already-populated cache.
 */
export class EnvImpl implements Env {
  readonly tenant: string;
  readonly uid: number;
  readonly companyIds: number[];
  readonly context: Context;
  readonly su: boolean;
  readonly registry: Registry;
  readonly db: SqlDriver;
  readonly cache: RecordCache;
  readonly security: SecurityHolder;

  constructor(init: EnvInit) {
    this.tenant = init.tenant;
    this.uid = init.uid;
    this.companyIds = init.companyIds ?? [];
    this.context = Object.freeze({ ...init.context });
    this.su = init.su ?? init.uid === SUPERUSER_ID;
    this.registry = init.registry;
    this.db = init.db;
    this.cache = init.cache ?? new RecordCache();
    this.security = init.security ?? {};
  }

  private derive(patch: Partial<EnvInit>): EnvImpl {
    return new EnvImpl({
      tenant: this.tenant, uid: this.uid, companyIds: this.companyIds, context: this.context,
      su: this.su, registry: this.registry, db: this.db, cache: this.cache, security: this.security, ...patch,
    });
  }

  model(name: string): Recordset {
    this.registry.get(name); // throws on unknown model
    return new RecordsetImpl(this, name, []);
  }

  sudo(): Env {
    return this.derive({ su: true });
  }

  withContext(patch: Partial<Context>): Env {
    return this.derive({ context: { ...this.context, ...patch } });
  }

  /**
   * Shares this env's cache. On failure the whole cache is dropped, since values loaded or
   * written inside the rolled-back (sub)transaction may no longer match the database.
   */
  async transaction<T>(fn: (env: Env) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(() => fn(this));
    } catch (err) {
      this.cache.invalidate();
      throw err;
    }
  }
}
