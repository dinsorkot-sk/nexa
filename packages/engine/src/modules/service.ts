import {
  EngineError, ValidationError, type DataRecord, type Env, type ModelDef, type ModuleManifest, type Registry,
  type ResolvedModel, type SqlDriver, type TenantHandle, type X2ManyCommand,
} from '../contracts/index.js';
import { EnvImpl } from '../orm/env.js';
import { isColumn, type ModelRegistry } from '../orm/registry.js';
import { applyMigration, assertCompatibleMigration, planMigration, quoteIdent, type MigrationOp } from '../schema/sync.js';
import { assertSecurityTablesMayBeDropped } from '../security/last-admin.js';
import { removeModuleSecurity, writeModuleSecurity } from '../security/tables.js';
import { removeModuleUi, writeModuleUi } from '../ui-meta/tables.js';
import { validateViews } from '../ui-meta/views.js';
import { compareVersions, type ModuleCatalog } from './catalog.js';
import { withDriverLock } from './lock.js';

export type ModuleState = 'installed' | 'to_upgrade' | 'uninstalled';

export interface ModuleInfo {
  name: string;
  /** version available in the catalog (the installed version for orphans) */
  version: string;
  /** version recorded in the tenant (null = never installed) */
  installedVersion: string | null;
  state: ModuleState;
  /** installed in the tenant but missing from the catalog: its models are not loaded */
  orphan: boolean;
  summary?: string;
  depends: string[];
}

export interface UninstallOptions {
  /** must be true: uninstalling drops the module's tables/columns and its data */
  allowDestructive: boolean;
}

export interface UpgradeResult {
  /** modules upgraded */
  modules: string[];
  /** new dependencies installed first */
  installed: string[];
  /** `table.column` left in the database but no longer declared (NOT NULL / FKs relaxed, data kept) */
  orphanColumns: string[];
}

export interface ModuleWarning {
  kind: 'orphan_module' | 'orphan_columns' | 'orphan_custom' | 'superuser_row';
  message: string;
  module?: string;
  columns?: string[];
}

const XML_NAME_RE = /^[a-z0-9_]+$/i;

/** Engine-owned module state tables (Odoo ir.module.module / ir.model.data); created at tenant open. */
export async function ensureModuleTables(db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_module (
        name TEXT PRIMARY KEY, version TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('installed', 'to_upgrade', 'uninstalled')),
        install_date TIMESTAMP)`,
      params: [],
    });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_model_data (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
        res_id INTEGER NOT NULL, noupdate BOOLEAN NOT NULL DEFAULT false, UNIQUE (module, name))`,
      params: [],
    });
  });
}

interface ModuleRow { name: string; version: string; state: ModuleState }

async function moduleRows(db: SqlDriver): Promise<ModuleRow[]> {
  return db.query<ModuleRow>({ text: `SELECT name, version, state FROM nx_module ORDER BY name`, params: [] });
}

async function installedRows(db: SqlDriver): Promise<Map<string, string>> {
  return new Map((await moduleRows(db)).filter((r) => r.state !== 'uninstalled').map((r) => [r.name, r.version]));
}

/**
 * Registry source for module definitions: `base` defs (legacy `models` option) followed by the
 * models of installed catalog modules in topological order. Installed modules missing from the
 * catalog (orphans) are skipped. Reads nx_module through `db`, so a call made inside a transaction
 * sees that transaction's uncommitted module state.
 */
export function installedModuleDefs(
  db: SqlDriver, catalog: ModuleCatalog, base?: () => Promise<readonly ModelDef[]>,
): () => Promise<ModelDef[]> {
  return async () => {
    const installed = [...(await installedRows(db)).keys()].filter((n) => catalog.has(n));
    const defs: ModelDef[] = [...(base ? await base() : [])];
    for (const n of catalog.sort(installed)) defs.push(...(catalog.get(n).models ?? []));
    return defs;
  };
}

/** Read-only Registry over a built model map (used for envs inside a module transaction). */
class MapRegistry implements Registry {
  constructor(readonly models: ReadonlyMap<string, ResolvedModel>) {}
  get(name: string): ResolvedModel {
    const m = this.models.get(name);
    if (!m) throw new EngineError(`Unknown model '${name}'`);
    return m;
  }
  reload(): Promise<void> {
    return Promise.reject(new EngineError('Registry cannot be reloaded inside a module operation'));
  }
}

