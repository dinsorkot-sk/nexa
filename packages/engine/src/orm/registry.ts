import { EngineError, type FieldDef, type ModelDef, type Registry, type ResolvedModel } from '../contracts/index.js';

export type ResolvedField = FieldDef & { name: string; model: string };

/** Fields every non-abstract model gets (Odoo "magic fields"). */
const MAGIC_FIELDS: Record<string, FieldDef> = {
  id: { type: 'integer', readonly: true, string: 'ID' },
  create_date: { type: 'datetime', readonly: true, string: 'Created on' },
  write_date: { type: 'datetime', readonly: true, string: 'Last Updated on' },
  create_uid: { type: 'integer', readonly: true, string: 'Created by' },
  write_uid: { type: 'integer', readonly: true, string: 'Last Updated by' },
};

const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const FIELD_RE = /^[a-z][a-z0-9_]*$/;

export function tableName(model: string): string {
  return model.replace(/\./g, '_');
}

/**
 * Merge model definitions in load order (module dependency order).
 * - def with `name` already defined and listed in `extends` => extension (Odoo _inherit same name)
 * - def with a new `name` and `extends` => copies fields of the parents (mixin / prototype)
 */
export function resolveModels(defs: readonly ModelDef[]): Map<string, ResolvedModel> {
  const merged = new Map<string, ModelDef>();

  for (const def of defs) {
    if (!NAME_RE.test(def.name)) throw new EngineError(`Invalid model name '${def.name}'`);
    for (const f of Object.keys(def.fields)) {
      if (!FIELD_RE.test(f)) throw new EngineError(`Invalid field name '${def.name}.${f}'`);
    }
    const existing = merged.get(def.name);
    if (existing) {
      if (!def.extends?.includes(def.name)) {
        throw new EngineError(`Model '${def.name}' defined twice; use extends: ['${def.name}'] to extend it`);
      }
      merged.set(def.name, {
        ...existing,
        ...def,
        extends: existing.extends,
        origin: existing.origin, // a custom extension must not turn a module model into a custom one
        fields: { ...existing.fields, ...def.fields },
        constraints: [...(existing.constraints ?? []), ...(def.constraints ?? [])],
        onchange: { ...existing.onchange, ...def.onchange },
        methods: { ...existing.methods, ...def.methods },
      });
      continue;
    }
    let base: ModelDef = { ...def, fields: {}, constraints: [], onchange: {}, methods: {} };
    for (const parent of def.extends ?? []) {
      const p = merged.get(parent);
      if (!p) throw new EngineError(`Model '${def.name}' extends unknown model '${parent}'`);
      base = {
        ...base,
        fields: { ...base.fields, ...p.fields },
        constraints: [...(base.constraints ?? []), ...(p.constraints ?? [])],
        onchange: { ...p.onchange, ...base.onchange },
        methods: { ...p.methods, ...base.methods },
      };
    }
    merged.set(def.name, {
      ...base,
      fields: { ...base.fields, ...def.fields },
      constraints: [...(base.constraints ?? []), ...(def.constraints ?? [])],
      onchange: { ...base.onchange, ...def.onchange },
      methods: { ...base.methods, ...def.methods },
    });
  }

  const out = new Map<string, ResolvedModel>();
  for (const [name, def] of merged) {
    const fields = new Map<string, ResolvedField>();
    const all = def.abstract ? def.fields : { ...MAGIC_FIELDS, ...def.fields };
    for (const [fname, f] of Object.entries(all)) {
      if ((f.type === 'many2one' || f.type === 'one2many' || f.type === 'many2many') && !f.comodel) {
        throw new EngineError(`Field '${name}.${fname}' needs a comodel`);
      }
      fields.set(fname, { ...f, name: fname, model: name });
    }
    if (def.table !== undefined && !FIELD_RE.test(def.table)) throw new EngineError(`Invalid table name '${def.table}'`);
    out.set(name, { name, table: def.abstract ? null : (def.table ?? tableName(name)), fields, def });
  }
  for (const m of out.values()) {
    for (const f of m.fields.values()) {
      if (f.comodel && !out.has(f.comodel)) {
        throw new EngineError(`Field '${m.name}.${f.name}' references unknown model '${f.comodel}'`);
      }
    }
  }
  const byTable = new Map<string, string>();
  for (const m of out.values()) {
    if (!m.table) continue;
    const other = byTable.get(m.table);
    if (other) throw new EngineError(`Models '${other}' and '${m.name}' both map to table '${m.table}'`);
    byTable.set(m.table, m.name);
  }
  for (const m of out.values()) {
    for (const f of m.fields.values() as Iterable<ResolvedField>) resolveRelational(out, m, f);
  }
  // A relation table may be shared only by the two sides of one relation (same tables and columns).
  const relations = new Map<string, { key: string; owner: string }>();
  for (const m of out.values()) {
    for (const f of m.fields.values() as Iterable<ResolvedField>) {
      if (f.type !== 'many2many' || !f.relationTable || f.compute || f.related) continue;
      if (byTable.has(f.relationTable) || f.relationTable.startsWith('nx_')) {
        throw new EngineError(`many2many '${m.name}.${f.name}' relation table '${f.relationTable}' clashes with a model or engine table`);
      }
      const coTable = out.get(f.comodel!)!.table!;
      const a = `${m.table}.${f.column1}`;
      const b = `${coTable}.${f.column2}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const seen = relations.get(f.relationTable);
      if (seen && seen.key !== key) {
        throw new EngineError(`many2many '${m.name}.${f.name}' reuses relation table '${f.relationTable}' of ${seen.owner} with different tables/columns`);
      }
      relations.set(f.relationTable, { key, owner: `${m.name}.${f.name}` });
    }
  }
  for (const m of out.values()) {
    for (const f of m.fields.values() as Iterable<ResolvedField>) {
      if (f.related) {
        if (f.compute) throw new EngineError(`Field '${m.name}.${f.name}' cannot be both related and computed`);
        const end = walkPath(out, m, f.related, `${m.name}.${f.name} related`);
        if (end.type !== f.type) {
          throw new EngineError(`Related field '${m.name}.${f.name}' is ${f.type} but '${f.related}' is ${end.type}`);
        }
        f.depends = [f.related];
        if (!f.comodel && end.comodel) f.comodel = end.comodel;
      }
      if (f.compute || f.related) {
        if (MAGIC_FIELDS[f.name]) throw new EngineError(`Field '${m.name}.${f.name}' cannot be computed`);
        if (typeof f.compute === 'string' && !m.def.methods?.[f.compute]) {
          throw new EngineError(`Compute method '${f.compute}' not found on '${m.name}'`);
        }
        if (f.store && (f.type === 'one2many' || f.type === 'many2many')) {
          throw new EngineError(`Stored computed x2many '${m.name}.${f.name}' is not supported`);
        }
        for (const dep of f.depends ?? []) walkPath(out, m, dep, `${m.name}.${f.name} depends`);
      }
    }
  }
  return out;
}

/** Follow a dotted path through relational fields and return the last field. */
export function walkPath(
  models: ReadonlyMap<string, ResolvedModel>, model: ResolvedModel, path: string, what: string,
): ResolvedField {
  const parts = path.split('.');
  let cur = model;
  let f: ResolvedField | undefined;
  for (let i = 0; i < parts.length; i++) {
    f = cur.fields.get(parts[i]) as ResolvedField | undefined;
    if (!f) throw new EngineError(`${what}: unknown field '${cur.name}.${parts[i]}' in '${path}'`);
    if (i < parts.length - 1) {
      if (!f.comodel) throw new EngineError(`${what}: '${cur.name}.${parts[i]}' is not relational in '${path}'`);
      cur = models.get(f.comodel)!;
    }
  }
  return f!;
}

/** Fill many2many relation defaults and check one2many inverses (mutates the resolved field copy). */
function resolveRelational(models: ReadonlyMap<string, ResolvedModel>, m: ResolvedModel, f: ResolvedField): void {
  if (f.compute || f.related) return;
  const co = f.comodel ? models.get(f.comodel)! : undefined;
  if (f.type === 'one2many') {
    const inv = f.inverseName ? co!.fields.get(f.inverseName) : undefined;
    if (!inv || inv.type !== 'many2one' || inv.comodel !== m.name) {
      throw new EngineError(`one2many '${m.name}.${f.name}' needs inverseName = a many2one on '${co!.name}' to '${m.name}'`);
    }
  }
  if (f.type === 'many2many') {
    if (!m.table || !co!.table) throw new EngineError(`many2many '${m.name}.${f.name}' needs concrete models`);
    if (m.table === co!.table && !(f.relationTable && f.column1 && f.column2)) {
      throw new EngineError(`Self many2many '${m.name}.${f.name}' needs relationTable, column1 and column2`);
    }
    f.relationTable ??= `${[m.table, co!.table].sort().join('_')}_rel`;
    f.column1 ??= `${m.table}_id`;
    f.column2 ??= `${co!.table}_id`;
    for (const id of [f.relationTable, f.column1, f.column2]) {
      if (!FIELD_RE.test(id) || id.length > 63) throw new EngineError(`Invalid many2many identifier '${id}' on '${m.name}.${f.name}'`);
    }
    if (f.column1 === f.column2) throw new EngineError(`many2many '${m.name}.${f.name}' columns must differ`);
  }
}

/** A field is a real column when stored and not x2many. */
export function isColumn(f: FieldDef): boolean {
  if (f.type === 'one2many' || f.type === 'many2many') return false;
  if ((f.compute || f.related) && !f.store) return false;
  return true;
}

export class ModelRegistry implements Registry {
  private current = new Map<string, ResolvedModel>();

  constructor(private readonly source: () => Promise<readonly ModelDef[]>) {}

  get models(): ReadonlyMap<string, ResolvedModel> {
    return this.current;
  }

  get(name: string): ResolvedModel {
    const m = this.current.get(name);
    if (!m) throw new EngineError(`Unknown model '${name}'`);
    return m;
  }

  /** Build the new map fully before swapping, so readers never see a half-built registry. */
  async reload(): Promise<void> {
    this.swap(await this.build());
  }

  /** Resolve the source into a new model map without installing it (throws on invalid defs). */
  async build(): Promise<Map<string, ResolvedModel>> {
    return resolveModels(await this.source());
  }

  /** Install a map previously produced by `build()` (atomic reference swap). */
  swap(models: Map<string, ResolvedModel>): void {
    this.current = models;
  }
}
