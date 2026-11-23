import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineError, type Context, type Env, type ModelDef, type TenantHandle, type TenantManager } from '../contracts/index.js';
import { PgliteDriver } from '../driver/pglite.js';
import { EnvImpl } from '../orm/env.js';
import { ModelRegistry } from '../orm/registry.js';
import { syncSchema } from '../schema/sync.js';
import { combinedSource, ensureMetadataTables } from '../metadata/store.js';

const TENANT_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
/** Windows device names cannot be used as directory names. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const validTenant = (t: string): boolean => TENANT_RE.test(t) && !RESERVED.test(t);

export interface TenantManagerOptions {
  /** root folder holding one PGlite data dir per tenant; undefined = in-memory (tests) */
  rootDir?: string;
  /** model definitions; the module loader (T7) replaces this */
  models: () => Promise<readonly ModelDef[]>;
}

/** Database-per-tenant (ADR 0001 §5): one PGlite instance + one registry per tenant. */
export class PgliteTenantManager implements TenantManager {
  private readonly open_ = new Map<string, Promise<TenantHandle>>();

  constructor(private readonly opts: TenantManagerOptions) {}

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

  /** Module selection is ignored until the module system (T7). */
  async create(tenant: string, _modules: string[]): Promise<TenantHandle> {
    void _modules;
    return this.open(tenant);
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
    const registry = new ModelRegistry(combinedSource(driver, this.opts.models));
    try {
      await ensureMetadataTables(driver);
      await registry.reload();
      await syncSchema(registry, driver);
    } catch (err) {
      await driver.close(); // release the data dir before a retry reopens it
      throw err;
    }
    return {
      tenant,
      driver,
      registry,
      env: (ctx: { uid: number; companyIds?: number[]; context?: Context }): Env =>
        new EnvImpl({ tenant, registry, db: driver, ...ctx }),
    };
  }
}
