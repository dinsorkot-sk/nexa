import { Injectable } from '@nestjs/common';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ExternalIdService, ModuleService, ValidationError, type Env, type TenantHandle } from '@nexa/engine';
import { z } from 'zod';
import { createStudioField, createStudioModel, modelName, studioField, studioModel } from './studio-ops';

/** Built-in starter packs shipped with the API (apps/api/packs/*.json). */
const PACK_DIR = join(__dirname, '..', '..', 'packs');
const PACK_NAME = /^[a-z][a-z0-9_]{0,40}$/;
const RECORD_ID = /^[a-z0-9][a-z0-9_]{0,150}$/;
const MAX_STEPS = 2000;

const recordStep = z.strictObject({
  id: z.string().regex(RECORD_ID),
  model: modelName,
  values: z.record(z.string(), z.unknown()),
  /** keep administrator edits: an existing record is not rewritten on re-apply */
  noupdate: z.boolean().optional(),
  /** one record per target company (needs the `company` parameter) */
  perCompany: z.boolean().optional(),
});
const step = z.union([
  z.strictObject({ model: studioModel }),
  z.strictObject({ field: studioField }),
  z.strictObject({ record: recordStep }),
  z.strictObject({ update: z.strictObject({ model: modelName, target: z.unknown(), values: z.record(z.string(), z.unknown()) }) }),
]);
const packSchema = z.strictObject({
  name: z.string().regex(PACK_NAME),
  version: z.string().max(40),
  title: z.string().max(200),
  description: z.string().max(2000),
  modules: z.array(z.string().max(80)).max(50),
  params: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.strictObject({ model: modelName, label: z.string().max(200) })),
  requires: z.strictObject({ currency: z.string().regex(/^[A-Z][A-Z0-9]{0,7}$/).optional() }).optional(),
  steps: z.array(step).max(MAX_STEPS),
});
export type StarterPack = z.infer<typeof packSchema>;

export const applyPackRequest = z.strictObject({
  params: z.record(z.string(), z.number().int().positive().max(2_147_483_647)).default({}),
});

export interface PackSummary { name: string; version: string; title: string; description: string; modules: string[]; params: StarterPack['params'] }
export interface PackResult {
  pack: string; version: string;
  created: { models: number; fields: number; records: number };
  updated: number; unchanged: number;
}

/**
 * Applies a declarative starter pack with the caller's own rights (a Settings administrator):
 * Studio models and fields go through the same checks as the Studio endpoints, records through
 * the ORM (ACL, record rules, constraints and policy guards apply). Re-applying is idempotent:
 * existing models and fields are kept, records are found again by their external id
 * (`pack_<name>.<id>`, per company `pack_<name>_c<company>.<id>`) and rewritten unless `noupdate`.
 * Each step commits on its own; after a failure, fix the cause and apply again.
 */
@Injectable()
export class PacksService {
  private readonly applyLocks = new Map<string, Promise<void>>();

  async list(): Promise<PackSummary[]> {
    const files = (await readdir(PACK_DIR)).filter((f) => f.endsWith('.json')).sort();
    const packs = await Promise.all(files.map(async (f) => this.parse(await readFile(join(PACK_DIR, f), 'utf8'), f)));
    return packs.map(({ name, version, title, description, modules, params }) => ({ name, version, title, description, modules, params }));
  }

  async load(name: string): Promise<StarterPack> {
    if (!PACK_NAME.test(name)) throw new ValidationError(`Unknown starter pack '${name}'`);
    const file = `${name.replace(/_/g, '-')}.json`;
    if (!(await readdir(PACK_DIR)).includes(file)) throw new ValidationError(`Unknown starter pack '${name}'`);
    const pack = this.parse(await readFile(join(PACK_DIR, file), 'utf8'), file);
    if (pack.name !== name) throw new ValidationError(`Starter pack file '${file}' declares '${pack.name}'`);
    return pack;
  }

  /**
   * `freshEnv` must return a new Env for the caller: Studio steps rebuild the registry, and record
   * steps need an Env that sees the new models and fields.
   */
  async apply(handle: TenantHandle, freshEnv: () => Promise<Env>, pack: StarterPack, params: Record<string, number>): Promise<PackResult> {
    const key = `${handle.tenant}:${pack.name}`;
    const previous = this.applyLocks.get(key) ?? Promise.resolve();
    let complete!: () => void;
    const current = new Promise<void>((resolve) => { complete = resolve; });
    this.applyLocks.set(key, current);
    await previous;
    try {
      return await this.applyLocked(handle, freshEnv, pack, params);
    } finally {
      complete();
      if (this.applyLocks.get(key) === current) this.applyLocks.delete(key);
    }
  }