export interface ModuleContext {
  tenant: string;
  db: SqlDriver;
  registry: ModelRegistry;
  catalog: ModuleCatalog;
  onWarning?: (w: ModuleWarning) => void;
}

interface ContextState extends ModuleContext { warnings: ModuleWarning[] }

const contexts = new WeakMap<TenantHandle, ContextState>();

interface DataRow { id: number; name: string; model: string; res_id: number; noupdate: boolean }

interface Plan {
  install: string[];
  /** module -> installed version before the upgrade */
  upgrade: Map<string, string>;
  /** in execution order (dependents first) */
  uninstall: string[];
}

interface Outcome { installed: string[]; upgraded: string[]; uninstalled: string[]; orphanColumns: string[] }

/**
 * Module lifecycle for one tenant. Every operation is one transaction: update nx_module, build the
 * registry, migrate the schema, load data, write security, run hooks; the new registry is swapped
 * in only after commit, so any failure leaves both the database and the registry unchanged.
 * Operations share a per-database lock with MetadataStore.
 */
export class ModuleService {
  private constructor(private readonly ctx: ContextState) {}

  static for(handle: TenantHandle): ModuleService {
    const ctx = contexts.get(handle);
    if (!ctx) throw new EngineError('Tenant was not opened by a module-aware tenant manager');
    return new ModuleService(ctx);
  }

  /**
   * Tenant open (used by the tenant manager before the handle is returned): report orphan modules,
   * then install missing dependencies and upgrade modules whose catalog version is newer, all in one
   * transaction (Odoo `-u`). Returns false when nothing had to change (registry not built yet).
   */
  static async openTenant(ctx: ModuleContext): Promise<{ service: ModuleService; changed: boolean; attach: (h: TenantHandle) => void }> {
    const state: ContextState = { ...ctx, warnings: [] };
    const service = new ModuleService(state);
    for (const [name, version] of await installedRows(ctx.db)) {
      if (ctx.catalog.has(name)) continue;
      service.warn({
        kind: 'orphan_module', module: name,
        message: `Installed module '${name}' (${version}) is not in the catalog; its models are not loaded (use forceForget)`,
      });
    }
    const out = await service.execute((installed) => {
      const known = [...installed.keys()].filter((n) => ctx.catalog.has(n));
      const upgrade = new Map<string, string>();
      for (const n of known) {
        const v = installed.get(n)!;
        const cmp = compareVersions(ctx.catalog.get(n).version, v);
        if (cmp < 0) throw new EngineError(`Module '${n}' is installed at ${v}, newer than catalog version ${ctx.catalog.get(n).version}`);
        if (cmp > 0) upgrade.set(n, v);
      }
      const install = ctx.catalog.withDependencies(known).filter((n) => !installed.has(n));
      return { install, upgrade, uninstall: [] };
    });
    return { service, changed: out !== null, attach: (h) => contexts.set(h, state) };
  }

  get catalog(): ModuleCatalog {
    return this.ctx.catalog;
  }

  /** Warnings raised for this tenant (orphan modules at open, orphan columns after upgrades). */
  get warnings(): readonly ModuleWarning[] {
    return this.ctx.warnings;
  }

  async list(): Promise<ModuleInfo[]> {
    const rows = new Map((await moduleRows(this.ctx.db)).map((r) => [r.name, r]));
    const out: ModuleInfo[] = this.ctx.catalog.manifests.map((m) => {
      const r = rows.get(m.name);
      let state: ModuleState = r?.state ?? 'uninstalled';
      if (r && state === 'installed' && compareVersions(m.version, r.version) > 0) state = 'to_upgrade';
      return {
        name: m.name, version: m.version, installedVersion: r?.version ?? null, state, orphan: false,
        depends: [...m.depends], ...(m.summary !== undefined ? { summary: m.summary } : {}),
      };
    });
    for (const r of rows.values()) {
      if (this.ctx.catalog.has(r.name)) continue;
      out.push({ name: r.name, version: r.version, installedVersion: r.version, state: r.state, orphan: true, depends: [] });
    }
    return out;
  }

