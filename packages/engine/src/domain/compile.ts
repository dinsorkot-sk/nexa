import {
  EngineError, type CompiledSql, type Domain, type DomainLeaf, type DomainTerm, type Registry, type ResolvedModel,
} from '../contracts/index.js';
import { isColumn, type ResolvedField } from '../orm/registry.js';

/**
 * Domain → SQL compiler (ADR 0001 §6).
 *
 * - Polish notation with '&', '|', '!' and implicit AND at top level.
 * - Dotted paths (`partner_id.country_id.code`) are rewritten to nested `any` and compiled as
 *   subqueries (no JOINs, so no duplicated rows): many2one → `IN (SELECT id ...)`,
 *   one2many → `EXISTS (...)` on the inverse many2one.
 * - `child_of` / `parent_of` use a recursive CTE over the model's `parent_id` field.
 * - Odoo NULL semantics: NULL counts as false/unset; negative operators include NULL rows.
 * - Values are always parameters; identifiers come from the registry only.
 */
export function compileDomain(
  registry: Registry, model: ResolvedModel, domain: Domain, params: unknown[], alias = 't',
): string {
  return new Compiler(registry, params).domain(model, domain, alias);
}

/** Field used for hierarchy operators (Odoo `_parent_name` default). */
const PARENT_FIELD = 'parent_id';
const MAX_DEPTH = 32;

class Compiler {
  private aliasSeq = 0;
  private depth = 0;

  constructor(private readonly registry: Registry, private readonly params: unknown[]) {}

  domain(model: ResolvedModel, domain: Domain, alias: string): string {
    if (!Array.isArray(domain)) throw new EngineError('Domain must be an array');
    if (domain.length === 0) return 'TRUE';
    if (++this.depth > MAX_DEPTH) throw new EngineError('Domain nested too deeply');
    let pos = 0;

    const next = (): string => {
      if (pos >= domain.length) throw new EngineError('Malformed domain: missing operand');
      const term: DomainTerm = domain[pos++];
      if (term === '!') return `(NOT ${next()})`;
      if (term === '&' || term === '|') {
        const a = next();
        const b = next();
        return `(${a} ${term === '&' ? 'AND' : 'OR'} ${b})`;
      }
      if (!Array.isArray(term) || term.length !== 3 || typeof term[0] !== 'string') {
        throw new EngineError(`Malformed domain term: ${JSON.stringify(term)}`);
      }
      return this.leaf(model, term as DomainLeaf, alias);
    };

    const parts: string[] = [];
    while (pos < domain.length) parts.push(next());
    this.depth--;
    return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
  }

  private p(v: unknown): string {
    this.params.push(v);
    return `$${this.params.length}`;
  }

  private newAlias(): string {
    return `t${++this.aliasSeq}`;
  }

  private field(model: ResolvedModel, name: string): ResolvedField {
    const f = model.fields.get(name);
    if (!f) throw new EngineError(`Unknown field '${model.name}.${name}' in domain`);
    return f as ResolvedField;
  }

  private table(model: ResolvedModel): string {
    if (!model.table) throw new EngineError(`Model '${model.name}' has no table`);
    return `"${model.table}"`;
  }

  private leaf(model: ResolvedModel, [path, op, value]: DomainLeaf, alias: string): string {
    const dot = path.indexOf('.');
    if (dot >= 0) {
      // a.b.c op v  ==>  a any [(b.c op v)]
      const head = path.slice(0, dot);
      const f = this.field(model, head);
      if (f.type !== 'many2one' && f.type !== 'one2many' && f.type !== 'many2many') {
        throw new EngineError(`Field '${model.name}.${head}' is not relational; cannot traverse '${path}'`);
      }
      return this.any(model, f, [[path.slice(dot + 1), op, value]], alias, false);
    }

    const f = this.field(model, path);
    switch (op) {
      case 'any':
      case 'not any':
        if (!Array.isArray(value)) throw new EngineError(`Operator '${op}' needs a domain`);
        return this.any(model, f, value as Domain, alias, op === 'not any');
      case 'child_of':
      case 'parent_of':
        return this.hierarchy(model, f, op, value, alias);
    }
    if (f.type === 'one2many' || f.type === 'many2many') return this.x2manyLeaf(model, f, op, value, alias);
    if (!isColumn(f)) throw new EngineError(`Field '${model.name}.${path}' is not stored; cannot search on it yet`);
    return this.scalar(f, `${alias}."${f.name}"`, op, value);
  }