  private async applyLocked(handle: TenantHandle, freshEnv: () => Promise<Env>, pack: StarterPack, params: Record<string, number>): Promise<PackResult> {
    return this.applyLockedBody(handle, freshEnv, pack, params);
  }

  private async applyLockedBody(handle: TenantHandle, freshEnv: () => Promise<Env>, pack: StarterPack, params: Record<string, number>): Promise<PackResult> {
    let env = await freshEnv();
    await this.checkModules(handle, pack);
    for (const name of Object.keys(params)) if (!(name in pack.params)) throw new ValidationError(`Unknown pack parameter '${name}'`);
    for (const [name, spec] of Object.entries(pack.params)) {
      const id = params[name];
      if (id === undefined) throw new ValidationError(`Pack parameter '${name}' is required (${spec.label})`);
      if ((await env.model(spec.model).search([['id', '=', id]])).ids.length !== 1) {
        throw new ValidationError(`Pack parameter '${name}': no readable '${spec.model}' record ${id}`);
      }
    }
    if (pack.requires?.currency) {
      const companyId = params.company;
      if (companyId === undefined) throw new ValidationError(`Pack '${pack.name}' requires the 'company' parameter`);
      const [company] = await env.model('res.company').browse(companyId).read(['currency_id', 'name']) as { currency_id?: number; name?: string }[];
      if (!company?.currency_id) throw new ValidationError(`Pack '${pack.name}' requires company '${companyId}' to have the '${pack.requires.currency}' currency`);
      const [currency] = await env.model('res.currency').browse(company.currency_id).read(['name']);
      if (currency?.name !== pack.requires.currency) {
        throw new ValidationError(`Pack '${pack.name}' requires currency '${pack.requires.currency}', but company '${company.name ?? companyId}' uses '${String(currency?.name ?? 'unknown')}'`);
      }
    }
    const module = `pack_${pack.name}`;
    const companyModule = params.company !== undefined ? `pack_${pack.name}_c${params.company}` : undefined;
    const result: PackResult = { pack: pack.name, version: pack.version, created: { models: 0, fields: 0, records: 0 }, updated: 0, unchanged: 0 };
    let stale = false;
    const current = async () => { if (stale) { env = await freshEnv(); stale = false; } return env; };

    const resolve = async (value: unknown, path: string): Promise<unknown> => {
      if (Array.isArray(value)) return Promise.all(value.map((v, i) => resolve(v, `${path}[${i}]`)));
      if (value === null || typeof value !== 'object') return value;
      const entries = Object.entries(value);
      if (entries.length === 1) {
        const [key, arg] = entries[0]!;
        if (key === '$param') {
          if (typeof arg !== 'string' || params[arg] === undefined) throw new ValidationError(`${path}: unknown parameter '${String(arg)}'`);
          return params[arg];
        }
        if (key === '$jsonText') return JSON.stringify(await resolve(arg, path));
        if (key === '$ref') return this.ref(await current(), String(arg), module, companyModule, path);
        if (key === '$search') return this.search(await current(), arg, path);
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new ValidationError(`${path}: invalid key '${k}'`);
        out[k] = await resolve(v, `${path}.${k}`);
      }
      return out;
    };

    for (const [index, s] of pack.steps.entries()) {
      const where = `step ${index + 1}`;
      if ('model' in s) {
        const existing = handle.registry.models.get(s.model.name);
        if (existing) {
          if (existing.def.origin !== 'custom') throw new ValidationError(`${where}: '${s.model.name}' exists and is not a custom model`);
          result.unchanged++;
        } else {
          await createStudioModel(handle, s.model);
          result.created.models++; stale = true;
        }
      } else if ('field' in s) {
        const existing = handle.registry.models.get(s.field.model)?.fields.get(s.field.name);
        if (existing) {
          const f = s.field;
          const same = existing.type === f.type && (f.comodel ?? undefined) === (existing.comodel ?? undefined)
            && (f.inverseName ?? undefined) === (existing.inverseName ?? undefined)
            && (f.computeExpr ?? undefined) === (existing.computeExpr ?? undefined)
            && Boolean(f.required) === Boolean(existing.required)
            && JSON.stringify((f.selection ?? []).map(([k]) => k)) === JSON.stringify(((existing.selection as [string, string][] | undefined) ?? []).map(([k]) => k));
          if (!same) throw new ValidationError(`${where}: field '${f.model}.${f.name}' exists with a different definition`);
          result.unchanged++;
        } else {
          await createStudioField(await current(), handle, s.field);
          result.created.fields++; stale = true;
        }
      } else if ('record' in s) {
        const r = s.record;
        const ns = r.perCompany ? companyModule : module;
        if (!ns) throw new ValidationError(`${where}: per-company record '${r.id}' needs the 'company' parameter`);
        const e = await current();
        await e.transaction(async () => {
          const values = await resolve(r.values, `${where} (${r.id})`) as Record<string, unknown>;
          const ids = new ExternalIdService(e);
          const bound = await ids.lookup(ns, r.id);
          const alive = bound && bound.model === r.model
            && (await e.withContext({ activeTest: false }).model(r.model).search([['id', '=', bound.resId]])).ids.length === 1;
          if (bound && alive) {
            if (r.noupdate) { result.unchanged++; return; }
            await e.model(r.model).browse(bound.resId).write(values);
            result.updated++;
            return;
          }
          const created = (await e.model(r.model).create(values)).ids[0]!;
          await ids.bind(ns, r.id, r.model, created, r.noupdate ?? false);
          result.created.records++;
        });
      } else {
        const e = await current();
        await e.transaction(async () => {
          const target = await resolve(s.update.target, `${where} target`);
          if (typeof target !== 'number') throw new ValidationError(`${where}: update target must resolve to a record id`);
          const values = await resolve(s.update.values, where) as Record<string, unknown>;
          const [current] = await e.model(s.update.model).browse(target).read(Object.keys(values));
          if (!current) throw new ValidationError(`${where}: update target ${target} is not readable`);
          if (Object.entries(values).every(([k, v]) => JSON.stringify(current[k] ?? null) === JSON.stringify(v ?? null))) { result.unchanged++; return; }
          await e.model(s.update.model).browse(target).write(values);
          result.updated++;
        });
      }
    }
    return result;
  }

