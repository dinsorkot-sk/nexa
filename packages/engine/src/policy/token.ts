import { AsyncLocalStorage } from 'node:async_hooks';
import { EngineError } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';

/**
 * @internal Write tokens (ADR 0004). A token lets ONE guarded operation change fields the lifecycle
 * policy would otherwise refuse. It is issued only by engine services that performed the checks
 * themselves (transitions, matching) and is not exported from the package index.
 *
 * - It names the operation, the model, the exact record ids and the fields it covers.
 * - It lives in a module-private AsyncLocalStorage scope opened by {@link withWriteToken}, never in
 *   the env context (callers cannot read, copy or forge it) and ends with the callback.
 * - It is one-shot: the first guarded operation whose op, model and exact ids match consumes it,
 *   whether or not it needed it. Writes made by automations or hooks inside the same callback
 *   inherit the async context but find the token already used, so they cannot replay it.
 * - It never covers anything not listed: a refused field outside `fields` stays refused.
 */
export type TokenOp = 'create' | 'write' | 'unlink';

export interface WriteTokenSpec {
  op: TokenOp;
  model: string;
  /** Exact record ids (write / unlink). Ignored for create. */
  ids?: readonly number[];
  /** Fields the operation may change although the policy forbids it. */
  fields?: readonly string[];
}

interface Token {
  readonly op: TokenOp;
  readonly model: string;
  readonly ids: string; // sorted unique ids, joined; '' for create
  readonly fields: ReadonlySet<string>;
  used: boolean;
  revoked: boolean;
}

interface Scope {
  readonly db: object;
  readonly tenant: string;
  readonly tokens: Token[];
}

const storage = new AsyncLocalStorage<Scope>();

function idKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}

/**
 * Runs `fn` with the given tokens active for guarded operations of this env's transaction. Must be
 * called inside `env.transaction()`. Nested calls shadow (never extend) an outer scope.
 */
export async function withWriteToken<T>(env: EnvImpl, spec: WriteTokenSpec | readonly WriteTokenSpec[], fn: () => Promise<T>): Promise<T> {
  if ((env.db as { inTransaction?: boolean }).inTransaction === false) {
    throw new EngineError('A write token requires an enclosing env.transaction()');
  }
  const specs = Array.isArray(spec) ? spec as readonly WriteTokenSpec[] : [spec as WriteTokenSpec];
  const tokens: Token[] = specs.map((s) => {
    if (!['create', 'write', 'unlink'].includes(s.op)) throw new EngineError('Invalid write token operation');
    if (s.op !== 'create' && (!s.ids?.length || s.ids.some((id) => !Number.isSafeInteger(id) || id <= 0))) {
      throw new EngineError('A write or unlink token needs the exact record ids');
    }
    return {
      op: s.op, model: s.model, ids: s.op === 'create' ? '' : idKey(s.ids!),
      fields: new Set(s.fields ?? []), used: false, revoked: false,
    };
  });
  try {
    return await storage.run({ db: env.db, tenant: env.tenant, tokens }, fn);
  } finally {
    for (const t of tokens) t.revoked = true;
  }
}

/** What a consumed token covers. */
export interface TokenGrant { readonly fields: ReadonlySet<string> }

/**
 * @internal Guard side: consumes the first unused token matching this operation exactly (also when the
 * operation turns out not to need it, so it cannot be replayed by a nested write). Undefined when no
 * token applies. Nested scopes are not searched: only the innermost scope is visible.
 */
export function takeWriteToken(env: EnvImpl, op: TokenOp, model: string, ids: readonly number[]): TokenGrant | undefined {
  const scope = storage.getStore();
  if (!scope || scope.db !== env.db || scope.tenant !== env.tenant) return undefined;
  const key = op === 'create' ? '' : idKey(ids);
  const token = scope.tokens.find((t) => !t.used && !t.revoked && t.op === op && t.model === model && t.ids === key);
  if (!token) return undefined;
  token.used = true;
  return { fields: token.fields };
}
