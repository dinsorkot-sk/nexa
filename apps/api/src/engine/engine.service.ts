import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  AccessError, ModuleCatalog, ModuleService, PgliteTenantManager, SUPERUSER_ID, ValidationError, activeLangCodes, baseModule, demoModules,
  withUserContext, type Env, type ModuleManifest, type TenantHandle,
} from '@nexa/engine';
import { loadEngineConfig, type EngineConfig } from './config';

/** The demo modules are available for tenants configured to install them. */
export const MODULES: ModuleManifest[] = [baseModule, ...demoModules];

/**
 * Owns the per-tenant engine instances. Only tenants listed in NEXA_TENANTS can be opened; a listed
 * tenant is created (with NEXA_MODULES installed) on first use.
 */
@Injectable()
export class EngineService implements OnModuleDestroy {
  private readonly logger = new Logger('Engine');
  readonly config: EngineConfig = loadEngineConfig();
  private readonly manager = new PgliteTenantManager({
    ...(this.config.dataDir ? { rootDir: this.config.dataDir } : {}),
    catalog: new ModuleCatalog(MODULES),
    onWarning: (tenant, w) => this.logger.warn(`[${tenant}] ${w.message}`),
  });
  private readonly ready = new Map<string, Promise<TenantHandle>>();

  tenant(name: string): Promise<TenantHandle> {
    if (!this.config.tenants.has(name)) return Promise.reject(new AccessError(`Unknown tenant '${name}'`));
    let p = this.ready.get(name);
    if (!p) {
      p = this.prepare(name);
      this.ready.set(name, p);
      p.catch(() => this.ready.delete(name));
    }
    return p;
  }

  /**
   * Environment of an authenticated user, carrying the user's language and time zone (res.users
   * lang / tz) in its context. Never the superuser: uid 1 is internal only.
   */
  async env(tenant: string, uid: number): Promise<Env> {
    if (!Number.isInteger(uid) || uid <= SUPERUSER_ID) throw new AccessError('Invalid user');
    const h = await this.tenant(tenant);
    const env = h.env({ uid });
    if (env.su) throw new AccessError('Invalid user');
    // fail early for unknown/archived users (loads the security context once)
    await env.model('res.users').checkAccess('read');
    return withUserContext(env);
  }

  /**
   * Applies explicit request preferences on top of the user's: `lang` must be an active language and
   * `tz` an IANA time zone known to the runtime. Unset values keep the user's preferences.
   */
  async withRequestContext(env: Env, context: { lang?: string | undefined; tz?: string | undefined } = {}): Promise<Env> {
    const patch: Record<string, string> = {};
    if (context.lang !== undefined) {
      if (!(await activeLangCodes(env)).includes(context.lang)) throw new ValidationError(`Language '${context.lang}' is not active`);
      patch.lang = context.lang;
    }
    if (context.tz !== undefined) {
      if (!validTimeZone(context.tz)) throw new ValidationError(`Unknown time zone '${context.tz}'`);
      patch.tz = context.tz;
    }
    return Object.keys(patch).length ? env.withContext(patch) : env;
  }

  private async prepare(name: string): Promise<TenantHandle> {
    const h = await this.manager.open(name);
    const svc = ModuleService.for(h);
    const installed = new Set((await svc.list()).filter((m) => m.state !== 'uninstalled').map((m) => m.name));
    const missing = this.config.modules.filter((m) => !installed.has(m));
    if (missing.length) {
      this.logger.log(`[${name}] installing ${missing.join(', ')}`);
      await svc.install(missing);
    }
    return h;
  }

  async onModuleDestroy(): Promise<void> {
    await this.manager.closeAll();
  }
}

function validTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
