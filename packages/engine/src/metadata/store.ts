import {
  EngineError, ValidationError, type FieldDef, type FieldType, type ModelDef, type OnDelete, type ResolvedModel,
  type SqlDriver, type TenantHandle,
} from '../contracts/index.js';
import { compileOrder } from '../domain/compile.js';
import { ModelRegistry, tableName } from '../orm/registry.js';
import { applyMigration, planMigration, type MigrationOp } from '../schema/sync.js';
import { withDriverLock } from '../modules/lock.js';

/** Custom (no-code) names must carry the `x_` prefix so they never clash with module names. */
const CUSTOM_MODEL_RE = /^x_[a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const CUSTOM_FIELD_RE = /^x_[a-z0-9_]+$/;
const FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'char', 'text', 'html', 'integer', 'float', 'monetary', 'boolean', 'date', 'datetime', 'selection', 'json', 'binary',
  'many2one', 'one2many', 'many2many',
]);
const ON_DELETES: ReadonlySet<OnDelete> = new Set<OnDelete>(['cascade', 'set null', 'restrict']);

/** Engine-owned metadata tables; created at tenant open. */
export async function ensureMetadataTables(db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_model (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, "order" TEXT,
        create_date TIMESTAMP NOT NULL DEFAULT now())`, params: [],
    });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_field (
        id SERIAL PRIMARY KEY, model TEXT NOT NULL, name TEXT NOT NULL, ttype TEXT NOT NULL, string TEXT, help TEXT,
        required BOOLEAN NOT NULL DEFAULT false, readonly BOOLEAN NOT NULL DEFAULT false,
        "index" BOOLEAN NOT NULL DEFAULT false, "unique" BOOLEAN NOT NULL DEFAULT false,
        default_value JSONB, selection JSONB, comodel TEXT, inverse_name TEXT, relation_table TEXT, ondelete TEXT,
        create_date TIMESTAMP NOT NULL DEFAULT now(), UNIQUE (model, name))`, params: [],
    });
  });
}

interface ModelRow { name: string; description: string | null; order: string | null }
interface FieldRow {
  model: string; name: string; ttype: FieldType; string: string | null; help: string | null;
  required: boolean; readonly: boolean; index: boolean; unique: boolean;
  default_value: unknown; selection: [string, string][] | null; comodel: string | null;
  inverse_name: string | null; relation_table: string | null; ondelete: OnDelete | null;
}

function rowToField(r: FieldRow): FieldDef {
  const f: FieldDef = { type: r.ttype };
  if (r.string !== null) f.string = r.string;
  if (r.help !== null) f.help = r.help;
  if (r.required) f.required = true;
  if (r.readonly) f.readonly = true;
  if (r.index) f.index = true;
  if (r.unique) f.unique = true;
  if (r.default_value !== null && r.default_value !== undefined) f.default = r.default_value;
  if (r.selection) f.selection = r.selection.map(([v, l]) => [v, l] as const);
  if (r.comodel !== null) f.comodel = r.comodel;
  if (r.inverse_name !== null) f.inverseName = r.inverse_name;
  if (r.relation_table !== null) f.relationTable = r.relation_table;
  if (r.ondelete !== null) f.ondelete = r.ondelete;
  return f;
}

/**
 * Read nx_model/nx_field into ModelDefs (origin 'custom'). Custom models come first; fields on
 * models not in nx_model become extensions (`extends: [name]`) appended after module defs.
 */
export async function loadCustomDefs(db: SqlDriver): Promise<ModelDef[]> {
  const models = await db.query<ModelRow>({ text: `SELECT name, description, "order" FROM nx_model ORDER BY id`, params: [] });
  const fields = await db.query<FieldRow>({
    text: `SELECT model, name, ttype, string, help, required, readonly, "index", "unique", default_value, selection,
      comodel, inverse_name, relation_table, ondelete FROM nx_field ORDER BY id`, params: [],
  });
  const byModel = new Map<string, Record<string, FieldDef>>();
  for (const r of fields) {
    let fs = byModel.get(r.model);
    if (!fs) byModel.set(r.model, (fs = {}));
    fs[r.name] = rowToField(r);
  }
  const custom = new Set(models.map((m) => m.name));
  const out: ModelDef[] = models.map((m) => ({
    name: m.name, origin: 'custom', fields: byModel.get(m.name) ?? {},
    ...(m.description !== null ? { description: m.description } : {}),
    ...(m.order !== null ? { order: m.order } : {}),
  }));
  for (const [model, fs] of byModel) {
    if (!custom.has(model)) out.push({ name: model, extends: [model], origin: 'custom', fields: fs });
  }
  return out;
}

