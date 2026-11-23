import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineError, type Context, type Env, type ModelDef, type TenantHandle, type TenantManager } from '../contracts/index.js';
import { PgliteDriver } from '../driver/pglite.js';
import { EnvImpl } from '../orm/env.js';
import { ModelRegistry } from '../orm/registry.js';
import { syncSchema } from '../schema/sync.js';
import { combinedSource, ensureMetadataTables } from '../metadata/store.js';
import { ensureSecurityTables } from '../security/tables.js';
import { ModuleCatalog } from '../modules/catalog.js';
import { ModuleService, ensureModuleTables, installedModuleDefs, type ModuleWarning } from '../modules/service.js';

const TENANT_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
/** Windows device names cannot be used as directory names. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const validTenant = (t: string): boolean => TENANT_RE.test(t) && !RESERVED.test(t);

export interface TenantManagerOptions {
  /** root folder holding one PGlite data dir per tenant; undefined = in-memory (tests) */
  rootDir?: string;
  /** model definitions always present in every tenant (no module bookkeeping); loaded before module models */
  models?: () => Promise<readonly ModelDef[]>;
  /** available modules; each tenant's registry holds the models of the modules installed there */
  catalog?: ModuleCatalog;
  /** called for module warnings (orphan modules at open, orphan columns after upgrades) */
  onWarning?: (tenant: string, warning: ModuleWarning) => void;
}

/** Database-per-tenant (ADR 0001 §5): one PGlite instance + one registry per tenant. */
export class PgliteTenantManager implements TenantManager {
  private readonly open_ = new Map<string, Promise<TenantHandle>>();
  private readonly catalog: ModuleCatalog;

  constructor(private readonly opts: TenantManagerOptions) {
    this.catalog = opts.catalog ?? new ModuleCatalog([]);
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

  async list(): Promise<string[]> {
    if (!this.opts.rootDir) return [...this.open_.keys()];
    const entries = await readdir(this.opts.rootDir, { withFileTypes: true }).catch(() => []);
    return entries.filter((e) => e.isDirectory() && validTenant(e.name)).map((e) => e.name);
  }

  async closeAll(): Promise<void> {
    const handles = await Promise.allSettled(this.open_.values());
    this.open_.clear();
    for (const h of handles) if (h.status === 'fulfilled') await h.value.driver.close();
  }

  private async load(tenant: string): Promise<TenantHandle> {
    let dir: string | undefined;
    if (this.opts.rootDir) {
      dir = join(this.opts.rootDir, tenant);
      await mkdir(dir, { recursive: true });
    }
    const driver = await PgliteDriver.open(dir);
    const registry = new ModelRegistry(combinedSource(driver, installedModuleDefs(driver, this.catalog, this.opts.models)));
    let attach: (h: TenantHandle) => void;
    try {
      await ensureMetadataTables(driver);
      await ensureSecurityTables(driver);
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
    } catch (err) {
      await driver.close(); // release the data dir before a retry reopens it
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
