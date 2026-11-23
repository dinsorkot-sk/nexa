import { EngineError, type CompiledSql, type Domain, type DomainLeaf, type DomainTerm, type ResolvedModel } from '../contracts/index.js';
import { isColumn } from '../orm/registry.js';

/**
 * Basic domain compiler (T2): and/or/not, comparison/in/like operators on the model's own
 * stored columns. Dotted paths, child_of/parent_of and any/not any arrive in T3.
 * All values are parameterized; identifiers are validated against the registry.
 */
export function compileDomain(model: ResolvedModel, domain: Domain, params: unknown[], alias = 't'): string {
  if (domain.length === 0) return 'TRUE';
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
    if (!Array.isArray(term) || term.length !== 3) throw new EngineError(`Malformed domain term: ${JSON.stringify(term)}`);
    return leaf(model, term as DomainLeaf, params, alias);
  };

  // Implicit AND between top-level expressions (Odoo semantics).
  const parts: string[] = [];
  while (pos < domain.length) parts.push(next());
  return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
}

function leaf(model: ResolvedModel, [fname, op, value]: DomainLeaf, params: unknown[], alias: string): string {
  if (fname.includes('.')) throw new EngineError(`Dotted path '${fname}' not supported yet`);
  const field = model.fields.get(fname);
  if (!field) throw new EngineError(`Unknown field '${model.name}.${fname}' in domain`);
  if (!isColumn(field)) throw new EngineError(`Field '${model.name}.${fname}' is not searchable yet`);
  const col = `${alias}."${fname}"`;
  const p = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  // Odoo semantics: NULL is "false"; null/false values mean "not set"; negative operators include NULL rows.
  const isBool = field.type === 'boolean';
  const unset = (v: unknown): boolean => v === null || v === undefined || v === false;

  switch (op) {
    case '=':
    case '!=': {
      const truthy = isBool ? Boolean(value) !== (op === '!=') : undefined;
      if (truthy !== undefined) return truthy ? `${col} = TRUE` : `(${col} = FALSE OR ${col} IS NULL)`;
      if (unset(value)) return op === '=' ? `${col} IS NULL` : `${col} IS NOT NULL`;
      return op === '=' ? `${col} = ${p(value)}` : `(${col} <> ${p(value)} OR ${col} IS NULL)`;
    }
    case '>': case '>=': case '<': case '<=':
      if (unset(value)) throw new EngineError(`Operator '${op}' needs a value on '${model.name}.${fname}'`);
      return `${col} ${op} ${p(value)}`;
    case 'in':
    case 'not in': {
      if (!Array.isArray(value)) throw new EngineError(`Operator '${op}' needs an array`);
      const hasUnset = value.some(unset);
      const rest = isBool ? value.filter((v) => v === true) : value.filter((v) => !unset(v));
      const parts: string[] = [];
      if (rest.length) parts.push(`${col} = ANY(${p(rest)})`);
      if (hasUnset) parts.push(isBool ? `(${col} = FALSE OR ${col} IS NULL)` : `${col} IS NULL`);
      const positive = parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
      if (op === 'in') return positive;
      // NOT over a predicate that is never NULL-valued: wrap with COALESCE so NULL rows count as "not in".
      return parts.length ? `NOT COALESCE(${positive}, FALSE)` : 'TRUE';
    }
    case 'like': case 'ilike': {
      return `${col}::text ${op.toUpperCase()} ${p(`%${escapeLike(String(value))}%`)}`;
    }
    case 'not like': case 'not ilike': {
      return `(${col}::text ${op.toUpperCase()} ${p(`%${escapeLike(String(value))}%`)} OR ${col} IS NULL)`;
    }
    case '=like': case '=ilike':
      return `${col}::text ${op.slice(1).toUpperCase()} ${p(value)}`;
    default:
      throw new EngineError(`Operator '${op}' not supported yet`);
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
