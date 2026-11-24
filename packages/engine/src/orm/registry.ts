import { EngineError, type FieldDef, type ModelDef, type Registry, type ResolvedModel } from '../contracts/index.js';
import { extractDependencies, isImpureHelper, parseExpression, type ExprNode } from '../expr/index.js';

export type ResolvedField = FieldDef & { name: string; model: string };

/** Fields every non-abstract model gets (Odoo "magic fields"). */
const MAGIC_FIELDS: Record<string, FieldDef> = {
  id: { type: 'integer', readonly: true, string: 'ID' },
  create_date: { type: 'datetime', readonly: true, string: 'Created on' },
  write_date: { type: 'datetime', readonly: true, string: 'Last Updated on' },
  create_uid: { type: 'integer', readonly: true, string: 'Created by' },
  write_uid: { type: 'integer', readonly: true, string: 'Last Updated by' },
};

/** decimal.precision name referenced by FieldDef.digits. */
export const PRECISION_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.\-/]{0,63}$/;
const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const FIELD_RE = /^[a-z][a-z0-9_]*$/;

function mergeFields(base: Record<string, FieldDef>, additions: Record<string, FieldDef>): Record<string, FieldDef> {
  const result = { ...base };
  for (const [name, next] of Object.entries(additions)) {
    const previous = result[name];
    // A type change is a replacement: carrying compute, relation or access attributes from
    // an incompatible field can silently change the meaning and security of the new one.
    const inherited = previous && (!next.type || previous.type === next.type) ? previous : undefined;
    const field = { ...inherited, ...next };
    if (next.selectionAdd) {
      if (field.type !== 'selection' || !inherited?.selection) {
        throw new EngineError(`selectionAdd on '${name}' requires an inherited selection`);
      }
      const options = new Map(next.selection ?? inherited.selection);
      for (const [key, label] of next.selectionAdd) options.set(key, label);
      field.selection = [...options];
      delete field.selectionAdd;
    }
    result[name] = field;
  }
  return result;
}

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
      if (def.fields[f].delegated) throw new EngineError(`Field '${def.name}.${f}' cannot declare a delegation route`);
      if (!FIELD_RE.test(f)) throw new EngineError(`Invalid field name '${def.name}.${f}'`);
    }
    const existing = merged.get(def.name);
    if (existing) {
      if (!def.extends?.includes(def.name)) {
        throw new EngineError(`Model '${def.name}' defined twice; use extends: ['${def.name}'] to extend it`);
      }
      // Mixins listed next to the model itself (extends: ['res.partner', 'mail.thread']) are copied
      // like prototype inheritance; members the model already has win over the mixin's.
      let current = existing;
      for (const parent of def.extends) {
        if (parent === def.name || current.extends?.includes(parent)) continue;
        const p = merged.get(parent);
        if (!p) throw new EngineError(`Model '${def.name}' extends unknown model '${parent}'`);
        const names = new Set((current.constraints ?? []).map((c) => c.name));
        current = {
          ...current,
          extends: [...(current.extends ?? []), parent],
          fields: { ...Object.fromEntries(Object.entries(p.fields).filter(([n]) => !Object.hasOwn(current.fields, n))), ...current.fields },
          constraints: [...(current.constraints ?? []), ...(p.constraints ?? []).filter((c) => !names.has(c.name))],
          onchange: { ...p.onchange, ...current.onchange },
          methods: { ...p.methods, ...current.methods },
        };
      }
      merged.set(def.name, {
        ...current,
        ...def,
        extends: current.extends,
        origin: existing.origin, // a custom extension must not turn a module model into a custom one
        fields: mergeFields(current.fields, def.fields),
        constraints: [...(current.constraints ?? []), ...(def.constraints ?? [])],
        onchange: { ...current.onchange, ...def.onchange },
        methods: { ...current.methods, ...def.methods },
      });
      continue;
    }
    let base: ModelDef = { ...def, fields: {}, constraints: [], onchange: {}, methods: {} };
    for (const parent of def.extends ?? []) {
      const p = merged.get(parent);
      if (!p) throw new EngineError(`Model '${def.name}' extends unknown model '${parent}'`);
      base = {
        ...base,
        fields: mergeFields(base.fields, p.fields),
        constraints: [...(base.constraints ?? []), ...(p.constraints ?? [])],
        onchange: { ...p.onchange, ...base.onchange },
        methods: { ...p.methods, ...base.methods },
      };
    }
    merged.set(def.name, {
      ...base,
      fields: mergeFields(base.fields, def.fields),
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
      if (f.computeExpr !== undefined && typeof f.computeExpr !== 'string') throw new EngineError(`Invalid compute expression on '${name}.${fname}'`);
      if (f.defaultExpr !== undefined && typeof f.defaultExpr !== 'string') throw new EngineError(`Invalid default expression on '${name}.${fname}'`);
      if (f.defaultExpr !== undefined && f.default !== undefined) throw new EngineError(`Field '${name}.${fname}' cannot have both default and defaultExpr`);
      if (f.defaultExpr !== undefined) try {
        const ast = parseExpression(f.defaultExpr);
        if (containsBareRecord(ast) || extractDependencies(f.defaultExpr).length) throw new Error('default expressions cannot depend on record fields');
      } catch (err) {
        throw new EngineError(`Invalid default expression on '${name}.${fname}': ${err instanceof Error ? err.message : String(err)}`);
      }
      if (f.translate !== undefined && (typeof f.translate !== 'boolean' || (f.translate && (!['char', 'text', 'html'].includes(f.type) || !!f.compute || !!f.computeExpr || !!f.related)))) throw new EngineError(`Invalid translate flag on '${name}.${fname}'`);
      if (f.translate && f.unique) throw new EngineError(`Translated field '${name}.${fname}' cannot be unique`);
      if (f.copy !== undefined && typeof f.copy !== 'boolean') throw new EngineError(`Invalid copy flag on '${name}.${fname}'`);
      if (f.aggregator !== undefined && !['sum', 'avg', 'min', 'max', 'count', 'count_distinct'].includes(f.aggregator)) throw new EngineError(`Invalid aggregator on '${name}.${fname}'`);
      if (typeof f.digits === 'string') {
        if (f.type !== 'float' || !PRECISION_NAME_RE.test(f.digits)) throw new EngineError(`Invalid digits on '${name}.${fname}'`);
      } else if (f.digits && (!Array.isArray(f.digits) || f.digits.length !== 2 || f.type !== 'float' || !Number.isInteger(f.digits[0]) || !Number.isInteger(f.digits[1]) || f.digits[0] < 1 || f.digits[0] > 1000 || f.digits[1] < 0 || f.digits[1] > f.digits[0])) {
        throw new EngineError(`Invalid digits on '${name}.${fname}'`);
      }
      if ((f.type === 'many2one' || f.type === 'one2many' || f.type === 'many2many') && !f.comodel) {
        throw new EngineError(`Field '${name}.${fname}' needs a comodel`);
      }
      fields.set(fname, { ...f, name: fname, model: name });
    }
    if (def.table !== undefined && !FIELD_RE.test(def.table)) throw new EngineError(`Invalid table name '${def.table}'`);
    out.set(name, { name, table: def.abstract ? null : (def.table ?? tableName(name)), fields, def });
  }
  // Import delegated fields only after every model is known. Local fields take precedence.
  const delegationDone = new Set<string>();
  const delegationActive = new Set<string>();
  const addDelegated = (model: ResolvedModel): void => {
    if (delegationDone.has(model.name)) return;
    if (delegationActive.has(model.name)) throw new EngineError(`Delegation cycle on '${model.name}'`);
    delegationActive.add(model.name);
    for (const [parentName, via] of Object.entries(model.def.delegates ?? {})) {
      const parent = out.get(parentName);
      const link = model.fields.get(via);
      if (!parent?.table || !link || link.type !== 'many2one' || link.comodel !== parentName || !link.required || link.compute || link.related || link.delegated) {
        throw new EngineError(`Delegation from '${model.name}' to '${parentName}' requires a required many2one link`);
      }
      if (link.ondelete && link.ondelete !== 'restrict') throw new EngineError(`Delegation link '${model.name}.${via}' must restrict parent deletion`);
      link.ondelete = 'restrict';
      addDelegated(parent);
      const fields = model.fields as Map<string, ResolvedField>;
      for (const [name, source] of parent.fields) {
        if (MAGIC_FIELDS[name] || fields.has(name)) continue;
        const attrs = { ...source };
        delete attrs.compute;
        delete attrs.computeExpr;
        delete attrs.related;
        delete attrs.store;
        delete attrs.default;
        fields.set(name, { ...attrs, name, model: model.name, delegated: { model: parentName, via, field: name } });
      }
    }
    delegationActive.delete(model.name);
    delegationDone.add(model.name);
  };
  for (const model of out.values()) addDelegated(model);

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
    for (const f of m.fields.values() as Iterable<ResolvedField>) {
      if (f.delegated) continue;
      resolveRelational(out, m, f);
      if (f.checkCompany && f.type !== 'many2one') throw new EngineError(`checkCompany on '${m.name}.${f.name}' requires a many2one field`);
      if (f.currencyField) {
        const currency = m.fields.get(f.currencyField);
        const rounding = currency?.comodel ? out.get(currency.comodel)?.fields.get('rounding') : undefined;
        if (f.type !== 'monetary' || !!f.compute || !!f.computeExpr || !!f.related || !!currency?.delegated || currency?.type !== 'many2one' || !rounding || !['float', 'monetary'].includes(rounding.type)) {
          throw new EngineError(`Monetary field '${m.name}.${f.name}' needs a currency many2one with a numeric rounding field`);
        }
      }
    }
    if (m.fields.has('parent_path')) {
      const path = m.fields.get('parent_path')!;
      const parent = m.fields.get('parent_id');
      if (!['char', 'text'].includes(path.type) || !parent || parent.type !== 'many2one' || parent.comodel !== m.name) {
        throw new EngineError(`Model '${m.name}' parent_path requires a char/text field and a self many2one parent_id`);
      }
    }
    for (const [key, handler] of Object.entries(m.def.onchange ?? {})) {
      if (!m.fields.has(key)) throw new EngineError(`Onchange handler references unknown field '${m.name}.${key}'`);
      if (typeof handler === 'string') try {
        parseExpression(handler);
        for (const dep of extractDependencies(handler)) walkPath(out, m, dep, `${m.name}.${key} onchange`);
      } catch (err) {
        throw new EngineError(`Invalid onchange expression on '${m.name}.${key}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    for (const constraint of m.def.constraints ?? []) if (constraint.expression) try {
      const ast = parseExpression(constraint.expression);
      if (containsBareRecord(ast)) throw new Error('constraint expressions must select explicit local fields');
      for (const dep of extractDependencies(constraint.expression)) {
        if (dep.includes('.')) throw new Error(`constraint dependency '${dep}' must be a local field`);
        const field = m.fields.get(dep);
        if (!field || field.delegated || field.related || ['write_uid', 'write_date', 'parent_path'].includes(dep) ||
            ['many2one', 'one2many', 'many2many'].includes(field.type) ||
            field.compute && !field.computeExpr || field.computeExpr && !field.store) {
          throw new Error(`constraint dependency '${dep}' must be a local stored scalar column`);
        }
        // Stored expression fields are permitted only after the stored-compute validator
        // below has proved their inputs are local, unrestricted and deterministic.
      }
    } catch (err) {
      throw new EngineError(`Invalid constraint expression '${constraint.name}' on '${m.name}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // A relation table may be shared only by the two sides of one relation (same tables and columns).
  const relations = new Map<string, { key: string; owner: string }>();
  for (const m of out.values()) {
    for (const f of m.fields.values() as Iterable<ResolvedField>) {
      if (f.delegated || f.type !== 'many2many' || !f.relationTable || f.compute || f.computeExpr || f.related) continue;
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
      if (f.delegated) continue;
      if (f.related) {
        if (f.compute || f.computeExpr) throw new EngineError(`Field '${m.name}.${f.name}' cannot be both related and computed`);
        const end = walkPath(out, m, f.related, `${m.name}.${f.name} related`);
        if (end.type !== f.type) {
          throw new EngineError(`Related field '${m.name}.${f.name}' is ${f.type} but '${f.related}' is ${end.type}`);
        }
        f.depends = [f.related];
        if (!f.comodel && end.comodel) f.comodel = end.comodel;
        // a related field must not expose a field restricted to some groups
        if (!f.groups && end.groups) f.groups = end.groups;
      }
      if (f.computeExpr) {
        if (f.compute) throw new EngineError(`Field '${m.name}.${f.name}' cannot have both compute and computeExpr`);
        try {
          const deps = extractDependencies(f.computeExpr);
          const ast = parseExpression(f.computeExpr);
          if (containsBareRecord(ast)) throw new Error('expression must select explicit record fields');
          if (f.store && containsExternalExpressionReference(ast)) {
            throw new Error('stored expression cannot use identity, context, time, or helper values');
          }
          f.depends = [...new Set([...(f.depends ?? []), ...deps])];
          for (const dep of f.depends) walkPath(out, m, dep, `${m.name}.${f.name} depends`);
          if (f.store) for (const dep of f.depends) {
            const source = dep.includes('.') ? undefined : m.fields.get(dep);
            if (!source || source.delegated || source.compute || source.computeExpr || source.related || source.groups?.length || source.translate ||
                ['write_uid', 'write_date', 'parent_path'].includes(dep) ||
                ['many2one', 'one2many', 'many2many'].includes(source.type)) {
              throw new Error(`stored expression dependency '${dep}' must be an unrestricted local scalar column`);
            }
          }
        } catch (err) {
          throw new EngineError(`Invalid expression or dependency on '${m.name}.${f.name}': ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (f.compute || f.computeExpr || f.related) {
        if (MAGIC_FIELDS[f.name]) throw new EngineError(`Field '${m.name}.${f.name}' cannot be computed`);
        if (typeof f.compute === 'string' && !(m.def.methods && Object.hasOwn(m.def.methods, f.compute))) {
          throw new EngineError(`Compute method '${f.compute}' not found on '${m.name}'`);
        }
        if (f.store && (f.type === 'one2many' || f.type === 'many2many')) {
          throw new EngineError(`Stored computed x2many '${m.name}.${f.name}' is not supported`);
        }
        for (const dep of f.depends ?? []) walkPath(out, m, dep, `${m.name}.${f.name} depends`);
      }
    }
  }
  const expressionGraph = new Map<string, string[]>();
  for (const m of out.values()) for (const f of m.fields.values() as Iterable<ResolvedField>) {
    if (!f.computeExpr) continue;
    const source = `${m.name}.${f.name}`;
    const edges = (f.depends ?? []).flatMap((dep) => {
      const target = walkPath(out, m, dep, `${source} depends`);
      return target.computeExpr ? [`${target.model}.${target.name}`] : [];
    });
    expressionGraph.set(source, edges);
  }
  const visitedExpressions = new Set<string>();
  const activeExpressions = new Set<string>();
  const visitExpression = (name: string): void => {
    if (activeExpressions.has(name)) throw new EngineError(`Computed expression dependency cycle at '${name}'`);
    if (visitedExpressions.has(name)) return;
    activeExpressions.add(name);
    for (const next of expressionGraph.get(name) ?? []) visitExpression(next);
    activeExpressions.delete(name);
    visitedExpressions.add(name);
  };
  for (const name of expressionGraph.keys()) visitExpression(name);
  return out;
}

function containsExternalExpressionReference(node: ExprNode): boolean {
  switch (node.kind) {
    case 'path': return node.parts.length > 0 && (isImpureHelper(node.parts[0]!) || node.parts[0] === 'record' && node.parts.length < 2);
    case 'array': return node.values.some(containsExternalExpressionReference);
    case 'unary': return containsExternalExpressionReference(node.value);
    case 'binary': return containsExternalExpressionReference(node.left) || containsExternalExpressionReference(node.right);
    case 'conditional': return containsExternalExpressionReference(node.test) || containsExternalExpressionReference(node.yes) || containsExternalExpressionReference(node.no);
    case 'call': return containsExternalExpressionReference(node.callee) || node.args.some(containsExternalExpressionReference);
    case 'method': return containsExternalExpressionReference(node.receiver) || node.args.some(containsExternalExpressionReference);
    case 'literal': return false;
  }
}

function containsBareRecord(node: ExprNode): boolean {
  switch (node.kind) {
    case 'path': return node.parts[0] === 'record' && node.parts.length === 1;
    case 'array': return node.values.some(containsBareRecord);
    case 'unary': return containsBareRecord(node.value);
    case 'binary': return containsBareRecord(node.left) || containsBareRecord(node.right);
    case 'conditional': return containsBareRecord(node.test) || containsBareRecord(node.yes) || containsBareRecord(node.no);
    case 'call': return containsBareRecord(node.callee) || node.args.some(containsBareRecord);
    case 'method': return containsBareRecord(node.receiver) || node.args.some(containsBareRecord);
    case 'literal': return false;
  }
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
    if (f.delegated) throw new EngineError(`${what}: dependencies through delegated fields are not supported`);
    if (i < parts.length - 1) {
      if (!f.comodel) throw new EngineError(`${what}: '${cur.name}.${parts[i]}' is not relational in '${path}'`);
      cur = models.get(f.comodel)!;
    }
  }
  return f!;
}

/** Fill many2many relation defaults and check one2many inverses (mutates the resolved field copy). */
function resolveRelational(models: ReadonlyMap<string, ResolvedModel>, m: ResolvedModel, f: ResolvedField): void {
  if (f.compute || f.computeExpr || f.related) return;
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

/** Normalize and validate the language used in SQL and translation maps. */
export function translationLanguage(lang: unknown): string {
  if (lang === undefined) return 'en_US';
  if (typeof lang !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(lang)) throw new EngineError('Invalid language');
  return lang;
}

/** A field is a real column when stored and not x2many. */
export function isColumn(f: FieldDef): boolean {
  if (f.delegated) return false;
  if (f.type === 'one2many' || f.type === 'many2many') return false;
  if ((f.compute || f.computeExpr || f.related) && !f.store) return false;
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
