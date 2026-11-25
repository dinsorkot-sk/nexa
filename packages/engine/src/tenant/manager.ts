import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EngineError, type Context, type Env, type ModelDef, type Registry, type SchemaLockableSqlDriver, type SqlDriver, type TenantHandle, type TenantManager,
} from '../contracts/index.js';
import { PgliteDriver } from '../driver/pglite.js';
import { EnvImpl } from '../orm/env.js';
import { ModelRegistry } from '../orm/registry.js';
import { quoteIdent, syncSchema } from '../schema/sync.js';
import { combinedSource, ensureMetadataTables } from '../metadata/store.js';
import { ensureSecurityTables } from '../security/tables.js';
import { ensureUiTables } from '../ui-meta/tables.js';
import { ModuleCatalog } from '../modules/catalog.js';
import { ModuleService, ensureModuleTables, installedModuleDefs, type ModuleWarning } from '../modules/service.js';

const TENANT_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
/** Windows device names cannot be used as directory names. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
export const validTenant = (t: string): boolean => TENANT_RE.test(t) && !RESERVED.test(t);

/** Options shared by every tenant manager (PGlite and PostgreSQL). */
export interface BaseTenantManagerOptions {
  /** model definitions always present in every tenant (no module bookkeeping); loaded before module models */
  models?: () => Promise<readonly ModelDef[]>;
  /** available modules; each tenant's registry holds the models of the modules installed there */
  catalog?: ModuleCatalog;
  /** called for module warnings (orphan modules at open, orphan columns after upgrades) */
  onWarning?: (tenant: string, warning: ModuleWarning) => void;
}

export interface TenantManagerOptions extends BaseTenantManagerOptions {
  /** root folder holding one PGlite data dir per tenant; undefined = in-memory (tests) */
  rootDir?: string;
}

/**
 * Database-per-tenant (ADR 0001 §5): one database + one registry per tenant. Subclasses provide the
 * database (a PGlite instance, or a PostgreSQL database reached through a connection pool).
 */
export abstract class BaseTenantManager implements TenantManager {
  protected readonly open_ = new Map<string, Promise<TenantHandle>>();
  protected readonly catalog: ModuleCatalog;

  constructor(protected readonly opts: BaseTenantManagerOptions) {
    this.catalog = opts.catalog ?? new ModuleCatalog([]);
  }

  /** Open (creating if needed) the database of a validated tenant name. */
  protected abstract openDriver(tenant: string): Promise<SqlDriver>;
  abstract list(): Promise<string[]>;
  /**
   * Runs the tenant bootstrap (system tables, pending module upgrades, schema sync). PGlite has a single
   * opener per data dir; on a shared server (PgDriver) it runs under the driver's cross-process schema lock,
   * the same lock as withDriverLock, because CREATE TABLE IF NOT EXISTS and upgrades race with other openers.
   */
  protected bootstrapLocked<T>(_tenant: string, driver: SqlDriver, fn: () => Promise<T>): Promise<T> {
    const lockable = driver as Partial<SchemaLockableSqlDriver>;
    return typeof lockable.withSchemaLock === 'function' ? lockable.withSchemaLock.call(driver, fn) as Promise<T> : fn();
  }

  open(tenant: string): Promise<TenantHandle> {
    if (!validTenant(tenant)) return Promise.reject(new EngineError(`Invalid tenant name '${tenant}'`));
    let h = this.open_.get(tenant);
    if (!h) {
      h = this.load(tenant);
      this.open_.set(tenant, h);
      h.catch(() => this.open_.delete(tenant));
    }
    return h;
  }

  /** Open (creating if needed) the tenant and install `modules` plus their dependencies. */
  async create(tenant: string, modules: string[]): Promise<TenantHandle> {
    for (const m of modules) this.catalog.get(m); // fail fast on unknown modules
    const h = await this.open(tenant);
    if (modules.length) await ModuleService.for(h).install(modules);
    return h;
  }

  async closeAll(): Promise<void> {
    const handles = await Promise.allSettled(this.open_.values());
    this.open_.clear();
    for (const h of handles) if (h.status === 'fulfilled') await h.value.driver.close();
  }

  private async load(tenant: string): Promise<TenantHandle> {
    const driver = await this.openDriver(tenant);
    const skip = (what: string) => this.opts.onWarning?.(tenant, { kind: 'orphan_custom', message: `Skipped ${what}` });
    const registry = new ModelRegistry(combinedSource(driver, installedModuleDefs(driver, this.catalog, this.opts.models), skip));
    let attach!: (h: TenantHandle) => void;
    try {
      await this.bootstrapLocked(tenant, driver, async () => {
        await ensureMetadataTables(driver);
        await ensureSecurityTables(driver);
        await ensureUiTables(driver);
        await ensureModuleTables(driver);
        // pending upgrades / new dependencies are applied atomically (with hooks) before the tenant is served
        const onWarning = this.opts.onWarning;
        const opened = await ModuleService.openTenant({
          tenant, db: driver, registry, catalog: this.catalog,
          ...(onWarning ? { onWarning: (w: ModuleWarning) => onWarning(tenant, w) } : {}),
      });
      attach = opened.attach;
      if (!opened.changed) await registry.reload();
      await syncSchema(registry, driver);
      await guardSuperuserId(driver, registry, (message) => this.opts.onWarning?.(tenant, { kind: 'superuser_row', message }));
      });
    } catch (err) {
      await driver.close(); // release the data dir / connections before a retry reopens it
      throw err;
    }
    const handle: TenantHandle = {
      tenant,
      driver,
      registry,
      env: (ctx: { uid: number; companyIds?: number[]; context?: Context }): Env =>
        new EnvImpl({ tenant, registry, db: driver, ...ctx }),
    };
    attach(handle);
    return handle;
  }
}

/** Database-per-tenant on PGlite: one data dir (or in-memory instance) per tenant. */
export class PgliteTenantManager extends BaseTenantManager {
  constructor(protected override readonly opts: TenantManagerOptions) {
    super(opts);
  }

  async list(): Promise<string[]> {
    if (!this.opts.rootDir) return [...this.open_.keys()];
    const entries = await readdir(this.opts.rootDir, { withFileTypes: true }).catch(() => []);
    return entries.filter((e) => e.isDirectory() && validTenant(e.name)).map((e) => e.name);
  }

  protected async openDriver(tenant: string): Promise<SqlDriver> {
    let dir: string | undefined;
    if (this.opts.rootDir) {
      dir = join(this.opts.rootDir, tenant);
      await mkdir(dir, { recursive: true });
    }
    return PgliteDriver.open(dir);
  }
}

/**
 * uid 1 is the superuser. Keep the users sequence past 1 on every open (tenants created before the
 * reservation existed) and report a real user row that already holds id 1: it runs as superuser.
 */
async function guardSuperuserId(driver: SqlDriver, registry: Registry, warn: (message: string) => void): Promise<void> {
  const users = registry.models.get('res.users');
  if (!users?.table) return;
  const t = quoteIdent(users.table);
  await driver.query({
    text: `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${t}), 1))`,
    params: [users.table],
  });
  const [row] = await driver.query<{ login: string }>({ text: `SELECT login FROM ${t} WHERE id = 1`, params: [] });
  if (row) warn(`User '${row.login}' has id 1 and therefore runs as superuser; reassign it`);
}
