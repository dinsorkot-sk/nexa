/**
 * Names callable or referenced as helpers in NX-Expr (never record fields). Shared by the
 * evaluator (call allowlist), dependency extraction and the registry's stored-compute checks.
 */

/** Core names from ADR 0002. */
export const CORE_HELPERS: readonly string[] = [
  'user', 'company', 'companies', 'context', 'today', 'now', 'ref', 'search', 'read_group',
  'currency', 'float', 'uom', 'date', 'round', 'abs',
];

/** Engine helpers added in T24 (see orm/expr-helpers.ts). */
export const ENGINE_HELPERS: readonly string[] = [
  'local_now', 'float_round', 'float_compare', 'float_is_zero', 'currency_round', 'currency_convert',
  'date_add_days', 'date_add_months', 'is_digits',
];

/**
 * Helpers whose result depends only on their arguments. Everything else reads identity, time,
 * context or tenant data and is rejected in stored compute expressions.
 * float_* remain impure by name because precision names read tenant data. The registry
 * permits calls whose precision is proven numeric (digits or a value increment), including
 * relational numeric fields tracked by the stored-compute dependency graph.
 */
const PURE = new Set(['currency', 'float', 'uom', 'date', 'round', 'abs', 'date_add_days', 'date_add_months', 'is_digits']);

export const HELPER_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED = new Set(['record', '__proto__', 'prototype', 'constructor']);

const builtin = new Set([...CORE_HELPERS, ...ENGINE_HELPERS]);
const registered = new Map<string, { pure: boolean }>();

/**
 * Reserve a process-wide helper name (trusted code, at module load, before registries are built).
 * Reserved names are callable, excluded from dependency extraction and, unless `pure`, rejected in
 * stored compute expressions. Re-registering the same name with the same purity is a no-op.
 */
export function reserveHelperName(name: string, opts: { pure?: boolean } = {}): void {
  if (typeof name !== 'string' || !HELPER_NAME_RE.test(name) || RESERVED.has(name)) throw new TypeError(`Invalid expression helper name '${String(name)}'`);
  if (builtin.has(name)) throw new TypeError(`Expression helper '${name}' is built in`);
  const pure = opts.pure === true;
  const existing = registered.get(name);
  if (existing && existing.pure !== pure) throw new TypeError(`Expression helper '${name}' is already registered`);
  registered.set(name, { pure });
}

/** True for built-in, registered or call-local helper names. */
export function isHelperName(name: string, local?: readonly string[]): boolean {
  return builtin.has(name) || registered.has(name) || (!!local && local.includes(name));
}

/** True for helpers that may not be used in stored compute expressions. */
export function isImpureHelper(name: string): boolean {
  if (PURE.has(name)) return false;
  return builtin.has(name) || registered.get(name)?.pure === false;
}

/** Validate call-local helper names supplied through ExprOptions.helpers. */
export function checkLocalHelperNames(names: readonly string[] | undefined): void {
  for (const name of names ?? []) {
    if (typeof name !== 'string' || !HELPER_NAME_RE.test(name) || RESERVED.has(name)) throw new TypeError(`Invalid expression helper name '${String(name)}'`);
  }
}
