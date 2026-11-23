import {
  AccessError, EngineError, MissingRecordError, ValidationError,
  type AccessOperation, type Domain, type Recordset, type ResolvedModel, type SearchOptions, type X2ManyCommand,
} from '../contracts/index.js';
import { compileDomain, compileOrder } from '../domain/compile.js';
import { affected, cascadeAffected, computeValues, isComputed, isStoredComputed, mergeTodo, recompute, type Todo } from './compute.js';
import type { EnvImpl } from './env.js';
import { isColumn, type ResolvedField } from './registry.js';
import { checkModelAccess, checkRecordRules, hiddenFields, readRuleResolver, ruleDomain, userSecurity } from '../security/access.js';

const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid']);
const MAX_ONCHANGE_ROUNDS = 10;

type Vals = Record<string, unknown>;

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

  private field(name: string): ResolvedField {
    const f = this.meta.fields.get(name);
    if (!f) throw new EngineError(`Unknown field '${this.model}.${name}'`);
    return f as ResolvedField;
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
    const where = await this.whereClause(domain, params);
    let text = `SELECT t.id FROM "${this.table}" t WHERE ${where} ORDER BY ${compileOrder(this.meta, opts.order)}`;
    if (opts.limit !== undefined) text += ` LIMIT ${nonNegInt(opts.limit, 'limit')}`;
    if (opts.offset) text += ` OFFSET ${nonNegInt(opts.offset, 'offset')}`;
    const rows = await this.env.db.query<{ id: number }>({ text, params });
    return new RecordsetImpl(this.env, this.model, rows.map((r) => r.id));
  }

  async searchCount(domain: Domain): Promise<number> {
    await this.checkAccess('read');
    const params: unknown[] = [];
    const where = await this.whereClause(domain, params);
    const [row] = await this.env.db.query<{ n: number }>({
      text: `SELECT COUNT(*)::int AS n FROM "${this.table}" t WHERE ${where}`, params,
    });
    return row.n;
  }

  async searchRead(domain: Domain, fields?: string[], opts?: SearchOptions): Promise<Vals[]> {
    return (await this.search(domain, opts)).read(fields);
  }

  /** Default field set: stored columns + x2many; non-stored computed fields only on request. */
  async read(fields?: string[]): Promise<Vals[]> {
    await this.checkAccess('read');
    if (this.ids.length === 0) return [];
    const wanted = fields ?? [...this.meta.fields.values()]
      .filter((f) => isColumn(f) || ((f.type === 'one2many' || f.type === 'many2many') && !isComputed(f as ResolvedField)))
      .map((f) => f.name);
    const hidden = await hiddenFields(this.env, this.model);
    const visible = fields ? wanted : wanted.filter((n) => !hidden.has(n));
    for (const n of visible) if (hidden.has(n)) throw new AccessError(`Field '${this.model}.${n}' is restricted`);
    await checkRecordRules(this.env, this.model, this.ids, 'read');
    const defs = visible.map((n) => this.field(n));

    await this.loadColumns();
    const out = this.ids.map((id) => {
      const c = this.env.cache.get(this.model, id)!;
      const r: Vals = { id };
      for (const f of defs) if (isColumn(f)) r[f.name] = normalize(f, c[f.name]);
      return r;
    });
    for (const f of defs) {
      if (isColumn(f)) continue;
      const values = isComputed(f) ? await computeValues(this, f) : await this.readX2manyVisible(f);
      out.forEach((r) => (r[f.name] = values.get(r.id as number) ?? (f.type === 'one2many' || f.type === 'many2many' ? [] : null)));
    }
    return out;
  }

  private async loadColumns(): Promise<void> {
    const names = this.columns().map((f) => f.name);
    const missing = this.ids.filter((id) => {
      const c = this.env.cache.get(this.model, id);
      return !c || names.some((f) => !(f in c));
    });
    if (!missing.length) return;
    const cols = names.map((n) => `t."${n}"`).join(', ');
    const rows = await this.env.db.query<Vals>({
      text: `SELECT ${cols} FROM "${this.table}" t WHERE t.id = ANY($1)`, params: [missing],
    });
    for (const r of rows) this.env.cache.set(this.model, r.id as number, r);
    if (rows.length !== missing.length) {
      const found = new Set(rows.map((r) => r.id));
      throw new MissingRecordError(`Records not found: ${this.model}(${missing.filter((id) => !found.has(id)).join(',')})`);
    }
  }

  /** x2many ids as the user may see them: comodel ACL + read rules applied (Odoo filters these too). */
  private async readX2manyVisible(f: ResolvedField): Promise<Map<number, number[]>> {
    const all = await this.readX2many(f);
    if (this.env.su) return all;
    const ids = [...new Set([...all.values()].flat())];
    if (!ids.length) return all;
    const visible = new Set((await this.env.model(f.comodel!).search([['id', 'in', ids]])).ids);
    return new Map([...all].map(([k, v]) => [k, v.filter((id) => visible.has(id))]));
  }

  /** Raw x2many ids (internal: dependency tracking must see every linked record). */
  private async readX2many(f: ResolvedField): Promise<Map<number, number[]>> {
    const out = new Map<number, number[]>(this.ids.map((id) => [id, []]));
    const co = this.env.registry.get(f.comodel!);
    let rows: { owner: number; id: number }[];
    if (f.type === 'one2many') {
      rows = await this.env.db.query({
        text: `SELECT t."${f.inverseName}" AS owner, t.id FROM "${co.table}" t WHERE t."${f.inverseName}" = ANY($1) ORDER BY ${compileOrder(co, undefined)}`,
        params: [[...this.ids]],
      });
    } else {
      rows = await this.env.db.query({
        text: `SELECT r."${f.column1}" AS owner, r."${f.column2}" AS id FROM "${f.relationTable}" r WHERE r."${f.column1}" = ANY($1) ORDER BY r."${f.column2}"`,
        params: [[...this.ids]],
      });
    }
    for (const r of rows) out.get(r.owner)?.push(r.id);
    return out;
  }

  async create(vals: Vals | Vals[]): Promise<Recordset> {
    await this.checkAccess('create');
    const list = Array.isArray(vals) ? vals : [vals];
    return this.env.transaction(async () => {
      const ids: number[] = [];
      for (const v of list) {
        await this.checkFieldWrite(Object.keys(v));
        const { columns, x2many } = this.split(this.withDefaults(v), true);
        columns.create_uid = columns.write_uid = this.env.uid;
        const keys = Object.keys(columns);
        const params = keys.map((k) => columns[k]);
        const text = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(', ')}${keys.length ? ', ' : ''}create_date, write_date) `
          + `VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}${keys.length ? ', ' : ''}now(), now()) RETURNING id`;
        const [r] = await sqlCall(() => this.env.db.query<{ id: number }>({ text, params }));
        ids.push(r.id);
        for (const [fname, cmds] of x2many) await this.applyCommands(r.id, this.field(fname), cmds);
      }
      this.env.cache.invalidate();
      await checkRecordRules(this.env, this.model, ids, 'create');
      const created = new RecordsetImpl(this.env, this.model, ids);
      // initial values of stored computed fields on the new records + anything depending on them
      const own: Todo = new Map([[this.model, new Map(
        [...this.meta.fields.values()].filter((f) => isStoredComputed(f as ResolvedField)).map((f) => [f.name, new Set(ids)]),
      )]]);
      const done = await recompute(this.env, mergeTodo(own, await affected(this.env, this.model, 'all', ids)));
      await created.checkConstraints('all');
      await validateRecomputed(this.env, done);
      return created;
    });
  }

  async write(vals: Vals): Promise<void> {
    await this.checkAccess('write');
    if (this.ids.length === 0) return;
    await this.checkFieldWrite(Object.keys(vals));
    await checkRecordRules(this.env, this.model, this.ids, 'write');
    const { columns, x2many } = this.split(vals, false);
    const changed = new Set(Object.keys(vals));
    await this.env.transaction(async () => {
      const todo = await this.affectedWithInverse(changed, x2many);
      if (Object.keys(columns).length || changed.size) {
        columns.write_uid = this.env.uid;
        const keys = Object.keys(columns);
        const params: unknown[] = keys.map((k) => columns[k]);
        params.push([...this.ids]);
        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const rows = await sqlCall(() => this.env.db.query<{ id: number }>({
          text: `UPDATE "${this.table}" SET ${sets}, write_date = now() WHERE id = ANY($${params.length}) RETURNING id`,
          params,
        }));
        if (rows.length !== this.ids.length) throw new MissingRecordError(`Some ${this.model} records no longer exist`);
      }
      for (const id of this.ids) for (const [fname, cmds] of x2many) await this.applyCommands(id, this.field(fname), cmds);
      // the new values must keep the records inside the user's rules (e.g. no moving to another company)
      await checkRecordRules(this.env, this.model, this.ids, 'write');
      this.env.cache.invalidate();
      mergeTodo(todo, await this.affectedWithInverse(changed, x2many));
      const done = await recompute(this.env, todo);
      await this.checkConstraints(changed);
      await validateRecomputed(this.env, done);
    });
  }

  async unlink(): Promise<void> {
    await this.checkAccess('unlink');
    if (this.ids.length === 0) return;
    await this.env.transaction(async () => {
      await checkRecordRules(this.env, this.model, this.ids, 'unlink');
      const { todo } = await cascadeAffected(this.env, this.model, this.ids);
      await sqlCall(() => this.env.db.query({ text: `DELETE FROM "${this.table}" WHERE id = ANY($1)`, params: [[...this.ids]] }));
      // ON DELETE CASCADE / SET NULL may change rows of other models: drop the whole cache.
      this.env.cache.invalidate();
      await validateRecomputed(this.env, await recompute(this.env, todo));
    });
  }

  async call(method: string, ...args: unknown[]): Promise<unknown> {
    const methods = this.meta.def.methods;
    const fn = methods && Object.hasOwn(methods, method) ? methods[method] : undefined;
    if (!fn) throw new EngineError(`Model '${this.model}' has no method '${method}'`);
    return fn(this, ...args);
  }

  /** Model-level ACL (nx_access). Record rules are enforced per operation; superuser bypasses both. */
  async checkAccess(op: AccessOperation): Promise<void> {
    await checkModelAccess(this.env, this.model, op);
  }

  /**
   * WHERE for a user search: the read rules and the user's domain are compiled separately and
   * joined in SQL, so no token of the user's domain can bind to the rule. Comodel subqueries
   * (paths, any) get the comodel's read rules too.
   */
  private async whereClause(domain: Domain, params: unknown[]): Promise<string> {
    const reg = this.env.registry;
    const user = compileDomain(reg, this.meta, domain, params, 't', await readRuleResolver(this.env));
    const rule = await ruleDomain(this.env, this.model, 'read');
    return rule ? `(${compileDomain(reg, this.meta, rule, params)}) AND (${user})` : user;
  }

  private async checkFieldWrite(names: string[]): Promise<void> {
    const hidden = await hiddenFields(this.env, this.model);
    for (const n of names) if (hidden.has(n)) throw new AccessError(`Field '${this.model}.${n}' is restricted`);
    if (this.env.su) return;
    const fields = names.map((n) => this.meta.fields.get(n)).filter((f) => f?.writeGroups?.length);
    if (!fields.length) return;
    const sec = await userSecurity(this.env);
    for (const f of fields) {
      if (!f!.writeGroups!.some((g) => sec.groups.has(g))) throw new AccessError(`Field '${this.model}.${f!.name}' is read-only for you`);
    }
  }

  async onchange(values: Vals, field: string): Promise<Vals> {
    this.field(field);
    const handlers = this.meta.def.onchange ?? {};
    const draft: Vals = { ...values };
    const patch: Vals = {};
    const queue = [field];
    for (let round = 0; queue.length; round++) {
      if (round >= MAX_ONCHANGE_ROUNDS * Math.max(1, Object.keys(handlers).length)) {
        throw new EngineError(`onchange on '${this.model}' does not settle (cycle?)`);
      }
      const key = queue.shift()!;
      const h = Object.hasOwn(handlers, key) ? handlers[key] : undefined;
      if (!h) continue;
      const res = (await h(draft, this.env)) ?? {};
      for (const [k, v] of Object.entries(res)) {
        this.field(k);
        if (Object.is(draft[k], v)) continue;
        draft[k] = patch[k] = v;
        queue.push(k);
      }
    }
    return patch;
  }

  // ----- internal API used by the compute engine -----

  /** Store computed values without triggering write logic (no access check, no write_date). */
  async storeRaw(fname: string, values: Map<number, unknown>): Promise<void> {
    const f = this.field(fname);
    for (const [id, v] of values) {
      await sqlCall(() => this.env.db.query({
        text: `UPDATE "${this.table}" SET "${fname}" = $1 WHERE id = $2`, params: [coerce(f, v), id],
      }));
    }
    this.env.cache.invalidate(this.model, [...values.keys()]);
  }

  // ----- helpers -----

  /** Changes to x2many fields of these records also change the inverse side (comodel rows). */
  private async affectedWithInverse(changed: Set<string>, x2many: Map<string, X2ManyCommand[]>): Promise<Todo> {
    const todo = await affected(this.env, this.model, changed, this.ids);
    for (const fname of x2many.keys()) {
      const f = this.field(fname);
      const linked = [...new Set([...(await this.readX2many(f)).values()].flat())];
      if (!linked.length) continue;
      if (f.type === 'one2many') {
        mergeTodo(todo, await affected(this.env, f.comodel!, new Set([f.inverseName!]), linked));
      } else {
        // many2many: the reverse field(s) on the comodel sharing this relation table change too
        const co = this.env.registry.get(f.comodel!);
        const reverse = [...co.fields.values()]
          .filter((rf) => rf.type === 'many2many' && rf.relationTable === f.relationTable && rf !== f)
          .map((rf) => rf.name);
        if (reverse.length) mergeTodo(todo, await affected(this.env, f.comodel!, new Set(reverse), linked));
      }
    }
    return todo;
  }

  async checkConstraints(changed: ReadonlySet<string> | 'all'): Promise<void> {
    for (const c of this.meta.def.constraints ?? []) {
      if (!c.check) continue;
      if (changed !== 'all' && c.fields?.length && !c.fields.some((f) => changed.has(f))) continue;
      try {
        await c.check(this);
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        throw new ValidationError(c.message ?? (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  private async applyCommands(id: number, f: ResolvedField, cmds: X2ManyCommand[]): Promise<void> {
    const co = this.env.model(f.comodel!) as RecordsetImpl;
    if (f.type === 'one2many') {
      const inv = f.inverseName!;
      const invRequired = !!co.meta.fields.get(inv)!.required;
      const current = async () => (await co.search([[inv, '=', id]])).ids;
      for (const c of cmds) {
        switch (c.op) {
          case 'create': await co.create({ ...c.values, [inv]: id }); break;
          case 'update': await this.ownedLine(co, inv, id, c.id).write(c.values); break;
          case 'delete': await this.ownedLine(co, inv, id, c.id).unlink(); break;
          case 'unlink': {
            const line = this.ownedLine(co, inv, id, c.id);
            await (invRequired ? line.unlink() : line.write({ [inv]: false }));
            break;
          }
          case 'link': await co.browse(c.id).write({ [inv]: id }); break;
          case 'clear': {
            const lines = co.browse(await current() as number[]);
            await (invRequired ? lines.unlink() : lines.write({ [inv]: false }));
            break;
          }
          case 'set': {
            const keep = new Set(c.ids);
            const drop = (await current()).filter((x) => !keep.has(x));
            const lines = co.browse(drop as number[]);
            await (invRequired ? lines.unlink() : lines.write({ [inv]: false }));
            if (c.ids.length) await co.browse(c.ids).write({ [inv]: id });
            break;
          }
        }
      }
      return;
    }
    // many2many
    const rel = `"${f.relationTable}"`;
    const c1 = `"${f.column1}"`;
    const c2 = `"${f.column2}"`;
    // Only records the user may read can be linked; clear/set leave links to invisible records alone.
    const visible = async (ids: number[]) => new Set((await co.search([['id', 'in', ids]])).ids);
    const link = async (ids: number[]) => {
      ids = [...new Set(ids)];
      if (!ids.length) return;
      const ok = await visible(ids);
      const bad = ids.filter((x) => !ok.has(x));
      if (bad.length) throw new AccessError(`Cannot link ${co.model}(${bad.join(',')}): missing or not readable`);
      await sqlCall(() => this.env.db.query({
        text: `INSERT INTO ${rel} (${c1}, ${c2}) SELECT $1, x FROM unnest($2::int[]) x ON CONFLICT DO NOTHING`, params: [id, ids],
      }));
    };
    const unlinkRel = async (ids: number[] | null) => {
      if (ids === null && !this.env.su) {
        const current = (await this.env.db.query<{ x: number }>({
          text: `SELECT ${c2} AS x FROM ${rel} WHERE ${c1} = $1`, params: [id],
        })).map((r) => r.x);
        ids = current.length ? [...(await visible(current))] : [];
      }
      await this.env.db.query(ids === null
        ? { text: `DELETE FROM ${rel} WHERE ${c1} = $1`, params: [id] }
        : { text: `DELETE FROM ${rel} WHERE ${c1} = $1 AND ${c2} = ANY($2)`, params: [id, ids] });
    };
    for (const c of cmds) {
      switch (c.op) {
        case 'create': await link([...(await co.create(c.values)).ids]); break;
        case 'update': await co.browse(c.id).write(c.values); break;
        case 'delete': await co.browse(c.id).unlink(); break;
        case 'unlink': await unlinkRel([c.id]); break;
        case 'link': await link([c.id]); break;
        case 'clear': await unlinkRel(null); break;
        case 'set': await unlinkRel(null); await link(c.ids); break;
      }
    }
  }

  /** A one2many line must belong to the parent record being edited. */
  private ownedLine(co: RecordsetImpl, inv: string, owner: number, lineId: number): Recordset {
    return {
      write: async (v: Vals) => this.assertOwned(co, inv, owner, lineId).then(() => co.browse(lineId).write(v)),
      unlink: async () => this.assertOwned(co, inv, owner, lineId).then(() => co.browse(lineId).unlink()),
    } as Recordset;
  }

  private async assertOwned(co: RecordsetImpl, inv: string, owner: number, lineId: number): Promise<void> {
    const n = await co.searchCount([['id', '=', lineId], [inv, '=', owner]]);
    if (!n) throw new ValidationError(`${co.model}(${lineId}) is not a line of ${this.model}(${owner})`);
  }

  private withDefaults(vals: Vals): Vals {
    const out = { ...vals };
    for (const f of this.meta.fields.values()) {
      if (f.name in out || f.default === undefined || MAGIC.has(f.name)) continue;
      out[f.name] = typeof f.default === 'function' ? (f.default as (e: unknown) => unknown)(this.env) : f.default;
    }
    return out;
  }

  /** Validate user values; split into column values and normalized x2many commands. */
  private split(vals: Vals, creating: boolean): { columns: Vals; x2many: Map<string, X2ManyCommand[]> } {
    const columns: Vals = {};
    const x2many = new Map<string, X2ManyCommand[]>();
    for (const [k, v] of Object.entries(vals)) {
      const f = this.meta.fields.get(k) as ResolvedField | undefined;
      if (!f) throw new ValidationError(`Unknown field '${this.model}.${k}'`);
      if (MAGIC.has(k)) throw new ValidationError(`Field '${this.model}.${k}' is managed by the engine`);
      if (isComputed(f)) throw new ValidationError(`Field '${this.model}.${k}' is computed and cannot be written`);
      if (f.type === 'one2many' || f.type === 'many2many') x2many.set(k, toCommands(f, v));
      else columns[k] = coerce(f, v);
    }
    for (const f of this.meta.fields.values()) {
      if (!f.required || MAGIC.has(f.name) || isComputed(f as ResolvedField)) continue;
      if (f.type === 'one2many' || f.type === 'many2many') continue;
      const v = columns[f.name];
      if ((creating || f.name in columns) && (v === null || v === undefined || v === '')) {
        throw new ValidationError(`Field '${f.string ?? f.name}' is required`);
      }
    }
    return { columns, x2many };
  }
}

/** Code constraints on fields changed by recomputation (possibly on other records/models). */
async function validateRecomputed(env: EnvImpl, done: Todo): Promise<void> {
  for (const [model, fields] of done) {
    const ids = [...new Set([...fields.values()].flatMap((s) => [...s]))];
    const alive = (await env.sudo().model(model).search([['id', 'in', ids]])).ids;
    if (alive.length) await (env.model(model).browse([...alive]) as RecordsetImpl).checkConstraints(new Set(fields.keys()));
  }
}

function toCommands(f: ResolvedField, v: unknown): X2ManyCommand[] {
  if (v === false || v === null || v === undefined) return [{ op: 'clear' }];
  if (!Array.isArray(v)) throw new ValidationError(`Field '${f.name}' expects a list of ids or commands`);
  if (v.every((x) => Number.isInteger(x))) return [{ op: 'set', ids: v as number[] }];
  return v.map((c) => {
    const cmd = c as X2ManyCommand;
    const okId = (x: unknown) => Number.isInteger(x) && (x as number) > 0;
    switch (cmd?.op) {
      case 'create': if (cmd.values && typeof cmd.values === 'object') return cmd; break;
      case 'update': if (okId(cmd.id) && cmd.values && typeof cmd.values === 'object') return cmd; break;
      case 'delete': case 'unlink': case 'link': if (okId(cmd.id)) return cmd; break;
      case 'clear': return cmd;
      case 'set': if (Array.isArray(cmd.ids) && cmd.ids.every(okId)) return cmd; break;
    }
    throw new ValidationError(`Invalid command for '${f.name}': ${JSON.stringify(c)}`);
  });
}

/** Map database constraint violations to ValidationError. */
async function sqlCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string }).code;
    // never echo raw database messages (constraint names, SQL, values); name the column at most
    const e = err as { column?: string; detail?: string };
    const name = e.column ?? /Key \(([a-z0-9_, ]+)\)/.exec(e.detail ?? '')?.[1];
    const col = name ? ` (${name})` : '';
    if (code === '23505') throw new ValidationError(`Duplicate value for a unique field${col}`);
    if (code === '23514') throw new ValidationError(`A value violates a check constraint${col}`);
    if (code === '23503') throw new ValidationError('A referenced record is missing or still in use');
    if (code === '23502') throw new ValidationError(`Missing required value${col}`);
    throw err;
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