  /** Install modules and their missing dependencies (already installed ones are skipped). */
  async install(names: string[]): Promise<string[]> {
    const wanted = this.ctx.catalog.withDependencies(names);
    const out = await this.execute((installed) => ({
      install: wanted.filter((n) => !installed.has(n)), upgrade: new Map(), uninstall: [],
    }));
    return out?.installed ?? [];
  }

  /**
   * Upgrade installed modules to their catalog version, installing new dependencies first:
   * migrate hooks for versions in (installed, new], data re-load (noUpdate respected), security
   * rewrite. Columns the new version no longer declares are kept, but NOT NULL and FKs are relaxed.
   */
  async upgrade(names: string[]): Promise<UpgradeResult> {
    const { catalog } = this.ctx;
    for (const n of names) catalog.get(n);
    const out = await this.execute((installed) => {
      const upgrade = new Map<string, string>();
      for (const n of catalog.sort(names)) {
        const v = installed.get(n);
        if (v === undefined) throw new EngineError(`Module '${n}' is not installed`);
        if (compareVersions(catalog.get(n).version, v) < 0) {
          throw new EngineError(`Module '${n}' is installed at ${v}, newer than catalog version ${catalog.get(n).version}`);
        }
        upgrade.set(n, v);
      }
      const install = catalog.withDependencies(names).filter((n) => !installed.has(n));
      return { install, upgrade, uninstall: [] };
    });
    return { modules: out?.upgraded ?? [], installed: out?.installed ?? [], orphanColumns: out?.orphanColumns ?? [] };
  }

  /**
   * Uninstall modules and every installed module depending on them (dependents first). Drops the
   * tables/columns those modules introduced and deletes their data, so it needs allowDestructive.
   * Refuses when records outside the uninstalled data still reference that data.
   */
  async uninstall(names: string[], opts: UninstallOptions): Promise<string[]> {
    if (opts?.allowDestructive !== true) {
      throw new EngineError('Uninstalling a module drops its tables and data; pass { allowDestructive: true }');
    }
    const { catalog } = this.ctx;
    for (const n of names) {
      if (!catalog.has(n)) throw new EngineError(`Module '${n}' is not in the catalog; use forceForget('${n}') for orphan modules`);
    }
    const out = await this.execute((installed) => {
      for (const n of names) if (!installed.has(n)) throw new EngineError(`Module '${n}' is not installed`);
      return { install: [], upgrade: new Map(), uninstall: catalog.withDependents(names).filter((n) => installed.has(n)).reverse() };
    });
    return out?.uninstalled ?? [];
  }

  /**
   * Forget an orphan module (installed but no longer in the catalog): removes only its bookkeeping
   * (nx_module, nx_model_data, security rows). Its tables, columns and records stay in the database
   * untouched as unmanaged data, since without the manifest the engine cannot safely tell which
   * schema objects it owned.
   */
  async forceForget(name: string): Promise<void> {
    if (this.ctx.catalog.has(name)) throw new EngineError(`Module '${name}' is in the catalog; use uninstall`);
    await withDriverLock(this.ctx.db, () => this.ctx.db.transaction(async (tx) => {
      const del = await tx.query({ text: `DELETE FROM nx_module WHERE name = $1 RETURNING name`, params: [name] });
      if (!del.length) throw new EngineError(`Unknown module '${name}'`);
      await tx.query({ text: `DELETE FROM nx_model_data WHERE module = $1`, params: [name] });
      await removeModuleSecurity(tx, name);
      await removeModuleUi(tx, name);
    }));
    this.ctx.warnings.splice(0, this.ctx.warnings.length, ...this.ctx.warnings.filter((w) => w.module !== name));
  }

  private warn(w: ModuleWarning): void {
    this.ctx.warnings.push(w);
    this.ctx.onWarning?.(w);
  }

  private env(models: ReadonlyMap<string, ResolvedModel>): EnvImpl {
    return new EnvImpl({ tenant: this.ctx.tenant, uid: 1, su: true, registry: new MapRegistry(models), db: this.ctx.db });
  }