  /** `field any [subdomain]` on a relational field. */
  private any(model: ResolvedModel, f: ResolvedField, sub: Domain, alias: string, negate: boolean): string {
    const co = this.registry.get(f.comodel!);
    const a = this.newAlias();
    const where = this.domain(co, sub, a);
    if (f.type === 'many2one') {
      const col = `${alias}."${f.name}"`;
      const subq = `SELECT ${a}.id FROM ${this.table(co)} ${a} WHERE ${where}`;
      return negate ? `(${col} IS NULL OR ${col} NOT IN (${subq}))` : `${col} IN (${subq})`;
    }
    if (f.type === 'one2many') {
      const inv = this.inverse(model, f, co);
      const ex = `EXISTS (SELECT 1 FROM ${this.table(co)} ${a} WHERE ${a}."${inv}" = ${alias}.id AND ${where})`;
      return negate ? `NOT ${ex}` : ex;
    }
    throw new EngineError(`many2many search on '${model.name}.${f.name}' arrives with relational fields (T5)`);
  }

  private inverse(model: ResolvedModel, f: ResolvedField, co: ResolvedModel): string {
    const inv = f.inverseName;
    const invField = inv ? co.fields.get(inv) : undefined;
    if (!inv || !invField || invField.type !== 'many2one' || invField.comodel !== model.name) {
      throw new EngineError(`one2many '${model.name}.${f.name}' needs inverseName = a many2one on '${co.name}' to '${model.name}'`);
    }
    return inv;
  }

  /** Direct leaves on x2many: `in ids`, `not in ids`, `= false` (empty), `!= false` (non-empty). */
  private x2manyLeaf(model: ResolvedModel, f: ResolvedField, op: string, value: unknown, alias: string): string {
    const empty = value === false || value === null || (Array.isArray(value) && value.length === 0);
    if ((op === '=' || op === '!=') && empty) {
      return this.any(model, f, [], alias, op === '=');
    }
    if (op === 'in' || op === 'not in' || op === '=' || op === '!=') {
      const ids = Array.isArray(value) ? value : [value];
      if (!ids.every((v) => Number.isInteger(v))) throw new EngineError(`'${model.name}.${f.name}' ${op} expects record ids`);
      return this.any(model, f, [['id', 'in', ids]], alias, op === 'not in' || op === '!=');
    }
    throw new EngineError(`Operator '${op}' not supported on x2many '${model.name}.${f.name}'`);
  }

