import {
  EngineError, ValidationError, type FieldDef, type FieldType, type ModelDef, type OnDelete, type ResolvedModel,
  type SqlDriver, type TenantHandle,
} from '../contracts/index.js';
import { compileOrder } from '../domain/compile.js';
import { parseExpression } from '../expr/index.js';
import { recompute } from '../orm/compute.js';
import { EnvImpl, SUPERUSER_ID } from '../orm/env.js';
import { ModelRegistry, tableName } from '../orm/registry.js';
import { applyMigration, planMigration, type MigrationOp } from '../schema/sync.js';
import { withDriverLock } from '../modules/lock.js';

/** Custom (no-code) names must carry the `x_` prefix so they never clash with module names. */
const CUSTOM_MODEL_RE = /^x_[a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const CUSTOM_FIELD_RE = /^x_[a-z0-9_]+$/;
const FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'char', 'text', 'html', 'integer', 'float', 'monetary', 'boolean', 'date', 'datetime', 'selection', 'reference', 'json', 'binary',
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
    await tx.query({ text: `ALTER TABLE nx_model ADD COLUMN IF NOT EXISTS expression_hooks JSONB NOT NULL DEFAULT '{}'::jsonb`, params: [] });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_field (
        id SERIAL PRIMARY KEY, model TEXT NOT NULL, name TEXT NOT NULL, ttype TEXT NOT NULL, string TEXT, help TEXT,
        required BOOLEAN NOT NULL DEFAULT false, readonly BOOLEAN NOT NULL DEFAULT false,
        "index" BOOLEAN NOT NULL DEFAULT false, "unique" BOOLEAN NOT NULL DEFAULT false,
        default_value JSONB, selection JSONB, comodel TEXT, inverse_name TEXT, relation_table TEXT, ondelete TEXT,
        create_date TIMESTAMP NOT NULL DEFAULT now(), UNIQUE (model, name))`, params: [],
    });
    // Existing tenant metadata is upgraded additively; older rows keep an empty options object.
    await tx.query({ text: `ALTER TABLE nx_field ADD COLUMN IF NOT EXISTS field_options JSONB NOT NULL DEFAULT '{}'::jsonb`, params: [] });
  });
}

interface ModelRow { name: string; description: string | null; order: string | null; expression_hooks: CustomModelExpressions }
interface FieldRow {
  model: string; name: string; ttype: FieldType; string: string | null; help: string | null;
  required: boolean; readonly: boolean; index: boolean; unique: boolean;
  default_value: unknown; selection: [string, string][] | null; comodel: string | null;
  inverse_name: string | null; relation_table: string | null; ondelete: OnDelete | null;
  field_options: Pick<FieldDef, 'digits' | 'translate' | 'copy' | 'aggregator' | 'currencyField' | 'computeExpr' | 'defaultExpr' | 'depends' | 'store'>;
}

function rowToField(r: FieldRow): FieldDef {
  const f: FieldDef = { type: r.ttype };
  if (r.field_options?.currencyField !== undefined) f.currencyField = r.field_options.currencyField;
  if (r.field_options?.digits !== undefined) f.digits = r.field_options.digits;
  if (r.field_options?.translate !== undefined) f.translate = r.field_options.translate;
  if (r.field_options?.copy !== undefined) f.copy = r.field_options.copy;
  if (r.field_options?.aggregator !== undefined) f.aggregator = r.field_options.aggregator;
  if (r.field_options?.computeExpr !== undefined) f.computeExpr = r.field_options.computeExpr;
  if (r.field_options?.defaultExpr !== undefined) f.defaultExpr = r.field_options.defaultExpr;
  if (r.field_options?.depends !== undefined) f.depends = r.field_options.depends;
  if (r.field_options?.store !== undefined) f.store = r.field_options.store;
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
  const models = await db.query<ModelRow>({ text: `SELECT name, description, "order", expression_hooks FROM nx_model ORDER BY id`, params: [] });
  const fields = await db.query<FieldRow>({
    text: `SELECT model, name, ttype, string, help, required, readonly, "index", "unique", default_value, selection,
      comodel, inverse_name, relation_table, ondelete, field_options FROM nx_field ORDER BY id`, params: [],
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
    ...modelExpressions(m.expression_hooks ?? {}),
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
  expressions?: CustomModelExpressions;
}

export interface CustomModelExpressions {
  onchange?: Record<string, string>;
  constraints?: { name: string; expression: string; fields?: string[]; message?: string }[];
}

export interface DestructiveOptions {
  /** must be true: removing custom fields/models drops columns/tables and their data */
  allowDestructive: boolean;
}

interface MetadataChangeOptions {
  destructive?: DestructiveOptions;
  target?: (op: MigrationOp) => boolean;
  dropTables?: string[];
  initialize?: (tx: SqlDriver, models: Map<string, ResolvedModel>) => Promise<void>;
}

function checkExpression(expression: string, label: string): void {
  if (typeof expression !== 'string' || !expression.trim()) throw new ValidationError(`${label} requires an NX-Expr expression`);
  try {
    parseExpression(expression);
  } catch (error) {
    throw new ValidationError(`${label}: ${error instanceof Error ? error.message : 'Invalid NX-Expr expression'}`);
  }
}

function modelExpressions(input: CustomModelExpressions): CustomModelExpressions {
  const onchange = Object.entries(input.onchange ?? {});
  const constraints = input.constraints ?? [];
  if (onchange.length > 100 || constraints.length > 100) throw new ValidationError('Too many model expressions');
  for (const [name, expression] of onchange) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new ValidationError(`Invalid onchange field '${name}'`);
    checkExpression(expression, `Onchange '${name}'`);
  }
  const names = new Set<string>();
  for (const constraint of constraints) {
    if (!/^[a-z][a-z0-9_]*$/.test(constraint.name) || names.has(constraint.name)) {
      throw new ValidationError(`Duplicate or invalid constraint name '${constraint.name}'`);
    }
    names.add(constraint.name);
    checkExpression(constraint.expression, `Constraint '${constraint.name}'`);
  }
  return {
    ...(onchange.length ? { onchange: Object.fromEntries(onchange) } : {}),
    ...(constraints.length ? { constraints: constraints.map(({ name, expression, fields, message }) => ({ name, expression, fields, message })) } : {}),
  };
}

function validateField(model: string, name: string, f: FieldDef): void {
  if (!CUSTOM_FIELD_RE.test(name)) throw new ValidationError(`Custom field '${model}.${name}' must match ${CUSTOM_FIELD_RE}`);
  if (!FIELD_TYPES.has(f.type)) throw new ValidationError(`Unknown field type '${String(f.type)}'`);
  if (f.relationTable !== undefined || f.column1 !== undefined || f.column2 !== undefined) {
    throw new ValidationError(`Custom field '${model}.${name}' cannot choose its relation table or columns`);
  }
  if (typeof f.default === 'function' || f.compute || f.related || (f.depends && !f.computeExpr)) {
    throw new ValidationError(`Custom field '${model}.${name}' cannot use code (default function, compute, related)`);
  }
  if (f.computeExpr !== undefined) checkExpression(f.computeExpr, `Compute '${model}.${name}'`);
  if (f.defaultExpr !== undefined) {
    if (f.default !== undefined || f.computeExpr !== undefined) throw new ValidationError('A default expression cannot coexist with a literal default or compute expression');
    checkExpression(f.defaultExpr, `Default '${model}.${name}'`);
  }
  if (f.store !== undefined && (typeof f.store !== 'boolean' || f.computeExpr === undefined)) {
    throw new ValidationError('Store requires a compute expression');
  }
  if (f.depends && (!Array.isArray(f.depends) || f.depends.length > 100 || f.depends.some((dep) => typeof dep !== 'string'))) {
    throw new ValidationError('Invalid compute dependencies');
  }
  if (f.selectionAdd) throw new ValidationError(`Custom field '${model}.${name}' cannot extend a selection`);
  if (f.translate !== undefined && (typeof f.translate !== 'boolean' || (f.translate && !['char', 'text', 'html'].includes(f.type)))) throw new ValidationError('Invalid translate flag');
  if (f.translate && f.unique) throw new ValidationError('Translated fields cannot be unique');
  if (f.copy !== undefined && typeof f.copy !== 'boolean') throw new ValidationError('Invalid copy flag');
  if (f.aggregator !== undefined && !['sum', 'avg', 'min', 'max', 'count', 'count_distinct'].includes(f.aggregator)) throw new ValidationError('Invalid aggregator');
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
  constructor(private readonly db: SqlDriver, private readonly registry: ModelRegistry, private readonly tenant = '') {}

  static for(handle: TenantHandle): MetadataStore {
    if (!(handle.registry instanceof ModelRegistry)) throw new EngineError('Tenant registry does not support metadata changes');
    return new MetadataStore(handle.driver, handle.registry, handle.tenant);
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
    const expressions = modelExpressions(input.expressions ?? {});
    await this.change(async (tx) => {
      const dup = await tx.query({ text: `SELECT 1 FROM nx_model WHERE name = $1`, params: [input.name] });
      if (dup.length || this.registry.models.has(input.name)) throw new ValidationError(`Model '${input.name}' already exists`);
      await tx.query({
        text: `INSERT INTO nx_model (name, description, "order", expression_hooks) VALUES ($1, $2, $3, $4::jsonb)`,
        params: [input.name, input.description ?? null, input.order ?? null, JSON.stringify(expressions)],
      });
      for (const [n, f] of Object.entries(fields)) await this.insertField(tx, input.name, n, f);
      await afterInsert?.(tx);
    });
  }

  async setModelExpressions(model: string, input: CustomModelExpressions): Promise<void> {
    const expressions = modelExpressions(input);
    await this.change(async (tx) => {
      const rows = await tx.query({
        text: `UPDATE nx_model SET expression_hooks = $2::jsonb WHERE name = $1 RETURNING id`,
        params: [model, JSON.stringify(expressions)],
      });
      if (!rows.length) throw new ValidationError(`Unknown custom model '${model}'`);
    });
  }

  async addField(model: string, name: string, def: FieldDef): Promise<void> {
    validateField(model, name, def);
    await this.change(async (tx) => {
      if (!this.registry.models.has(model)) throw new ValidationError(`Unknown model '${model}'`);
      if (this.registry.get(model).fields.has(name)) throw new ValidationError(`Field '${model}.${name}' already exists`);
      await this.insertField(tx, model, name, def);
    }, {
      initialize: def.computeExpr && def.store
        ? (tx, models) => this.initializeStoredExpression(tx, models, model, name)
        : undefined,
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
    }, { destructive: opts, target: (op) => op.kind === 'drop_column' && op.table === table && op.column === name });
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
    }, { destructive: opts, target: (op) => op.kind === 'drop_table' && op.table === table, dropTables: [table] });
  }

  async list(): Promise<ModelDef[]> {
    return loadCustomDefs(this.db);
  }

  private async initializeStoredExpression(
    tx: SqlDriver, models: Map<string, ResolvedModel>, model: string, field: string,
  ): Promise<void> {
    const registry = new ModelRegistry(async () => []);
    registry.swap(models);
    const env = new EnvImpl({ tenant: this.tenant, uid: SUPERUSER_ID, registry, db: tx, context: { activeTest: false } });
    let afterId = 0;
    while (true) {
      const records = await env.model(model).search([['id', '>', afterId]], { limit: 250, order: 'id asc' });
      if (!records.ids.length) return;
      await recompute(env, new Map([[model, new Map([[field, new Set(records.ids)]])]]));
      afterId = records.ids[records.ids.length - 1]!;
      env.cache.invalidate();
    }
  }

  private async insertField(tx: SqlDriver, model: string, name: string, f: FieldDef): Promise<void> {
    if (f.comodel && f.comodel !== model && !this.registry.models.has(f.comodel)) {
      const known = await tx.query({ text: `SELECT 1 FROM nx_model WHERE name = $1`, params: [f.comodel] });
      if (!known.length) throw new ValidationError(`Field '${model}.${name}' references unknown model '${f.comodel}'`);
    }
    await tx.query({
      text: `INSERT INTO nx_field (model, name, ttype, string, help, required, readonly, "index", "unique",
        default_value, selection, comodel, inverse_name, relation_table, ondelete, field_options)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16::jsonb)`,
      params: [
        model, name, f.type, f.string ?? null, f.help ?? null, !!f.required, !!f.readonly, !!f.index, !!f.unique,
        f.default === undefined ? null : JSON.stringify(f.default),
        f.selection ? JSON.stringify(f.selection) : null,
        f.comodel ?? null, f.inverseName ?? null, f.relationTable ?? null, f.ondelete ?? null,
        JSON.stringify({
          digits: f.digits, translate: f.translate, copy: f.copy, aggregator: f.aggregator, currencyField: f.currencyField,
          computeExpr: f.computeExpr, defaultExpr: f.defaultExpr, depends: f.depends, store: f.store,
        }),
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
    opts: MetadataChangeOptions = {},
  ): Promise<void> {
    if (opts.target && opts.destructive?.allowDestructive !== true) {
      throw new EngineError('Removing custom metadata drops data; pass { allowDestructive: true }');
    }
    // shared with ModuleService so module and metadata changes never interleave
    await withDriverLock(this.db, () => this.changeLocked(mutate, opts));
  }

  private async changeLocked(
    mutate: (tx: SqlDriver) => Promise<void>,
    { destructive, target, dropTables, initialize }: MetadataChangeOptions,
  ): Promise<void> {
    const next = await this.db.transaction(async (tx) => {
      await mutate(tx);
      const models: Map<string, ResolvedModel> = await this.registry.build();
      // reject metadata that would break queries later (e.g. an invalid default order)
      for (const m of models.values()) if (m.def.origin === 'custom' && m.table) compileOrder(m, undefined);
      const plan = await planMigration(models, tx, { dropTables });
      const ops = plan.ops.filter((o) => !o.destructive || (target?.(o) ?? false));
      await applyMigration({ ...plan, ops }, tx, { allowDestructive: destructive?.allowDestructive === true });
      await initialize?.(tx, models);
      return models;
    });
    this.registry.swap(next);
  }
}