  private parse(text: string, file: string): StarterPack {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ValidationError(`Starter pack '${file}' is not valid JSON`); }
    const parsed = packSchema.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`Starter pack '${file}' is invalid: ${parsed.error.issues[0]?.message ?? 'schema'}`);
    return parsed.data;
  }

  private async checkModules(handle: TenantHandle, pack: StarterPack): Promise<void> {
    const installed = new Set((await ModuleService.for(handle).list()).filter((m) => m.state !== 'uninstalled').map((m) => m.name));
    const missing = pack.modules.filter((m) => !installed.has(m));
    if (missing.length) throw new ValidationError(`Starter pack '${pack.name}' needs the modules: ${missing.join(', ')}`);
  }

  /** `id` = a record of this pack (company scope first), `module.name` = any external id. */
  private async ref(env: Env, raw: string, module: string, companyModule: string | undefined, path: string): Promise<number> {
    const ids = new ExternalIdService(env);
    const candidates: [string, string][] = raw.includes('.')
      ? [[raw.slice(0, raw.indexOf('.')), raw.slice(raw.indexOf('.') + 1)]]
      : [...(companyModule ? [[companyModule, raw] as [string, string]] : []), [module, raw]];
    for (const [m, n] of candidates) {
      const row = await ids.lookup(m, n);
      if (row) {
        if ((await env.withContext({ activeTest: false }).model(row.model).search([['id', '=', row.resId]])).ids.length !== 1) {
          throw new ValidationError(`${path}: reference '${raw}' points to a deleted or unreadable '${row.model}' record`);
        }
        return row.resId;
      }
    }
    throw new ValidationError(`${path}: unknown reference '${raw}'`);
  }

  private async search(env: Env, arg: unknown, path: string): Promise<number> {
    const spec = z.strictObject({ model: modelName, domain: z.array(z.unknown()).max(20) }).safeParse(arg);
    if (!spec.success) throw new ValidationError(`${path}: $search needs { model, domain }`);
    const found = await env.withContext({ activeTest: false }).model(spec.data.model).search(spec.data.domain as never, { limit: 2 });
    if (found.ids.length !== 1) throw new ValidationError(`${path}: $search on '${spec.data.model}' must match exactly one record (found ${found.ids.length})`);
    return found.ids[0]!;
  }
}