  /** Visible modules for data refs: the module itself and its transitive dependencies. */
  private visible(module: string): Set<string> {
    return new Set(this.ctx.catalog.withDependencies([module]));
  }

  private execute(decide: (installed: Map<string, string>) => Plan): Promise<Outcome | null> {
    return withDriverLock(this.ctx.db, () => this.executeLocked(decide));
  }

  private async executeLocked(decide: (installed: Map<string, string>) => Plan): Promise<Outcome | null> {
    const { db, registry, catalog } = this.ctx;
    const result = await db.transaction(async (tx) => {
      const plan = decide(await installedRows(tx));
      if (!plan.install.length && !plan.upgrade.size && !plan.uninstall.length) return null;

      // uninstall: the "old" state comes from the DB-backed build, not the in-memory registry
      let oldModels: Map<string, ResolvedModel> | undefined;
      const deleted = new Map<string, Set<number>>();
      if (plan.uninstall.length) {
        oldModels = await registry.build();
        const oldEnv = this.env(oldModels);
        for (const n of plan.uninstall) await catalog.get(n).hooks?.uninstall?.(oldEnv);
        for (const r of await tx.query<DataRow>({
          text: `SELECT id, name, model, res_id, noupdate FROM nx_model_data WHERE module = ANY($1)`, params: [plan.uninstall],
        })) {
          let s = deleted.get(r.model);
          if (!s) deleted.set(r.model, (s = new Set()));
          s.add(r.res_id);
        }
        for (const n of plan.uninstall) {
          await tx.query({ text: `UPDATE nx_module SET state = 'uninstalled' WHERE name = $1`, params: [n] });
        }
      }
      for (const n of plan.install) {
        await tx.query({
          text: `INSERT INTO nx_module (name, version, state, install_date) VALUES ($1, $2, 'installed', now())
                 ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, state = 'installed', install_date = now()`,
          params: [n, catalog.get(n).version],
        });
      }
      for (const n of plan.upgrade.keys()) {
        await tx.query({ text: `UPDATE nx_module SET version = $2, state = 'installed' WHERE name = $1`, params: [n, catalog.get(n).version] });
      }

      const models = await registry.build();
      let dropTables: string[] = [];
      let drops = new Set<string>();
      if (oldModels) {
        await checkInbound(tx, models, deleted);
        const oldEnv = this.env(oldModels);
        for (const n of plan.uninstall) {
          await unloadData(oldEnv, tx, n);
          await removeModuleSecurity(tx, n);
          await removeModuleUi(tx, n);
        }
        ({ dropTables, drops } = removedSchema(oldModels, models));
        await assertSecurityTablesMayBeDropped(tx, dropTables, [...drops]);
        await dropForeignKeys(tx, dropTables);
      }
      const mig = await planMigration(models, tx, { dropTables });
      assertCompatibleMigration(mig);
      const ops = mig.ops.filter((o) => !o.destructive || isTargeted(o, drops, dropTables));
      await applyMigration({ ...mig, ops }, tx, { allowDestructive: !!oldModels });

      const orphanColumns = plan.upgrade.size ? await relaxOrphanColumns(tx, models, catalog.sort(plan.upgrade.keys()).map((n) => catalog.get(n))) : [];

      const env = this.env(models);
      for (const n of plan.install) await catalog.get(n).hooks?.preInit?.(env);
      for (const n of catalog.sort([...plan.install, ...plan.upgrade.keys()])) {
        const m = catalog.get(n);
        const from = plan.upgrade.get(n);
        if (from !== undefined) {
          const steps = Object.keys(m.hooks?.migrate ?? {})
            .filter((v) => compareVersions(v, from) > 0 && compareVersions(v, m.version) <= 0)
            .sort(compareVersions);
          for (const v of steps) await m.hooks!.migrate![v](env);
        }
        await loadData(env, tx, m, from !== undefined, this.visible(n));
        await writeModuleSecurity(tx, n, m.access ?? [], m.rules ?? []);
        await writeModuleUi(tx, n, models, m.views ?? [], m.actions ?? [], m.menus ?? []);
      }
      // inheriting views of every module must still apply after this change (also catches uninstalled parents)
      await validateViews(env);
      for (const n of plan.install) await catalog.get(n).hooks?.postInit?.(env);
      return {
        models,
        outcome: { installed: plan.install, upgraded: catalog.sort(plan.upgrade.keys()), uninstalled: plan.uninstall, orphanColumns },
      };
    });
    if (!result) return null;
    registry.swap(result.models);
    if (result.outcome.orphanColumns.length) {
      this.warn({
        kind: 'orphan_columns', columns: result.outcome.orphanColumns,
        message: `Columns no longer declared by any field were kept (NOT NULL/FKs relaxed): ${result.outcome.orphanColumns.join(', ')}`,
      });
    }
    return result.outcome;
  }
}

