import {
  EngineError, MissingRecordError, ValidationError,
  type AccessOperation, type Domain, type Recordset, type ResolvedModel, type SearchOptions,
} from '../contracts/index.js';
import { compileDomain, compileOrder } from '../domain/compile.js';
import type { EnvImpl } from './env.js';
import { isColumn, type ResolvedField } from './registry.js';

const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid']);

export class RecordsetImpl implements Recordset {
  constructor(
    readonly env: EnvImpl,
    readonly model: string,
    readonly ids: readonly number[],
  ) {}

  private get meta(): ResolvedModel {
    return this.env.registry.get(this.model);
  }

  private get table(): string {
    const t = this.meta.table;
    if (!t) throw new EngineError(`Model '${this.model}' is abstract`);
    return t;
  }

  private columns(): ResolvedField[] {
    return [...this.meta.fields.values()].filter(isColumn) as ResolvedField[];
  }

  browse(ids: number | number[]): Recordset {
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) if (!Number.isInteger(id) || id <= 0) throw new EngineError(`Invalid id ${id}`);
    return new RecordsetImpl(this.env, this.model, [...new Set(list)]);
  }

  async search(domain: Domain, opts: SearchOptions = {}): Promise<Recordset> {
    await this.checkAccess('read');
    const params: unknown[] = [];
    const where = compileDomain(this.meta, domain, params);
    let text = `SELECT t.id FROM "${this.table}" t WHERE ${where} ORDER BY ${compileOrder(this.meta, opts.order)}`;
    if (opts.limit !== undefined) text += ` LIMIT ${nonNegInt(opts.limit, 'limit')}`;
    if (opts.offset) text += ` OFFSET ${nonNegInt(opts.offset, 'offset')}`;
    const rows = await this.env.db.query<{ id: number }>({ text, params });
    return new RecordsetImpl(this.env, this.model, rows.map((r) => r.id));
  }

  async searchCount(domain: Domain): Promise<number> {
    await this.checkAccess('read');
    const params: unknown[] = [];
    const where = compileDomain(this.meta, domain, params);
    const [row] = await this.env.db.query<{ n: number }>({
      text: `SELECT COUNT(*)::int AS n FROM "${this.table}" t WHERE ${where}`, params,
    });
    return row.n;
  }

  async searchRead(domain: Domain, fields?: string[], opts?: SearchOptions): Promise<Record<string, unknown>[]> {
    return (await this.search(domain, opts)).read(fields);
  }

  async read(fields?: string[]): Promise<Record<string, unknown>[]> {
    await this.checkAccess('read');
    if (this.ids.length === 0) return [];
    const wanted = fields ?? this.columns().map((f) => f.name);
    for (const f of wanted) {
      const fd = this.meta.fields.get(f);
      if (!fd) throw new EngineError(`Unknown field '${this.model}.${f}'`);
      if (!isColumn(fd)) throw new EngineError(`Field '${this.model}.${f}' cannot be read yet (T5)`);
    }

    const missing = this.ids.filter((id) => {
      const c = this.env.cache.get(this.model, id);
      return !c || wanted.some((f) => !(f in c));
    });
    if (missing.length) {
      const cols = this.columns().map((f) => `t."${f.name}"`).join(', ');
      const rows = await this.env.db.query<Record<string, unknown>>({
        text: `SELECT ${cols} FROM "${this.table}" t WHERE t.id = ANY($1)`, params: [missing],
      });
      for (const r of rows) this.env.cache.set(this.model, r.id as number, r);
      if (rows.length !== missing.length) {
        const found = new Set(rows.map((r) => r.id));
        throw new MissingRecordError(`Records not found: ${this.model}(${missing.filter((id) => !found.has(id)).join(',')})`);
      }
    }
    return this.ids.map((id) => {
      const c = this.env.cache.get(this.model, id)!;
      const out: Record<string, unknown> = { id };
      for (const f of wanted) out[f] = normalize(this.meta.fields.get(f)!, c[f]);
      return out;
    });
  }

  async create(vals: Record<string, unknown> | Record<string, unknown>[]): Promise<Recordset> {
    await this.checkAccess('create');
    const list = Array.isArray(vals) ? vals : [vals];
    return this.env.transaction(async () => {
      const ids: number[] = [];
      for (const v of list) {
        const row = this.prepare(this.withDefaults(v), true);
        row.create_uid = row.write_uid = this.env.uid;
        const keys = Object.keys(row);
        const params = keys.map((k) => row[k]);
        const text = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(', ')}, create_date, write_date) `
          + `VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}, now(), now()) RETURNING id`;
        const [r] = await this.env.db.query<{ id: number }>({ text, params });
        ids.push(r.id);
      }
      this.env.cache.invalidate(this.model, ids);
      return new RecordsetImpl(this.env, this.model, ids);
    });
  }

  async write(vals: Record<string, unknown>): Promise<void> {
    await this.checkAccess('write');
    if (this.ids.length === 0) return;
    const row = this.prepare(vals, false);
    row.write_uid = this.env.uid;
    const keys = Object.keys(row);
    const params: unknown[] = keys.map((k) => row[k]);
    params.push([...this.ids]);
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    await this.env.transaction(async () => {
      const rows = await this.env.db.query<{ id: number }>({
        text: `UPDATE "${this.table}" SET ${sets}, write_date = now() WHERE id = ANY($${params.length}) RETURNING id`,
        params,
      });
      if (rows.length !== this.ids.length) throw new MissingRecordError(`Some ${this.model} records no longer exist`);
    });
    this.env.cache.invalidate(this.model, this.ids);
  }

  async unlink(): Promise<void> {
    await this.checkAccess('unlink');
    if (this.ids.length === 0) return;
    await this.env.db.query({ text: `DELETE FROM "${this.table}" WHERE id = ANY($1)`, params: [[...this.ids]] });
    // ON DELETE CASCADE / SET NULL may change rows of other models: drop the whole cache.
    this.env.cache.invalidate();
  }

  async call(method: string, ...args: unknown[]): Promise<unknown> {
    const fn = this.meta.def.methods?.[method];
    if (!fn) throw new EngineError(`Model '${this.model}' has no method '${method}'`);
    return fn(this, ...args);
  }

  /** Access control arrives in T6; superuser mode already bypasses it. */
  async checkAccess(_op: AccessOperation): Promise<void> {
    void _op;
  }

  // ----- helpers -----

  private withDefaults(vals: Record<string, unknown>): Record<string, unknown> {
    const out = { ...vals };
    for (const f of this.meta.fields.values()) {
      if (f.name in out || f.default === undefined || MAGIC.has(f.name)) continue;
      out[f.name] = typeof f.default === 'function' ? (f.default as (e: unknown) => unknown)(this.env) : f.default;
    }
    return out;
  }

  /** Validate and convert user values to column values. */
  private prepare(vals: Record<string, unknown>, creating: boolean): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(vals)) {
      const f = this.meta.fields.get(k);
      if (!f) throw new ValidationError(`Unknown field '${this.model}.${k}'`);
      if (MAGIC.has(k)) throw new ValidationError(`Field '${this.model}.${k}' is managed by the engine`);
      if (!isColumn(f)) throw new ValidationError(`Field '${this.model}.${k}' cannot be written yet (T5)`);
      row[k] = coerce(f, v);
    }
    for (const f of this.meta.fields.values()) {
      if (!f.required || MAGIC.has(f.name)) continue;
      const v = row[f.name];
      if ((creating || f.name in row) && (v === null || v === undefined || v === '')) {
        throw new ValidationError(`Field '${f.string ?? f.name}' is required`);
      }
    }
    return row;
  }
}

function nonNegInt(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0) throw new EngineError(`Invalid ${what} ${n}`);
  return n;
}

function coerce(f: ResolvedField, v: unknown): unknown {
  if (v === null || v === undefined || (v === false && f.type !== 'boolean')) return null;
  switch (f.type) {
    case 'boolean':
      return Boolean(v);
    case 'integer':
    case 'many2one':
      if (!Number.isInteger(v)) throw new ValidationError(`Field '${f.name}' expects an integer`);
      return v;
    case 'float':
    case 'monetary':
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(`Field '${f.name}' expects a number`);
      return v;
    case 'selection':
      if (f.selection && !f.selection.some(([key]) => key === v)) {
        throw new ValidationError(`Invalid value '${String(v)}' for selection '${f.name}'`);
      }
      return v;
    case 'json':
      return JSON.stringify(v);
    default:
      return v;
  }
}

function normalize(f: ResolvedField, v: unknown): unknown {
  if (v === undefined) return null;
  if (f.type === 'monetary' && typeof v === 'string') return Number(v);
  return v;
}
