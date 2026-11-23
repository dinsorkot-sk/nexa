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
        fields: { ...existing.fields, ...def.fields },
        constraints: [...(existing.constraints ?? []), ...(def.constraints ?? [])],
        onchange: { ...existing.onchange, ...def.onchange },
        methods: { ...existing.methods, ...def.methods },
      });
      continue;
    }
    let base: ModelDef = { ...def, fields: {} };
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
  return out;
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