/**
 * Registry source combining module definitions with the tenant's custom metadata.
 * Custom extensions or relational fields that target models no longer present (e.g. the module
 * defining them became an orphan) are skipped and reported via `onSkip`, so the tenant still opens.
 */
export function combinedSource(
  db: SqlDriver, moduleDefs: () => Promise<readonly ModelDef[]>, onSkip?: (what: string) => void,
): () => Promise<ModelDef[]> {
  return async () => {
    const custom = await loadCustomDefs(db);
    const mods = await moduleDefs();
    // custom models first so module-independent; extensions of module models after module defs
    const customModels = custom.filter((d) => !d.extends);
    const known = new Set([...mods.map((d) => d.name), ...customModels.map((d) => d.name)]);
    const keep: ModelDef[] = [];
    for (const d of [...customModels, ...custom.filter((x) => x.extends)]) {
      if (d.extends && !known.has(d.name)) {
        onSkip?.(`custom fields on missing model '${d.name}'`);
        continue;
      }
      const fields = Object.fromEntries(Object.entries(d.fields).filter(([n, f]) => {
        if (!f.comodel || known.has(f.comodel)) return true;
        onSkip?.(`custom field '${d.name}.${n}' (target '${f.comodel}' missing)`);
        return false;
      }));
      keep.push({ ...d, fields });
    }
    return [...mods, ...keep];
  };
}

export interface CustomModelInput {
  name: string;
  description?: string;
  order?: string;
  fields?: Record<string, FieldDef>;
}

export interface DestructiveOptions {
  /** must be true: removing custom fields/models drops columns/tables and their data */
  allowDestructive: boolean;
}

