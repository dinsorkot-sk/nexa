import type { FilterNode, FilterCondition, FilterGroup } from './row-filter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQB = any;

function kyselyOp(op: FilterCondition['op']): string {
  switch (op) {
    case 'eq': return '=';
    case 'ne': return '!=';
    case 'gt': return '>';
    case 'lt': return '<';
    case 'gte': return '>=';
    case 'lte': return '<=';
    case 'contains': return 'like';
    case 'in': return 'in';
    default: return '=';
  }
}

/** Apply a parsed row-filter to a Kysely query builder. Returns the modified builder. */
export function applyRowFilter(qb: AnyQB, filter: FilterNode | null): AnyQB {
  if (!filter) return qb;
  if (filter.kind === 'condition') {
    const c = filter as FilterCondition;
    if (c.op === 'contains') {
      return qb.where(c.field, 'like', `%${String(c.value)}%`);
    }
    if (c.op === 'in') {
      const vals = c.value as unknown[];
      return qb.where(c.field, 'in', vals);
    }
    return qb.where(c.field, kyselyOp(c.op), c.value);
  }
  const g = filter as FilterGroup;
  if (g.op === 'and') {
    let q = qb;
    for (const child of g.children) {
      q = applyRowFilter(q, child);
    }
    return q;
  }
  // or: use where with callback
  return qb.where((eb: AnyQB) => {
    const ors = g.children.map((child) => {
      // build a sub-expression by applying recursively is not straightforward;
      // instead, handle one level: convert child to where expr
      return exprFor(eb, child);
    });
    return eb.or(ors);
  });
}

function exprFor(eb: AnyQB, node: FilterNode): AnyQB {
  if (node.kind === 'condition') {
    const c = node as FilterCondition;
    if (c.op === 'contains') return eb(c.field, 'like', `%${String(c.value)}%`);
    if (c.op === 'in') return eb(c.field, 'in', c.value as unknown[]);
    return eb(c.field, kyselyOp(c.op), c.value);
  }
  const g = node as FilterGroup;
  const exprs = g.children.map((ch) => exprFor(eb, ch));
  return g.op === 'and' ? eb.and(exprs) : eb.or(exprs);
}