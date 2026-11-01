import { Hono } from 'hono';
import { getTenantContext } from '@nexa/core/db';
import { standardModules } from './modules';
import { businessModules } from './business-modules';
import { accountingModule } from './accounting-module';
import { JobRunner } from '@nexa/core/db';
import type { ModuleRegistration } from '@nexa/types';

const runner = new JobRunner();

export function createModuleRoutes() {
  const r = new Hono();

  // List installed modules for current tenant (in-memory registry for now)
  const installed = new Map<string, ModuleRegistration[]>();

  r.get('/available', (c) => {
    const allModules = [...standardModules, ...businessModules, accountingModule];
    return c.json({ data: allModules.map((m) => ({ name: m.name, version: m.version })) });
  });

  r.get('/', (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const mods = installed.get(ctx.tenant.id) ?? [];
    return c.json({ data: mods });
  });

  r.post('/install', async (c) => {
    const ctx = getTenantContext();
    if (!ctx) return c.json({ error: 'no tenant' }, 400);
    const body = await c.req.json<{ name: string }>();
    const allModules = [...standardModules, ...businessModules, accountingModule];
    const mod = allModules.find((m) => m.name === body.name);
    if (!mod) return c.json({ error: 'module not found' }, 404);
    const reg: ModuleRegistration = {
      id: crypto.randomUUID(),
      tenantId: ctx.tenant.id,
      name: mod.name,
      version: mod.version,
      installedAt: new Date().toISOString(),
    };
    const list = installed.get(ctx.tenant.id) ?? [];
    // upgrade if exists
    const idx = list.findIndex((m) => m.name === mod.name);
    if (idx >= 0) list[idx] = reg;
    else list.push(reg);
    installed.set(ctx.tenant.id, list);
    return c.json(reg, 201);
  });

  // Migration dashboard: status per tenant (job runner)
  r.get('/migrations', (c) => {
    const jobs = runner.getJobs();
    return c.json({ data: jobs });
  });

  return r;
}

export { runner };