function isTargeted(op: MigrationOp, columns: ReadonlySet<string>, tables: readonly string[]): boolean {
  if (op.kind === 'drop_table') return tables.includes(op.table);
  if (op.kind === 'drop_column') return columns.has(`${op.table}.${op.column}`);
  return false;
}

/**
 * Schema objects present in `old` but not in `next`: model tables, many2many relation tables and
 * columns of surviving tables.
 */
function removedSchema(
  old: ReadonlyMap<string, ResolvedModel>, next: ReadonlyMap<string, ResolvedModel>,
): { dropTables: string[]; drops: Set<string> } {
  const nextTables = new Map<string, ResolvedModel>();
  const nextRelations = new Set<string>();
  for (const m of next.values()) {
    if (m.table) nextTables.set(m.table, m);
    for (const f of m.fields.values()) if (f.type === 'many2many' && f.relationTable && !f.compute && !f.related) nextRelations.add(f.relationTable);
  }
  const relations = new Set<string>();
  const modelTables: string[] = [];
  const drops = new Set<string>();
  for (const m of old.values()) {
    for (const f of m.fields.values()) {
      if (f.type === 'many2many' && f.relationTable && !f.compute && !f.related && !nextRelations.has(f.relationTable)) relations.add(f.relationTable);
    }
    if (!m.table) continue;
    const survivor = nextTables.get(m.table);
    if (!survivor) { modelTables.push(m.table); continue; }
    for (const f of m.fields.values()) {
      if (f.name === 'id' || !isColumn(f)) continue;
      const nf = survivor.fields.get(f.name);
      if (!nf || !isColumn(nf)) drops.add(`${m.table}.${f.name}`);
    }
  }
  return { dropTables: [...[...relations].sort(), ...modelTables.sort()], drops };
}

interface FkRow { conname: string; relname: string; attname?: string }

/** Drop FK constraints held by tables about to be dropped, so FK cycles among them cannot block the drops. */
async function dropForeignKeys(tx: SqlDriver, tables: readonly string[]): Promise<void> {
  if (!tables.length) return;
  const fks = await tx.query<FkRow>({
    text: `SELECT c.conname, t.relname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           WHERE c.contype = 'f' AND n.nspname = current_schema() AND t.relname = ANY($1) ORDER BY t.relname, c.conname`,
    params: [[...tables]],
  });
  for (const fk of fks) {
    await tx.query({ text: `ALTER TABLE ${quoteIdent(fk.relname)} DROP CONSTRAINT ${quoteIdent(fk.conname)}`, params: [] });
  }
}

/**
 * Upgrade: columns on the upgraded modules' tables that no field declares any more are kept (data
 * preserved) but made harmless: NOT NULL dropped and FK constraints removed. Returns `table.column`.
 */
