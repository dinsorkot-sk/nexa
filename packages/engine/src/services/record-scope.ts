import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import { extractDependencies, type ExprValue } from '../expr/index.js';
import { evaluateEnvExpression } from '../orm/expr-helpers.js';
import type { EnvImpl } from '../orm/env.js';

/** Record-evaluation helpers shared by server actions and future policy/transition/match code. */

export function jsonValue(value: unknown): ExprValue {
  return value === undefined ? null : JSON.parse(JSON.stringify(value)) as ExprValue;
}

/** Where a flat record read by readRecord came from, so expressions can follow its many2one fields. */
export const recordOrigin = new WeakMap<object, { model: string; id: number }>();

export async function readRecord(env: Env, model: string, id: number): Promise<Record<string, ExprValue>> {
  const [row] = await env.model(model).browse(id).read();
  if (!row) throw new AccessError('Record is unavailable');
  const record = jsonValue(row) as Record<string, ExprValue>;
  recordOrigin.set(record, { model, id });
  return record;
}

/** Options of one action-side expression evaluation. */
export interface EvalOptions {
  /** Guards and messages: helpers with side effects (sequence_next) are refused. */
  readOnly?: boolean;
  /** Charge rows read to follow relations (the action's row budget). */
  charge?: (rows: number) => void;
  /** Follow relations of paths written as `<prefix>.<field>...` (e.g. `line`) instead of bare field paths. */
  prefix?: string;
}

const MAX_RELATION_PATHS = 64;
const MAX_RELATION_DEPTH = 16;
const MAX_RELATION_ROWS = 1000;

type PathTree = Map<string, PathTree>;

/**
 * GAP-REL-1: the expression's dotted paths that start at a relational field are loaded with the
 * caller's access (ACL + record rules, never sudo) so `x_product_id.name` and
 * `x_line_ids.sum('x_price_subtotal')` work. Only the paths the expression references are read
 * (statically extracted, like computeExpr dependencies). Bounds: 64 paths, depth 16, 1000 rows per
 * evaluation; inside a server action the rows are also charged to the action's row budget.
 *
 * Semantics:
 * - A traversed many2one becomes an object carrying `id` and the referenced fields; an x2many a list
 *   of such objects. A relational field the expression does not traverse stays the raw id / id list,
 *   so `x_partner_id == 5` keeps working. An expression that both traverses a many2one and uses it
 *   bare is refused (write `x_partner_id.id`): the bare use would silently compare an object.
 * - Fail closed: if a referenced related record is not readable by the caller (ACL or record rule),
 *   the evaluation raises AccessError instead of seeing null (guards, messages and values alike).
 * - Expressions whose dependencies cannot be extracted statically keep the flat record.
 */
export async function relationalScope(env: Env, source: string, record: Record<string, ExprValue>, options: EvalOptions): Promise<Record<string, ExprValue>> {
  const origin = recordOrigin.get(record);
  if (!origin) return record;
  let paths: string[];
  try { paths = extractDependencies(source); } catch { return record; }
  const registry = (env as EnvImpl).registry;
  const fields = registry.get(origin.model).fields;
  const tree: PathTree = new Map();
  const bare = new Set<string>();
  let count = 0;
  for (const path of paths) {
    let parts = path.split('.');
    if (options.prefix !== undefined) {
      if (parts[0] !== options.prefix) continue;
      parts = parts.slice(1);
      if (!parts.length) continue;
    }
    const type = fields.get(parts[0]!)?.type;
    if (type !== 'many2one' && type !== 'one2many' && type !== 'many2many') continue;
    if (parts.length === 1) { bare.add(parts[0]!); continue; }
    if (++count > MAX_RELATION_PATHS || parts.length > MAX_RELATION_DEPTH) throw new ValidationError('Expression relation quota exceeded');
    let node = tree;
    for (const part of parts) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part)!;
    }
  }
  if (!tree.size) return record;
  for (const root of tree.keys()) {
    if (bare.has(root) && fields.get(root)!.type === 'many2one') {
      throw new ValidationError(`Expression uses '${root}' both as an id and as a record; write '${root}.id' for the id`);
    }
  }
  let rows = 0;
  const load = async (model: string, ids: number[], children: PathTree): Promise<Map<number, Record<string, ExprValue>>> => {
    const unique = [...new Set(ids)];
    const out = new Map<number, Record<string, ExprValue>>();
    if (!unique.length) return out;
    rows += unique.length;
    if (rows > MAX_RELATION_ROWS) throw new ValidationError('Expression relation row quota exceeded');
    options.charge?.(unique.length);
    const meta = registry.get(model);
    for (const name of children.keys()) if (name !== 'id' && !meta.fields.has(name)) throw new ValidationError(`Unknown field '${model}.${name}'`);
    const names = [...children.keys()].filter((name) => name !== 'id');
    const read = await env.model(model).browse(unique).read(names.length ? names : ['id']);
    if (read.length !== unique.length) throw new AccessError(`A related '${model}' record is not readable`);
    for (const row of read) out.set(row.id as number, { id: row.id as number });
    for (const name of names) {
      const field = meta.fields.get(name)!;
      const sub = children.get(name)!;
      const relational = field.type === 'many2one' || field.type === 'one2many' || field.type === 'many2many';
      if (!sub.size || !relational) {
        if (sub.size) throw new ValidationError(`Field '${model}.${name}' is not relational`);
        for (const row of read) out.get(row.id as number)![name] = jsonValue(row[name]);
        continue;
      }
      const targets = (value: unknown): number[] => field.type === 'many2one'
        ? (typeof value === 'number' ? [value] : [])
        : (Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : []);
      const nested = await load(field.comodel!, read.flatMap((row) => targets(row[name])), sub);
      for (const row of read) {
        const ids = targets(row[name]);
        out.get(row.id as number)![name] = field.type === 'many2one'
          ? (ids.length ? nested.get(ids[0]!)! : null)
          : ids.map((id) => nested.get(id)!);
      }
    }
    return out;
  };
  const self = (await load(origin.model, [origin.id], tree)).get(origin.id)!;
  const out = { ...record };
  for (const root of tree.keys()) out[root] = self[root] ?? null;
  return out;
}

export async function evaluateFor(env: Env, source: string, record: Record<string, ExprValue> | null, options: EvalOptions = {}): Promise<ExprValue> {
  const readOnly = { readOnly: !!options.readOnly };
  if (!record) return evaluateEnvExpression(env, source, {}, readOnly);
  const scope = await relationalScope(env, source, record, options);
  return evaluateEnvExpression(env, source, { ...scope, record: scope }, readOnly);
}