function validateField(model: string, name: string, f: FieldDef): void {
  if (!CUSTOM_FIELD_RE.test(name)) throw new ValidationError(`Custom field '${model}.${name}' must match ${CUSTOM_FIELD_RE}`);
  if (!FIELD_TYPES.has(f.type)) throw new ValidationError(`Unknown field type '${String(f.type)}'`);
  if (f.relationTable !== undefined || f.column1 !== undefined || f.column2 !== undefined) {
    throw new ValidationError(`Custom field '${model}.${name}' cannot choose its relation table or columns`);
  }
  if (typeof f.default === 'function' || f.compute || f.related || f.depends) {
    throw new ValidationError(`Custom field '${model}.${name}' cannot use code (default function, compute, related)`);
  }
  if (f.ondelete !== undefined && !ON_DELETES.has(f.ondelete)) throw new ValidationError(`Invalid ondelete '${String(f.ondelete)}'`);
  if (f.selection && !f.selection.every((p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string'))) {
    throw new ValidationError(`Invalid selection for '${model}.${name}'`);
  }
}

/**
 * No-code metadata service. Each change runs in one transaction: write nx_* rows, build the new
 * registry, migrate the schema; only after commit is the new registry swapped in. Any failure
 * rolls back the rows and DDL and keeps the previous registry.
 */
export class MetadataStore {
  constructor(private readonly db: SqlDriver, private readonly registry: ModelRegistry) {}

  static for(handle: TenantHandle): MetadataStore {
    if (!(handle.registry instanceof ModelRegistry)) throw new EngineError('Tenant registry does not support metadata changes');
    return new MetadataStore(handle.driver, handle.registry);
  }

  async createModel(input: CustomModelInput, afterInsert?: (tx: SqlDriver) => Promise<void>): Promise<void> {
    if (!CUSTOM_MODEL_RE.test(input.name)) throw new ValidationError(`Custom model '${input.name}' must match ${CUSTOM_MODEL_RE}`);
    const table = tableName(input.name);
    if (table.length > 63) throw new ValidationError(`Custom model '${input.name}' produces a table name longer than 63 characters`);
    if (!this.registry.models.has(input.name) && [...this.registry.models.values()].some((m) => m.table === table)) {
      throw new ValidationError(`Custom model '${input.name}' conflicts with an existing table name`);
    }
    const fields = input.fields ?? {};
    for (const [n, f] of Object.entries(fields)) validateField(input.name, n, f);
    await this.change(async (tx) => {
      const dup = await tx.query({ text: `SELECT 1 FROM nx_model WHERE name = $1`, params: [input.name] });
      if (dup.length || this.registry.models.has(input.name)) throw new ValidationError(`Model '${input.name}' already exists`);
      await tx.query({
        text: `INSERT INTO nx_model (name, description, "order") VALUES ($1, $2, $3)`,
        params: [input.name, input.description ?? null, input.order ?? null],
      });
      for (const [n, f] of Object.entries(fields)) await this.insertField(tx, input.name, n, f);
      await afterInsert?.(tx);
    });
  }

  async addField(model: string, name: string, def: FieldDef): Promise<void> {
    validateField(model, name, def);
    await this.change(async (tx) => {
      if (!this.registry.models.has(model)) throw new ValidationError(`Unknown model '${model}'`);
      if (this.registry.get(model).fields.has(name)) throw new ValidationError(`Field '${model}.${name}' already exists`);
      await this.insertField(tx, model, name, def);
    });
  }

  async removeField(model: string, name: string, opts: DestructiveOptions): Promise<void> {
    let table: string | null = null;
    await this.change(async (tx) => {
      // resolve the table inside the transaction, from the registry as it stands now
      table = this.registry.models.get(model)?.table ?? null;
      const del = await tx.query({ text: `DELETE FROM nx_field WHERE model = $1 AND name = $2 RETURNING id`, params: [model, name] });
      if (!del.length) throw new ValidationError(`No custom field '${model}.${name}'`);
      if (!table) throw new ValidationError(`Model '${model}' has no table`);
    }, opts, (op) => op.kind === 'drop_column' && op.table === table && op.column === name);
  }

  async removeModel(name: string, opts: DestructiveOptions): Promise<void> {
    const table = this.registry.models.get(name)?.table ?? tableName(name);
    await this.change(async (tx) => {
      const del = await tx.query({ text: `DELETE FROM nx_model WHERE name = $1 RETURNING id`, params: [name] });
      if (!del.length) throw new ValidationError(`No custom model '${name}'`);
      const refs = await tx.query<{ model: string; name: string }>({
        text: `SELECT model, name FROM nx_field WHERE comodel = $1 AND model <> $1 ORDER BY model, name`, params: [name],
      });
      if (refs.length) {
        throw new ValidationError(`Model '${name}' is still referenced by ${refs.map((r) => `${r.model}.${r.name}`).join(', ')}`);
      }
      await tx.query({ text: `DELETE FROM nx_field WHERE model = $1`, params: [name] });
    }, opts, (op) => op.kind === 'drop_table' && op.table === table, [table]);
  }

  async list(): Promise<ModelDef[]> {
    return loadCustomDefs(this.db);
  }

  private async insertField(tx: SqlDriver, model: string, name: string, f: FieldDef): Promise<void> {
    if (f.comodel && f.comodel !== model && !this.registry.models.has(f.comodel)) {
      const known = await tx.query({ text: `SELECT 1 FROM nx_model WHERE name = $1`, params: [f.comodel] });
      if (!known.length) throw new ValidationError(`Field '${model}.${name}' references unknown model '${f.comodel}'`);
    }
    await tx.query({
      text: `INSERT INTO nx_field (model, name, ttype, string, help, required, readonly, "index", "unique",
        default_value, selection, comodel, inverse_name, relation_table, ondelete)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15)`,
      params: [
        model, name, f.type, f.string ?? null, f.help ?? null, !!f.required, !!f.readonly, !!f.index, !!f.unique,
        f.default === undefined ? null : JSON.stringify(f.default),
        f.selection ? JSON.stringify(f.selection) : null,
        f.comodel ?? null, f.inverseName ?? null, f.relationTable ?? null, f.ondelete ?? null,
      ],
    });
  }

  /**
   * Run `mutate`, rebuild the registry from the (uncommitted) metadata and migrate the schema.
   * Destructive ops are applied only when they match `target` and the caller passed allowDestructive;
   * unrelated destructive drift in the database is left untouched.
   */
  private async change(
    mutate: (tx: SqlDriver) => Promise<void>,
    opts?: DestructiveOptions,
    target?: (op: MigrationOp) => boolean,
    dropTables?: string[],
  ): Promise<void> {
    if (target && opts?.allowDestructive !== true) {
      throw new EngineError('Removing custom metadata drops data; pass { allowDestructive: true }');
    }
    // shared with ModuleService so module and metadata changes never interleave
    await withDriverLock(this.db, () => this.changeLocked(mutate, opts, target, dropTables));
  }

  private async changeLocked(
    mutate: (tx: SqlDriver) => Promise<void>,
    opts?: DestructiveOptions,
    target?: (op: MigrationOp) => boolean,
    dropTables?: string[],
  ): Promise<void> {
    const next = await this.db.transaction(async (tx) => {
      await mutate(tx);
      const models: Map<string, ResolvedModel> = await this.registry.build();
      // reject metadata that would break queries later (e.g. an invalid default order)
      for (const m of models.values()) if (m.def.origin === 'custom' && m.table) compileOrder(m, undefined);
      const plan = await planMigration(models, tx, { dropTables });
      const ops = plan.ops.filter((o) => !o.destructive || (target?.(o) ?? false));
      await applyMigration({ ...plan, ops }, tx, { allowDestructive: opts?.allowDestructive === true });
      return models;
    });
    this.registry.swap(next);
  }
}