  /**
   * `field child_of ids`: rows whose field points at ids or any of their descendants.
   * `field parent_of ids`: rows whose field points at ids or any of their ancestors.
   * `field` is `id` (the model itself) or a many2one to a model having `parent_id`.
   */
  private hierarchy(model: ResolvedModel, f: ResolvedField, op: 'child_of' | 'parent_of', value: unknown, alias: string): string {
    const target = f.name === 'id' ? model : f.type === 'many2one' ? this.registry.get(f.comodel!) : undefined;
    if (!target) throw new EngineError(`'${op}' needs 'id' or a many2one field, got '${model.name}.${f.name}'`);
    const parent = target.fields.get(PARENT_FIELD);
    if (!parent || parent.type !== 'many2one' || parent.comodel !== target.name) {
      throw new EngineError(`'${op}' needs '${target.name}.${PARENT_FIELD}' (many2one to itself)`);
    }
    const ids = (Array.isArray(value) ? value : [value]).filter((v) => v !== false && v !== null);
    if (!ids.every((v) => Number.isInteger(v))) throw new EngineError(`'${op}' expects record ids`);
    if (ids.length === 0) return 'FALSE';
    const tbl = this.table(target);
    const r = this.newAlias();
    const c = this.newAlias();
    // UNION (not UNION ALL) also stops on cycles in the hierarchy.
    const step = op === 'child_of'
      ? `SELECT ${c}.id FROM ${tbl} ${c} JOIN ${r} ON ${c}."${PARENT_FIELD}" = ${r}.id`
      : `SELECT ${c}."${PARENT_FIELD}" FROM ${tbl} ${c} JOIN ${r} ON ${c}.id = ${r}.id WHERE ${c}."${PARENT_FIELD}" IS NOT NULL`;
    const cte = `WITH RECURSIVE ${r}(id) AS (SELECT unnest(${this.p(ids)}::int[]) UNION ${step}) SELECT id FROM ${r}`;
    return `${alias}."${f.name}" IN (${cte})`;
  }

  private scalar(field: ResolvedField, col: string, op: string, value: unknown): string {
    const isBool = field.type === 'boolean';
    const unset = (v: unknown): boolean => v === null || v === undefined || v === false;

    switch (op) {
      case '=':
      case '!=': {
        if (isBool) {
          const truthy = Boolean(value) !== (op === '!=');
          return truthy ? `${col} = TRUE` : `(${col} = FALSE OR ${col} IS NULL)`;
        }
        if (unset(value)) return op === '=' ? `${col} IS NULL` : `${col} IS NOT NULL`;
        return op === '=' ? `${col} = ${this.p(value)}` : `(${col} <> ${this.p(value)} OR ${col} IS NULL)`;
      }
      case '>': case '>=': case '<': case '<=':
        if (unset(value)) throw new EngineError(`Operator '${op}' needs a value on '${field.model}.${field.name}'`);
        return `${col} ${op} ${this.p(value)}`;
      case 'in':
      case 'not in': {
        if (!Array.isArray(value)) throw new EngineError(`Operator '${op}' needs an array`);
        const hasUnset = value.some(unset);
        const rest = isBool ? value.filter((v) => v === true) : value.filter((v) => !unset(v));
        const parts: string[] = [];
        if (rest.length) parts.push(`${col} = ANY(${this.p(rest)})`);
        if (hasUnset) parts.push(isBool ? `(${col} = FALSE OR ${col} IS NULL)` : `${col} IS NULL`);
        const positive = parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
        if (op === 'in') return positive;
        return parts.length ? `NOT COALESCE(${positive}, FALSE)` : 'TRUE';
      }
      case 'like': case 'ilike':
        return `${col}::text ${op.toUpperCase()} ${this.p(`%${escapeLike(String(value))}%`)}`;
      case 'not like': case 'not ilike':
        return `(${col}::text ${op.toUpperCase()} ${this.p(`%${escapeLike(String(value))}%`)} OR ${col} IS NULL)`;
      case '=like': case '=ilike':
        return `${col}::text ${op.slice(1).toUpperCase()} ${this.p(value)}`;
      default:
        throw new EngineError(`Unknown domain operator '${op}'`);
    }
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Validate and compile an order spec like "name asc, id desc". */
export function compileOrder(model: ResolvedModel, order: string | undefined, alias = 't'): string {
  const spec = order ?? model.def.order ?? 'id';
  return spec
    .split(',')
    .map((part) => {
      const [fname, dir = 'asc', ...rest] = part.trim().split(/\s+/);
      const f = model.fields.get(fname);
      if (!f || !isColumn(f) || rest.length || !/^(asc|desc)$/i.test(dir)) {
        throw new EngineError(`Invalid order '${part.trim()}' for '${model.name}'`);
      }
      return `${alias}."${fname}" ${dir.toUpperCase()}`;
    })
    .join(', ');
}

export type { CompiledSql };