async function relaxOrphanColumns(
  tx: SqlDriver, models: ReadonlyMap<string, ResolvedModel>, manifests: readonly ModuleManifest[],
): Promise<string[]> {
  const tables = new Set<string>();
  for (const m of manifests) for (const d of m.models ?? []) {
    const t = models.get(d.name)?.table;
    if (t) tables.add(t);
  }
  const out: string[] = [];
  for (const table of [...tables].sort()) {
    const model = [...models.values()].find((m) => m.table === table)!;
    const wanted = new Set(['id', ...[...model.fields.values()].filter((f) => isColumn(f)).map((f) => f.name)]);
    const cols = await tx.query<{ column_name: string; is_nullable: string }>({
      text: `SELECT column_name, is_nullable FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
      params: [table],
    });
    for (const c of cols) {
      if (wanted.has(c.column_name)) continue;
      out.push(`${table}.${c.column_name}`);
      if (c.is_nullable === 'NO') {
        await tx.query({ text: `ALTER TABLE ${quoteIdent(table)} ALTER COLUMN ${quoteIdent(c.column_name)} DROP NOT NULL`, params: [] });
      }
      const fks = await tx.query<FkRow>({
        text: `SELECT DISTINCT c.conname, t.relname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
               JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
               WHERE c.contype = 'f' AND n.nspname = current_schema() AND t.relname = $1 AND a.attname = $2`,
        params: [table, c.column_name],
      });
      for (const fk of fks) {
        await tx.query({ text: `ALTER TABLE ${quoteIdent(table)} DROP CONSTRAINT ${quoteIdent(fk.conname)}`, params: [] });
      }
    }
  }
  return out;
}

/** Refuse when surviving records (not part of the deleted data) still reference data being deleted. */
async function checkInbound(
  tx: SqlDriver, models: ReadonlyMap<string, ResolvedModel>, deleted: ReadonlyMap<string, ReadonlySet<number>>,
): Promise<void> {
  for (const [target, idSet] of deleted) {
    if (!models.has(target) || !idSet.size) continue; // model dropped with its table
    const ids = [...idSet];
    for (const r of models.values()) {
      if (!r.table) continue;
      for (const f of r.fields.values()) {
        if (f.comodel !== target || f.compute || f.related) continue;
        let refs: { id: number }[] = [];
        if (f.type === 'many2one' && isColumn(f)) {
          refs = await tx.query<{ id: number }>({
            text: `SELECT id FROM ${quoteIdent(r.table)} WHERE ${quoteIdent(f.name)} = ANY($1) ORDER BY id`, params: [ids],
          });
        } else if (f.type === 'many2many' && f.relationTable) {
          refs = await tx.query<{ id: number }>({
            text: `SELECT ${quoteIdent(f.column1!)} AS id FROM ${quoteIdent(f.relationTable)} WHERE ${quoteIdent(f.column2!)} = ANY($1) ORDER BY 1`,
            params: [ids],
          });
        }
        const own = deleted.get(r.name);
        const outside = refs.map((x) => x.id).filter((id) => !own?.has(id));
        if (outside.length) {
          throw new ValidationError(
            `Cannot uninstall: ${r.name} record(s) ${outside.join(', ')} reference ${target} data of the module through '${f.name}'`,
          );
        }
      }
    }
  }
}

// ---------- data records (Odoo ir.model.data) ----------

function splitXmlId(module: string, xmlId: string): [string, string] {
  const parts = xmlId.split('.');
  const [mod, name] = parts.length === 1 ? [module, parts[0]] : parts.length === 2 ? [parts[0], parts[1]] : ['', ''];
  if (!mod || !XML_NAME_RE.test(name)) throw new ValidationError(`Invalid xmlId '${xmlId}'`);
  return [mod, name];
}

function isRef(v: unknown): v is { ref: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { ref?: unknown }).ref === 'string'
    && Object.keys(v).length === 1;
}

async function lookup(tx: SqlDriver, mod: string, name: string): Promise<DataRow | undefined> {
  const rows = await tx.query<DataRow>({
    text: `SELECT id, name, model, res_id, noupdate FROM nx_model_data WHERE module = $1 AND name = $2`, params: [mod, name],
  });
  return rows[0];
}

/** Replace `{ ref }` values by record ids (many2one) or a `set` command (x2many lists of refs). */
async function resolveValues(
  env: Env, tx: SqlDriver, module: string, rec: DataRecord, visible: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
  const fields = (env as EnvImpl).registry.get(rec.model).fields;
  const resolveId = async (ref: string, comodel: string | undefined): Promise<number> => {
    const [mod, name] = splitXmlId(module, ref);
    if (!visible.has(mod)) {
      throw new ValidationError(`Data '${module}.${rec.xmlId}': reference '${ref}' is not in '${module}' or its dependencies`);
    }
    const row = await lookup(tx, mod, name);
    if (!row) throw new ValidationError(`Data '${module}.${rec.xmlId}': unknown reference '${ref}'`);
    if (comodel && row.model !== comodel) {
      throw new ValidationError(`Data '${module}.${rec.xmlId}': reference '${ref}' is a ${row.model}, expected ${comodel}`);
    }
    return row.res_id;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec.values)) {
    const f = fields.get(k);
    if (!f) throw new ValidationError(`Data '${module}.${rec.xmlId}': unknown field '${rec.model}.${k}'`);
    if (isRef(v)) {
      if (f.type !== 'many2one') throw new ValidationError(`Data '${module}.${rec.xmlId}': '${k}' is not a many2one`);
      out[k] = await resolveId(v.ref, f.comodel);
    } else if (Array.isArray(v) && v.length > 0 && v.every(isRef)) {
      if (f.type !== 'many2many' && f.type !== 'one2many') {
        throw new ValidationError(`Data '${module}.${rec.xmlId}': '${k}' is not an x2many`);
      }
      const ids: number[] = [];
      for (const r of v) ids.push(await resolveId(r.ref, f.comodel));
      out[k] = [{ op: 'set', ids }] satisfies X2ManyCommand[];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Create or update the module's data records by xmlId. On update, records flagged noupdate are left
 * untouched; records the module no longer declares (and not noupdate) are deleted.
 */
async function loadData(env: Env, tx: SqlDriver, m: ModuleManifest, update: boolean, visible: ReadonlySet<string>): Promise<void> {
  const seen = new Set<string>();
  for (const rec of m.data ?? []) {
    const [mod, name] = splitXmlId(m.name, rec.xmlId);
    if (mod !== m.name) throw new ValidationError(`Module '${m.name}' cannot define data '${rec.xmlId}' of another module`);
    if (seen.has(name)) throw new ValidationError(`Data '${m.name}.${name}' declared twice`);
    seen.add(name);
    const existing = await lookup(tx, m.name, name);
    if (existing && existing.model !== rec.model) {
      throw new ValidationError(`Data '${m.name}.${name}' is a ${existing.model}, not ${rec.model}`);
    }
    if (existing && existing.noupdate && update) continue;
    const values = await resolveValues(env, tx, m.name, rec, visible);
    const model = env.model(rec.model);
    if (existing && (await model.search([['id', '=', existing.res_id]])).ids.length) {
      await model.browse(existing.res_id).write(values);
      await tx.query({ text: `UPDATE nx_model_data SET noupdate = $2 WHERE id = $1`, params: [existing.id, !!rec.noUpdate] });
      continue;
    }
    const created = await model.create(values);
    await tx.query({
      text: `INSERT INTO nx_model_data (module, name, model, res_id, noupdate) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (module, name) DO UPDATE SET model = EXCLUDED.model, res_id = EXCLUDED.res_id, noupdate = EXCLUDED.noupdate`,
      params: [m.name, name, rec.model, created.ids[0], !!rec.noUpdate],
    });
  }
  if (!update) return;
  const stale = await tx.query<DataRow>({
    text: `SELECT id, name, model, res_id, noupdate FROM nx_model_data WHERE module = $1 AND NOT noupdate ORDER BY id DESC`,
    params: [m.name],
  });
  for (const r of stale) {
    if (seen.has(r.name)) continue;
    await unlinkRow(env, tx, r);
  }
}

async function unlinkRow(env: Env, tx: SqlDriver, r: DataRow): Promise<void> {
  if ((env as EnvImpl).registry.models.has(r.model)) {
    const rs = await env.model(r.model).search([['id', '=', r.res_id]]);
    await rs.unlink();
  }
  await tx.query({ text: `DELETE FROM nx_model_data WHERE id = $1`, params: [r.id] });
}

/** Delete every record a module created through data (reverse creation order). */
async function unloadData(env: Env, tx: SqlDriver, module: string): Promise<void> {
  const rows = await tx.query<DataRow>({
    text: `SELECT id, name, model, res_id, noupdate FROM nx_model_data WHERE module = $1 ORDER BY id DESC`, params: [module],
  });
  for (const r of rows) await unlinkRow(env, tx, r);
}
