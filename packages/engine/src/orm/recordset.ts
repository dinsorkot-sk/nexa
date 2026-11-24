import {
  AccessError, EngineError, MissingRecordError, ValidationError,
  type AccessOperation, type Domain, type GroupAggregate, type Recordset, type ResolvedModel, type SearchOptions, type X2ManyCommand,
} from '../contracts/index.js';
import { compileDomain, compileOrder } from '../domain/compile.js';
import { affected, cascadeAffected, computeValues, isComputed, isStoredComputed, mergeTodo, recompute, type Todo } from './compute.js';
import type { EnvImpl } from './env.js';
import { roundMonetary } from './decimal.js';
import { isColumn, translationLanguage, type ResolvedField } from './registry.js';
import { checkModelAccess, checkRecordRules, combine, hiddenFields, readRuleResolver, ruleDomain, userSecurity } from '../security/access.js';
import { assertAdminRemains, beginAdminStateChange } from '../security/last-admin.js';

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
    const where = await this.whereClause(this.activeDomain(domain), params);
    let text = `SELECT t.id FROM "${this.table}" t WHERE ${where} ORDER BY ${compileOrder(this.meta, opts.order, 't', this.env.context.lang)}`;
    if (opts.limit !== undefined) text += ` LIMIT ${nonNegInt(opts.limit, 'limit')}`;
    if (opts.offset) text += ` OFFSET ${nonNegInt(opts.offset, 'offset')}`;
    const rows = await this.env.db.query<{ id: number }>({ text, params });
    return new RecordsetImpl(this.env, this.model, rows.map((r) => r.id));
  }

  async searchCount(domain: Domain): Promise<number> {
    await this.checkAccess('read');
    const params: unknown[] = [];
    const where = await this.whereClause(this.activeDomain(domain), params);
    const [row] = await this.env.db.query<{ n: number }>({
      text: `SELECT COUNT(*)::int AS n FROM "${this.table}" t WHERE ${where}`, params,
    });
    return row.n;
  }

  async searchRead(domain: Domain, fields?: string[], opts?: SearchOptions): Promise<Vals[]> {
    return (await this.search(domain, opts)).read(fields);
  }

  async nameSearch(name: string, domain: Domain = [], opts: SearchOptions = {}): Promise<{ id: number; display_name: string }[]> {
    await this.checkAccess('read');
    compileDomain(this.env.registry, this.meta, domain, [], 't', undefined, this.env.context.lang);
    if (typeof name !== 'string') throw new ValidationError('Name search expects text');
    const recName = this.meta.def.recName ?? (this.meta.fields.has('name') ? 'name' : 'id');
    const hidden = await hiddenFields(this.env, this.model);
    if (hidden.has(recName) && name) return [];
    if (recName === 'id' && name && (!/^[1-9][0-9]*$/.test(name) || Number(name) > 2_147_483_647)) return [];
    const field = recName;
    const searchDomain: Domain = name && field !== 'id'
      ? [...domain, [field, 'ilike', name] as const]
      : name ? [...domain, ['id', '=', Number(name)]] : [...domain];
    const rows = await this.searchRead(searchDomain, ['display_name'], opts);
    return rows.map((row) => ({ id: row.id as number, display_name: String(row.display_name ?? row.id) }));
  }

  async readGroup(domain: Domain, groupBy: string[], aggregates: GroupAggregate[], opts: SearchOptions = {}): Promise<Vals[]> {
    await this.checkAccess('read');
    if (groupBy.length > 8) throw new ValidationError('readGroup supports at most eight grouping fields');
    const hidden = await hiddenFields(this.env, this.model);
    const groups = groupBy.map((spec) => {
      const [name, granularity] = spec.split(':');
      const field = this.field(name);
      if (hidden.has(name)) throw new AccessError(`Field '${this.model}.${name}' is restricted`);
      if (field.delegated || (field.related && !field.store) || (field.compute && !field.store) || !isColumn(field)) {
        throw new ValidationError(`Field '${name}' cannot be grouped`);
      }
      if (granularity && (!['date', 'datetime'].includes(field.type) || !['day', 'week', 'month', 'quarter', 'year'].includes(granularity))) {
        throw new ValidationError(`Invalid date group '${spec}'`);
      }
      return { field, name, granularity };
    });
    for (const aggregate of aggregates) {
      if (!['sum', 'avg', 'min', 'max', 'count', 'count_distinct'].includes(aggregate.op)) throw new ValidationError('Unsupported group aggregate');
      const field = this.field(aggregate.field);
      if (hidden.has(aggregate.field)) throw new AccessError(`Field '${this.model}.${aggregate.field}' is restricted`);
      if (!isColumn(field) || field.delegated || field.type === 'one2many' || field.type === 'many2many') {
        throw new ValidationError(`Field '${aggregate.field}' cannot be aggregated`);
      }
      if (aggregate.op !== 'count' && !['integer', 'float', 'monetary'].includes(field.type)) throw new ValidationError(`Aggregate '${aggregate.op}' requires a numeric field`);
    }
    const params: unknown[] = [];
    const where = await this.whereClause(this.activeDomain(domain), params);
    const expressions = groups.map((group) => {
      let expression = `t."${group.name}"`;
      if (group.field.translate) {
        const language = params.push(this.env.context.lang ?? 'en_US');
        expression = `COALESCE(t."${group.name}"->>$${language}::text, t."${group.name}"->>'en_US')`;
      }
      if (group.granularity) {
        const value = group.field.type === 'datetime' ? `timezone('UTC', ${expression})` : `${expression}::timestamp`;
        expression = `date_trunc('${group.granularity}', ${value})`;
      }
      return expression;
    });
    const select = expressions.map((expression, index) => expression + ' AS "group_' + index + '"').join(', ');
    const values = aggregates.map((aggregate) => {
      const column = `t."${aggregate.field}"`;
      const fn = aggregate.op === 'count_distinct' ? 'COUNT(DISTINCT' : aggregate.op === 'count' ? 'COUNT' : aggregate.op.toUpperCase();
      const close = aggregate.op === 'count_distinct' ? ')' : '';
      return `${fn}(${column})${close} AS "__agg_${aggregates.indexOf(aggregate)}"`;
    });
    params.push(nonNegInt(opts.limit ?? 100, 'limit'));
    const limit = params.length;
    params.push(nonNegInt(opts.offset ?? 0, 'offset'));
    const projections = [select, 'COUNT(*)::int AS "__count"', ...values].filter(Boolean).join(', ');
    const rows = await this.env.db.query<Vals>({
      text: 'SELECT ' + projections +
        ' FROM "' + this.table + '" t WHERE ' + where + (expressions.length ? ' GROUP BY ' + expressions.join(', ') : '') +
        (select || values.length ? ' ORDER BY ' + (groups.length
          ? groups.map((_, index) => '"group_' + index + '"').join(', ')
          : values.map((_, index) => '"__agg_' + index + '"').join(', ')) : '') +
        ' LIMIT $' + limit + ' OFFSET $' + params.length,
      params,
    });
    return rows.map((row) => Object.fromEntries([
      ...groups.map((group, index) => [group.granularity ? group.name + ':' + group.granularity : group.name, row['group_' + index]]),
      ['__count', row.__count],
      ...aggregates.map((aggregate, index) => {
        const value = row['__agg_' + index];
        const numeric = typeof value === 'string' && ['count', 'count_distinct'].includes(aggregate.op) ? Number(value) : value;
        return [aggregate.field + '_' + aggregate.op, typeof numeric === 'number' && !Number.isSafeInteger(numeric) ? value : numeric];
      }),
    ]));
  }

  async fieldsGet(fields?: string[]): Promise<Record<string, Record<string, unknown>>> {
    await this.checkAccess('read');
    const hidden = await hiddenFields(this.env, this.model);
    const selected = fields ?? [...this.meta.fields.keys()];
    const result: Record<string, Record<string, unknown>> = {};
    for (const name of selected) {
      if (name === 'display_name' && !this.meta.fields.has(name)) continue;
      const field = this.field(name);
      if (hidden.has(name)) continue;
      result[name] = {
        type: field.type,
        string: field.string ?? name,
        required: !!field.required,
        readonly: !!field.readonly || !!field.compute || !!field.related,
        ...(field.comodel ? { relation: field.comodel } : {}),
        ...(field.selection ? { selection: field.selection } : {}),
        ...(field.translate ? { translate: true } : {}),
        ...(field.digits ? { digits: field.digits } : {}),
      };
    }
    if ((!fields || fields.includes('display_name')) && !this.meta.fields.has('display_name')) {
      result.display_name = { type: 'char', string: 'Display Name', readonly: true };
    }
    return result;
  }

  async defaultGet(fields: string[]): Promise<Vals> {
    await this.checkAccess('read');
    const hidden = await hiddenFields(this.env, this.model);
    const out: Vals = {};
    for (const name of fields) {
      const field = this.field(name);
      if (hidden.has(name)) throw new AccessError(`Field '${this.model}.${name}' is restricted`);
      if (field.compute || field.related || MAGIC.has(name) || name === 'parent_path') continue;
      const contextValue = this.env.context['default_' + name];
      if (contextValue !== undefined) out[name] = contextValue;
      else if (field.default !== undefined) out[name] = typeof field.default === 'function'
        ? await (field.default as (env: unknown) => unknown)(this.env)
        : field.default;
    }
    return out;
  }

  async copy(defaults: Vals = {}): Promise<Recordset> {
    if (this.ids.length !== 1) throw new ValidationError('Copy requires exactly one source record');
    return this.env.transaction(async () => {
      const source = new RecordsetImpl(this.env.withContext({ activeTest: false }) as EnvImpl, this.model, this.ids);
      const values = await source.copyValues(defaults, new Set());
      return this.env.model(this.model).create(values);
    });
  }

  private async copyValues(defaults: Vals, ancestors: Set<string>, inverse?: string): Promise<Vals> {
    await this.checkAccess('read');
    await this.checkAccess('create');
    const key = `${this.model}:${this.ids[0]}`;
    if (ancestors.has(key)) throw new ValidationError('Cannot copy a cyclic one2many hierarchy');
    const delegates = new Set(Object.values(this.meta.def.delegates ?? {}));
    const linkedParents = new Set([...delegates].filter((link) => link === inverse || (defaults[link] != null && defaults[link] !== false)));
    for (const name of Object.keys(defaults)) {
      const route = this.meta.fields.get(name)?.delegated;
      if (route && linkedParents.has(route.via)) {
        throw new ValidationError(`Cannot override delegated field '${name}' when linking an existing parent`);
      }
    }
    const hidden = await hiddenFields(this.env, this.model);
    const fields = [...this.meta.fields.values()]
      .filter((field) => !hidden.has(field.name) && !MAGIC.has(field.name) && field.name !== 'parent_path' &&
        field.name !== inverse && !Object.hasOwn(defaults, field.name) && !delegates.has(field.name) &&
        !linkedParents.has(field.delegated?.via ?? '') &&
        !isComputed(field as ResolvedField) && field.copy !== false)
      .map((field) => field.name);
    const [source] = await this.read(fields);
    const values: Vals = { ...defaults };
    for (const link of delegates) {
      if (link !== inverse && !Object.hasOwn(defaults, link)) values[link] = null;
    }
    const path = new Set(ancestors).add(key);
    for (const name of fields) {
      const field = this.meta.fields.get(name)!;
      const value = source[name];
      if (value === undefined) continue;
      if (field.type === 'one2many' && field.inverseName) {
        const commands: X2ManyCommand[] = [];
        for (const id of value as number[]) {
          const child = new RecordsetImpl(this.env, field.comodel!, [id]);
          commands.push({ op: 'create', values: await child.copyValues({}, path, field.inverseName) });
        }
        values[name] = commands;
      } else {
        values[name] = value;
      }
    }
    return values;
  }

  private activeDomain(domain: Domain): Domain {
    const active = this.meta.fields.get('active');
    if (this.env.context.activeTest === false || active?.type !== 'boolean' || !isColumn(active)) return domain;
    if (domain.some((term) => Array.isArray(term) && term[0] === 'active')) return domain;
    return combine('&', [domain, [['active', '=', true]]]);
  }

  /** Default field set: stored columns + x2many; non-stored computed fields only on request. */
  async read(fields?: string[]): Promise<Vals[]> {
    await this.checkAccess('read');
    if (this.ids.length === 0) return [];
    const wanted = fields ?? [...this.meta.fields.values()]
      .filter((f) => f.delegated || isColumn(f) || ((f.type === 'one2many' || f.type === 'many2many') && !isComputed(f as ResolvedField)))
      .map((f) => f.name);
    const hidden = await hiddenFields(this.env, this.model);
    const visible = fields ? wanted : wanted.filter((n) => !hidden.has(n));
    const requestedDisplayName = visible.includes('display_name') && !this.meta.fields.has('display_name');
    for (const n of visible) if ((n !== 'display_name' || this.meta.fields.has(n)) && hidden.has(n)) throw new AccessError(`Field '${this.model}.${n}' is restricted`);
    await checkRecordRules(this.env, this.model, this.ids, 'read');
    const defs = visible.filter((name) => name !== 'display_name' || this.meta.fields.has(name)).map((n) => this.field(n));

    await this.loadColumns();
    const out = this.ids.map((id) => {
      const c = this.env.cache.get(this.model, id)!;
      const r: Vals = { id };
      for (const f of defs) if (isColumn(f)) r[f.name] = normalize(f, c[f.name], this.env.context.lang);
      return r;
    });
    for (const f of defs) {
      if (isColumn(f)) continue;
      if (f.delegated) {
        const links = await this.read([f.delegated.via]);
        const ids = [...new Set(links.map(r => r[f.delegated!.via]).filter((id): id is number => typeof id === 'number'))];
        const rows = ids.length ? await this.env.model(f.delegated.model).browse(ids).read([f.delegated.field]) : [];
        const values = new Map(rows.map(r => [r.id as number, r[f.delegated!.field]]));
        out.forEach((r, i) => { r[f.name] = values.get(links[i][f.delegated!.via] as number) ?? null; });
        continue;
      }
      const values = isComputed(f) ? await computeValues(this, f) : await this.readX2manyVisible(f);
      out.forEach((r) => (r[f.name] = values.get(r.id as number) ?? (f.type === 'one2many' || f.type === 'many2many' ? [] : null)));
    }
    if (requestedDisplayName) {
      const displayField = this.meta.def.recName ?? (this.meta.fields.has('name') ? 'name' : null);
      if (displayField) {
        const labels = await this.read([displayField]);
        labels.forEach((row, index) => { out[index].display_name = row[displayField] ?? String(row.id); });
      } else {
        out.forEach((row) => { row.display_name = String(row.id); });
      }
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
        text: `SELECT t."${f.inverseName}" AS owner, t.id FROM "${co.table}" t WHERE t."${f.inverseName}" = ANY($1) ORDER BY ${compileOrder(co, undefined, 't', this.env.context.lang)}`,
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
        await this.checkFieldWrite([...this.meta.fields.keys()].filter((name) =>
          !(name in v) && Object.hasOwn(this.env.context, 'default_' + name)));
        const values = await this.roundMonetaryValues(await this.delegateValues(await this.withDefaults(v), true));
        await this.validateReferences(values);
        await this.validateCompanyLinks(values);
        await this.validateParentLink(values);
        const { columns, x2many } = this.split(values, true);
        columns.create_uid = columns.write_uid = this.env.uid;
        const keys = Object.keys(columns);
        const params = keys.map((k) => {
          const value = columns[k];
          if (!this.field(k).translate || value === null) return value;
          const lang = translationLanguage(this.env.context.lang);
          return JSON.stringify({ en_US: value, [lang]: value });
        });
        const text = `INSERT INTO "${this.table}" (${keys.map((k) => `"${k}"`).join(', ')}${keys.length ? ', ' : ''}create_date, write_date) `
          + `VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}${keys.length ? ', ' : ''}now(), now()) RETURNING id`;
        const [r] = await sqlCall(() => this.env.db.query<{ id: number }>({ text, params }));
        ids.push(r.id);
        for (const [fname, cmds] of x2many) await this.applyCommands(r.id, this.field(fname), cmds);
      }
      this.env.cache.invalidate();
      if (this.hasParentPath()) await this.updateParentPaths();
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
    const monetary = [...this.meta.fields.values()].some(f => !f.delegated && f.currencyField && (f.name in vals || f.currencyField in vals));
    const delegation = Object.keys(vals).some(n => this.meta.fields.get(n)?.delegated || Object.values(this.meta.def.delegates ?? {}).includes(n));
    if ((monetary || delegation) && this.ids.length > 1) {
      await this.env.transaction(async () => { for (const id of this.ids) await this.browse(id).write(vals); });
      return;
    }
    await this.env.transaction(async () => {
      const adminCount = await beginAdminStateChange(this.env.db, this.env.registry, this.model, Object.keys(vals));
      for (const id of this.ids) await this.validateCompanyLinks(vals, id);
      if ('parent_id' in vals) await this.validateParentLink(vals);
      const delegated = delegation ? await this.delegateValues(vals, false) : vals;
      const values = monetary ? await this.roundMonetaryValues(delegated, this.ids[0]) : delegated;
      await this.checkFieldWrite(Object.keys(values));
      const { columns, x2many } = this.split(values, false);
      const changed = new Set([...Object.keys(values), ...Object.keys(vals)]);
      await this.validateReferences(values);
      const todo = await this.affectedWithInverse(changed, x2many);
      if (Object.keys(columns).length || changed.size) {
        columns.write_uid = this.env.uid;
        const keys = Object.keys(columns);
        const params: unknown[] = keys.map((k) => columns[k]);
        const sets = keys.map((k, i) => {
          if (!this.field(k).translate) return `"${k}" = $${i + 1}`;
          params.push(translationLanguage(this.env.context.lang));
          return `"${k}" = CASE WHEN $${i + 1}::text IS NULL THEN NULLIF(COALESCE("${k}", '{}'::jsonb) - $${params.length}::text, '{}'::jsonb) ELSE jsonb_set(COALESCE("${k}", '{}'::jsonb), ARRAY[$${params.length}::text], to_jsonb($${i + 1}::text), true) END`;
        }).join(', ');
        params.push([...this.ids]);
        const rows = await sqlCall(() => this.env.db.query<{ id: number }>({
          text: `UPDATE "${this.table}" SET ${sets}, write_date = now() WHERE id = ANY($${params.length}) RETURNING id`,
          params,
        }));
        if (rows.length !== this.ids.length) throw new MissingRecordError(`Some ${this.model} records no longer exist`);
      }
      for (const id of this.ids) for (const [fname, cmds] of x2many) await this.applyCommands(id, this.field(fname), cmds);
      if (this.hasParentPath() && 'parent_id' in vals) await this.updateParentPaths();
      // the new values must keep the records inside the user's rules (e.g. no moving to another company)
      await checkRecordRules(this.env, this.model, this.ids, 'write');
      this.env.cache.invalidate();
      mergeTodo(todo, await this.affectedWithInverse(changed, x2many));
      const done = await recompute(this.env, todo);
      await this.checkConstraints(changed);
      await validateRecomputed(this.env, done);
      await assertAdminRemains(this.env.db, adminCount);
    });
  }

  async unlink(): Promise<void> {
    await this.checkAccess('unlink');
    if (this.ids.length === 0) return;
    await this.env.transaction(async () => {
      const adminCount = await beginAdminStateChange(this.env.db, this.env.registry, this.model, [], true);
      await checkRecordRules(this.env, this.model, this.ids, 'unlink');
      const { todo } = await cascadeAffected(this.env, this.model, this.ids);
      await sqlCall(() => this.env.db.query({ text: `DELETE FROM "${this.table}" WHERE id = ANY($1)`, params: [[...this.ids]] }));
      // ON DELETE CASCADE / SET NULL may change rows of other models: drop the whole cache.
      this.env.cache.invalidate();
      if (this.hasParentPath()) await this.updateParentPaths();
      await validateRecomputed(this.env, await recompute(this.env, todo));
      await assertAdminRemains(this.env.db, adminCount);
    });
  }

  async vacuum(before: Date): Promise<number> {
    if (!this.env.su) throw new AccessError('Only the superuser can vacuum transient records');
    if (!this.meta.def.transient) throw new EngineError(`Model '${this.model}' is not transient`);
    if (!(before instanceof Date) || !Number.isFinite(before.getTime())) throw new ValidationError('Vacuum requires a valid cutoff');
    return this.env.transaction(async () => {
      const expired = await this.search([['write_date', '<', before.toISOString()]]);
      await expired.unlink();
      return expired.ids.length;
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
    await this.checkDelegatedDomainAccess(this.meta, domain);
    const user = compileDomain(reg, this.meta, domain, params, 't', await readRuleResolver(this.env), this.env.context.lang);
    const rule = await ruleDomain(this.env, this.model, 'read');
    if (rule) await this.checkDelegatedDomainAccess(this.meta, rule);
    const secured = rule ? `(${compileDomain(reg, this.meta, rule, params, 't', undefined, 'en_US')}) AND (${user})` : user;
    if (!this.meta.def.transient || this.env.su) return secured;
    params.push(this.env.uid);
    return `(${secured}) AND t.create_uid = $${params.length}`;
  }

  /** Delegated domain paths must not reveal a model the caller cannot read. */
  private async checkDelegatedDomainAccess(model: ResolvedModel, domain: Domain): Promise<void> {
    for (const term of domain) {
      if (!Array.isArray(term)) continue;
      const [path, op, value] = term;
      if (typeof path !== 'string') continue;
      let current = model;
      for (const part of path.split('.')) {
        let field = current.fields.get(part);
        while (field?.delegated) {
          await checkModelAccess(this.env, field.delegated.model, 'read');
          current = this.env.registry.get(field.delegated.model);
          field = current.fields.get(field.delegated.field);
        }
        if (!field) break;
        if (field.comodel) current = this.env.registry.get(field.comodel);
      }
      if ((op === 'any' || op === 'not any') && Array.isArray(value)) await this.checkDelegatedDomainAccess(current, value as Domain);
    }
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

  private async withDefaults(vals: Vals): Promise<Vals> {
    const out = { ...vals };
    for (const f of this.meta.fields.values()) {
      if (f.name in out || MAGIC.has(f.name) || f.name === 'parent_path' || isComputed(f as ResolvedField)) continue;
      const contextKey = 'default_' + f.name;
      if (Object.hasOwn(this.env.context, contextKey)) {
        out[f.name] = this.env.context[contextKey];
      } else if (f.default !== undefined) {
        out[f.name] = typeof f.default === 'function' ? await (f.default as (e: unknown) => unknown)(this.env) : f.default;
      }
    }
    return out;
  }

  private async validateCompanyLinks(vals: Vals, id?: number): Promise<void> {
    const companyField = this.meta.fields.get('company_id');
    if (companyField && companyField.type !== 'many2one') return;
    const names = [...this.meta.fields.entries()]
      .filter(([, field]) => field.checkCompany && field.type === 'many2one')
      .filter(([name]) => name in vals || 'company_id' in vals || id === undefined)
      .map(([name]) => name);
    if (!names.length) return;
    let companyId = vals.company_id;
    let current: Vals | undefined;
    if (id && (!('company_id' in vals) || names.some((name) => !(name in vals)))) {
      const requested = ['company_id', ...names].filter((name) => this.meta.fields.has(name));
      current = (await this.browse(id).read(requested))[0];
      if (!('company_id' in vals)) companyId = current?.company_id;
    }
    if (companyId === false) companyId = null;
    const security = this.env.su ? undefined : await userSecurity(this.env);
    const activeCompanies = security?.companyIds ?? this.env.companyIds;
    const allowed = companyId == null ? activeCompanies : [companyId as number];
    if (!this.env.su && companyId != null && !security?.allowedCompanyIds.includes(companyId as number)) {
      throw new ValidationError('Record belongs to a company the caller cannot access');
    }
    for (const name of names) {
      const targetId = Object.hasOwn(vals, name) ? vals[name] : current?.[name];
      if (targetId === null || targetId === undefined || targetId === false) continue;
      const field = this.field(name);
      const targetModel = this.env.registry.get(field.comodel!);
      if (!targetModel.fields.has('company_id')) continue;
      const target = await this.env.model(field.comodel!).browse(targetId as number).read(['company_id']);
      const targetCompany = target[0]?.company_id;
      if (targetCompany !== null && targetCompany !== undefined &&
          (!this.env.su && !allowed.length || allowed.length > 0 && !allowed.includes(targetCompany as number))) {
        throw new ValidationError(`Field '${name}' belongs to another company`);
      }
    }
  }

  private async validateParentLink(vals: Vals): Promise<void> {
    if (!this.hasParentPath() || vals.parent_id === null || vals.parent_id === undefined || vals.parent_id === false) return;
    if (!Number.isSafeInteger(vals.parent_id) || (vals.parent_id as number) <= 0) throw new ValidationError('Invalid parent_id');
    await this.env.model(this.model).browse(vals.parent_id as number).read(['id']);
  }

  private hasParentPath(): boolean {
    return this.meta.fields.get('parent_id')?.type === 'many2one' &&
      this.meta.fields.get('parent_id')?.comodel === this.model &&
      ['char', 'text'].includes(this.meta.fields.get('parent_path')?.type ?? '');
  }

  private async updateParentPaths(): Promise<void> {
    const rows = await this.env.db.query<{ id: number; parent_id: number | null; parent_path: string | null }>({
      text: `SELECT id, parent_id, parent_path FROM "${this.table}"`, params: [],
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const resolved = new Map<number, string>();
    const pathFor = (id: number): string => {
      const chain: number[] = [];
      const active = new Set<number>();
      let cursor: number | null = id;
      while (cursor !== null && !resolved.has(cursor)) {
        if (active.has(cursor)) throw new ValidationError('Parent hierarchy cannot contain a cycle');
        const row = byId.get(cursor);
        if (!row) throw new ValidationError('Parent record does not exist');
        active.add(cursor);
        chain.push(cursor);
        cursor = row.parent_id;
      }
      let path = cursor === null ? '' : resolved.get(cursor)!;
      while (chain.length) {
        const current = chain.pop()!;
        path += String(current) + '/';
        resolved.set(current, path);
      }
      return resolved.get(id)!;
    };
    for (const row of rows) {
      const path = pathFor(row.id);
      if (row.parent_path !== path) await this.env.db.query({
        text: `UPDATE "${this.table}" SET parent_path = $1 WHERE id = $2`,
        params: [path, row.id],
      });
    }
    this.env.cache.invalidate(this.model);
  }

  /** Create or update delegated parents under the caller's access checks. */
  private async delegateValues(vals: Vals, creating: boolean): Promise<Vals> {
    const own = { ...vals };
    for (const [model, via] of Object.entries(this.meta.def.delegates ?? {})) {
      const parentValues: Vals = {};
      for (const [name, value] of Object.entries(vals)) {
        const route = this.meta.fields.get(name)?.delegated;
        if (route?.via === via) { parentValues[route.field] = value; delete own[name]; }
      }
      let parentId = own[via];
      if (!creating && !(via in own) && Object.keys(parentValues).length) parentId = (await this.read([via]))[0][via];
      if (!creating && !(via in own) && !Object.keys(parentValues).length) continue;
      const parent = this.env.model(model);
      if (creating && (!(via in own) || own[via] === null || own[via] === false)) {
        parentId = (await parent.create(parentValues)).ids[0];
        own[via] = parentId;
      } else {
        if (!Number.isSafeInteger(parentId) || (parentId as number) <= 0) throw new ValidationError(`Delegation link '${via}' is required`);
        const target = parent.browse(parentId as number);
        await target.read(['id']);
        if (Object.keys(parentValues).length) await target.write(parentValues);
      }
    }
    return own;
  }

  /** Round configured monetary fields using the caller-visible currency's increment. */
  private async roundMonetaryValues(vals: Vals, id?: number): Promise<Vals> {
    const out = { ...vals };
    for (const f of this.meta.fields.values()) {
      if (f.delegated || !f.currencyField || (!(f.name in vals) && !(f.currencyField in vals))) continue;
      let amount = vals[f.name];
      let currency = vals[f.currencyField];
      if (id && (!(f.name in vals) || !(f.currencyField in vals))) {
        const fields = [f.name, f.currencyField].filter(n => !(n in vals));
        const current = (await this.browse(id).read(fields))[0];
        if (!(f.name in vals)) amount = current[f.name];
        if (!(f.currencyField in vals)) currency = current[f.currencyField];
      }
      if (amount === null || amount === undefined || amount === false) continue;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isSafeInteger(currency) || (currency as number) <= 0) {
        throw new ValidationError(`Field '${f.name}' requires a valid value and currency`);
      }
      const currencyField = this.field(f.currencyField);
      const rows = await this.env.model(currencyField.comodel!).browse(currency as number).read(['rounding']);
      const increment = rows[0]?.rounding;
      if (typeof increment !== 'number') throw new ValidationError(`Invalid currency rounding for '${f.name}'`);
      out[f.name] = roundMonetary(amount, increment);
    }
    return out;
  }

  /** Reference targets must exist and be readable to the caller. */
  private async validateReferences(vals: Vals): Promise<void> {
    for (const [name, value] of Object.entries(vals)) {
      const field = this.meta.fields.get(name);
      if (field?.type !== 'reference' || value === null || value === undefined || value === false) continue;
      const match = typeof value === 'string' ? /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*),([1-9][0-9]*)$/.exec(value) : null;
      if (!match || !Number.isSafeInteger(Number(match[2])) || !this.env.registry.models.get(match[1])?.table ||
          (field.selection && !field.selection.some(([model]) => model === match[1]))) {
        throw new ValidationError(`Invalid reference for '${name}'`);
      }
      try {
        if (!(await this.env.withContext({ activeTest: false }).model(match[1]).search([['id', '=', Number(match[2])]])).ids.length) throw new ValidationError(`Invalid reference for '${name}'`);
      } catch (err) {
        if (err instanceof AccessError || err instanceof MissingRecordError) throw new ValidationError(`Invalid reference for '${name}'`);
        throw err;
      }
    }
  }

  /** Validate user values; split into column values and normalized x2many commands. */
  private split(vals: Vals, creating: boolean): { columns: Vals; x2many: Map<string, X2ManyCommand[]> } {
    const columns: Vals = {};
    const x2many = new Map<string, X2ManyCommand[]>();
    for (const [k, v] of Object.entries(vals)) {
      const f = this.meta.fields.get(k) as ResolvedField | undefined;
      if (!f) throw new ValidationError(`Unknown field '${this.model}.${k}'`);
      if (MAGIC.has(k)) throw new ValidationError(`Field '${this.model}.${k}' is managed by the engine`);
      if (k === 'parent_path' && this.hasParentPath()) throw new ValidationError(`Field '${this.model}.parent_path' is managed by the engine`);
      if (isComputed(f)) throw new ValidationError(`Field '${this.model}.${k}' is computed and cannot be written`);
      if (f.type === 'one2many' || f.type === 'many2many') x2many.set(k, toCommands(f, v));
      else columns[k] = coerce(f, v);
    }
    for (const f of this.meta.fields.values()) {
      if (f.delegated || !f.required || MAGIC.has(f.name) || isComputed(f as ResolvedField)) continue;
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
    const alive = (await env.sudo().withContext({ activeTest: false }).model(model).search([['id', 'in', ids]])).ids;
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
  if (f.translate && typeof v !== 'string') throw new ValidationError(`Field '${f.name}' expects text`);
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
    case 'reference':
      if (typeof v !== 'string' || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*,[1-9][0-9]*$/.test(v)) throw new ValidationError(`Invalid reference for '${f.name}'`);
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

function normalize(f: ResolvedField, v: unknown, lang?: string): unknown {
  if (v === undefined || v === null) return null;
  if (f.translate) {
    const translations = v as Record<string, unknown>;
    return translations[translationLanguage(lang)] ?? translations.en_US ?? null;
  }
  if ((f.type === 'monetary' || (f.type === 'float' && f.digits)) && typeof v === 'string') return Number(v);
  return v;
}
