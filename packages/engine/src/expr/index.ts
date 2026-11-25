import { evaluateAst } from './evaluate.js';
import { parseExpression, type ExprNode } from './parser.js';
import { checkLocalHelperNames, isHelperName } from './names.js';
import type { AsyncExprOptions, ExprEnvironment, ExprOptions, ExprValue } from './types.js';
export { createExpressionHelpers } from './helpers.js';
export { CORE_HELPERS, ENGINE_HELPERS, isHelperName, isImpureHelper, reserveHelperName } from './names.js';

export * from './types.js';
export { parseExpression, type ExprNode } from './parser.js';


/** Parse and evaluate the data-only NX-Expr language. No JavaScript evaluation is used. */
export function evaluateExpression(source: string, environment: ExprEnvironment = {}, options: ExprOptions = {}): ExprValue {
  if (typeof source !== 'string') throw new TypeError('Expression must be a string');
  const maxLength = options.maxLength ?? 10_000;
  if (source.length > maxLength) throw new RangeError('Expression size quota exceeded');
  return evaluateAst(parseExpression(source, options), environment, options);
}

/** Thrown inside the synchronous evaluator when an async helper result is not known yet. */
class PendingHelperCall {
  constructor(readonly name: string, readonly args: ExprValue[], readonly key: string) {}
}

const MAX_HELPER_KEY = 4_096;

/** Strict cache key: only JSON-exact data, so NaN/Infinity/undefined/functions cannot alias null. */
function helperKey(value: unknown, depth = 0): string {
  if (depth > 32) throw new RangeError('Expression helper argument nesting quota exceeded');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Expression helper arguments must be finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => helperKey(v, depth + 1)).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${helperKey((value as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`;
  }
  throw new TypeError('Expression helper arguments must be plain data');
}
const MAX_HELPER_RESULT = 65_536;

function plainResult(value: ExprValue): ExprValue {
  if (value === undefined) return null;
  const json = JSON.stringify(value);
  if (json === undefined || json.length > MAX_HELPER_RESULT) throw new RangeError('Expression helper result quota exceeded');
  return JSON.parse(json) as ExprValue;
}

/**
 * Evaluate with helpers that need asynchronous data, keeping the evaluator synchronous.
 *
 * Bounded replay: the expression is evaluated; the first async helper call whose result is not
 * known aborts the pass (NX-Expr has no try/catch, so the expression cannot observe or swallow
 * it). The helper is then awaited outside the evaluator, its JSON-plain result memoized by
 * (name, arguments), and the pure expression is evaluated again. Each pass keeps the normal
 * step, time and collection quotas; at most `maxHelperCalls` distinct calls are resolved.
 * Helpers receive only plain data produced by the evaluator and return plain data.
 */
export async function evaluateExpressionAsync(source: string, environment: ExprEnvironment = {}, options: AsyncExprOptions = {}): Promise<ExprValue> {
  if (typeof source !== 'string') throw new TypeError('Expression must be a string');
  const maxLength = options.maxLength ?? 10_000;
  if (source.length > maxLength) throw new RangeError('Expression size quota exceeded');
  const ast = parseExpression(source, options);
  const asyncHelpers = options.asyncHelpers ?? {};
  const names = Object.keys(asyncHelpers);
  checkLocalHelperNames(names);
  const maxCalls = Math.min(options.maxHelperCalls ?? 16, 64);
  if (!Number.isInteger(maxCalls) || maxCalls < 0) throw new RangeError('Expression helper call quota must be a non-negative integer');
  const results = new Map<string, ExprValue>();
  const scope: ExprEnvironment = { ...environment };
  for (const name of names) {
    scope[name] = (...args: ExprValue[]): ExprValue => {
      const key = `${name}:${helperKey(args)}`;
      if (key.length > MAX_HELPER_KEY) throw new RangeError('Expression helper argument quota exceeded');
      if (results.has(key)) return results.get(key)!;
      throw new PendingHelperCall(name, args, key);
    };
  }
  const evalOptions: ExprOptions = { ...options, helpers: [...(options.helpers ?? []), ...names] };
  for (;;) {
    try {
      return evaluateAst(ast, scope, evalOptions);
    } catch (error) {
      if (!(error instanceof PendingHelperCall)) throw error;
      if (results.size >= maxCalls) throw new RangeError('Expression helper call quota exceeded');
      const helper = Object.hasOwn(asyncHelpers, error.name) ? asyncHelpers[error.name] : undefined;
      if (!helper) throw new TypeError(`Helper '${error.name}' is not available`);
      results.set(error.key, plainResult(await helper.resolve(error.args)));
    }
  }
}

/** Statically collect record field paths. A leading `record.` is removed. */
export function extractDependencies(source: string, options: Pick<ExprOptions, 'maxLength' | 'helpers'> = {}): string[] {
  if (typeof source !== 'string') throw new TypeError('Expression must be a string');
  checkLocalHelperNames(options.helpers);
  const helperNames = { has: (name: string) => isHelperName(name, options.helpers) };
  if (source.length > (options.maxLength ?? 10_000)) throw new RangeError('Expression size quota exceeded');
  const dependencies = new Set<string>();
  const receiverPath = (node: ExprNode): string | null => {
    if (node.kind === 'method') {
      const base = receiverPath(node.receiver);
      const selector = node.args[0];
      if (selector && (selector.kind !== 'literal' || typeof selector.value !== 'string')) {
        throw new TypeError(`Collection method '${node.name}' requires a literal field selector for dependency extraction`);
      }
      if (base && node.name === 'mapped' && selector?.kind === 'literal' && typeof selector.value === 'string') return `${base}.${selector.value}`;
      return base;
    }
    if (node.kind === 'path') {
      if (node.parts[0] === 'record') return node.parts.slice(1).join('.');
      if (node.parts.length === 1 && !helperNames.has(node.parts[0]!)) return node.parts.join('.');
    }
    return null;
  };
  const walk = (node: ExprNode): void => {
    switch (node.kind) {
      case 'path': {
        const first = node.parts[0]!;
        if (!helperNames.has(first) && first !== 'record') dependencies.add(node.parts.join('.'));
        else if (first === 'record' && node.parts.length > 1) dependencies.add(node.parts.slice(1).join('.'));
        break;
      }
      case 'array': node.values.forEach(walk); break;
      case 'unary': walk(node.value); break;
      case 'binary': walk(node.left); walk(node.right); break;
      case 'conditional': walk(node.test); walk(node.yes); walk(node.no); break;
      case 'call': walk(node.callee); node.args.forEach(walk); break;
      case 'method': {
        const selector = node.args[0];
        if (selector && (selector.kind !== 'literal' || typeof selector.value !== 'string')) {
          throw new TypeError(`Collection method '${node.name}' requires a literal field selector for dependency extraction`);
        }
        walk(node.receiver);
        node.args.forEach(walk);
        const path = receiverPath(node.receiver);
        const field = selector?.kind === 'literal' && typeof selector.value === 'string' ? selector.value : null;
        if (path && field && ['mapped', 'filtered', 'sum', 'min', 'max', 'any', 'all', 'sorted'].includes(node.name)) {
          dependencies.add([path, field].filter(Boolean).join('.'));
        }
        break;
      }
      case 'literal': break;
    }
  };
  walk(parseExpression(source, options));
  return [...dependencies].sort();
}

/**
 * Trusted caller adapter contract: every method runs as the invoking user and
 * applies model ACLs plus record rules. Adapters run in the caller's transaction,
 * must honor AbortSignal cooperatively, and must roll the transaction back when
 * runServerScript rejects. This bridge has no sudo capability.
 */
export interface SafeScriptBridge {
  search(model: string, domain?: ExprValue, options?: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  create(model: string, values: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  write(model: string, ids: ExprValue, values: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  unlink(model: string, ids: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  message_post(model: string, ids: ExprValue, message: string, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  call(actionId: string, args: ExprValue | undefined, limits: { maxRows: number }, signal?: AbortSignal): Promise<{ value: ExprValue; rowsConsumed: number }> | { value: ExprValue; rowsConsumed: number };
  raise(message: string): never;
  log(message: string): void;
  /** Lock records FOR UPDATE (write access required); returns locked ids. Charged one row per id. */
  lock?(model: string, ids: ExprValue, options?: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
  /** Claim writable records FOR UPDATE SKIP LOCKED (queue pattern); bounded like search. */
  claim?(model: string, domain?: ExprValue, options?: ExprValue, signal?: AbortSignal): Promise<ExprValue> | ExprValue;
}

export interface ScriptSandboxOptions {
  timeoutMs?: number;
  memoryLimitBytes?: number;
  maxRows?: number;
  maxBridgeCalls?: number;
  maxSourceLength?: number;
  maxBridgePayloadBytes?: number;
  onMemorySample?: (sample: { phase: 'initialized' | 'completed'; usedBytes: number; limitBytes: number }) => void;
}

/** Execute a server action in QuickJS. Only the supplied host bridge is exposed. */
export async function runServerScript(source: string, bridge: SafeScriptBridge, options: ScriptSandboxOptions = {}): Promise<ExprValue> {
  if (typeof source !== 'string') throw new TypeError('Script must be a string');
  if (options.maxSourceLength !== undefined && (!Number.isInteger(options.maxSourceLength) || options.maxSourceLength < 1)) {
    throw new RangeError('Script source limit must be a positive integer');
  }
  const maxSourceLength = Math.min(options.maxSourceLength ?? 50_000, 50_000);
  if (!Number.isInteger(maxSourceLength) || maxSourceLength < 1) throw new RangeError('Script source limit must be a positive integer');
  if (source.length > maxSourceLength) throw new RangeError('Script size quota exceeded');
  const timeoutMs = options.timeoutMs ?? 100;
  const memoryLimitBytes = options.memoryLimitBytes ?? 16 * 1024 * 1024;
  const maxRows = options.maxRows ?? 1_000;
  const maxBridgeCalls = options.maxBridgeCalls ?? 1_000;
  if (options.maxBridgePayloadBytes !== undefined && (!Number.isInteger(options.maxBridgePayloadBytes) || options.maxBridgePayloadBytes < 1)) {
    throw new RangeError('Script bridge payload limit must be a positive integer');
  }
  const maxBridgePayloadBytes = Math.min(options.maxBridgePayloadBytes ?? 256 * 1024, 1024 * 1024);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new RangeError('Script timeout must be between 1 and 30000ms');
  if (!Number.isInteger(memoryLimitBytes) || memoryLimitBytes < 1024 * 1024 || memoryLimitBytes > 256 * 1024 * 1024) throw new RangeError('Script memory limit must be between 1MiB and 256MiB');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100_000) throw new RangeError('Script row limit must be between 1 and 100000');
  if (!Number.isInteger(maxBridgeCalls) || maxBridgeCalls < 1 || maxBridgeCalls > 10_000) throw new RangeError('Script bridge call limit must be between 1 and 10000');
  if (!Number.isInteger(maxBridgePayloadBytes) || maxBridgePayloadBytes < 1024) throw new RangeError('Script bridge payload limit must be at least 1024 bytes');
  const { newAsyncContext, shouldInterruptAfterDeadline } = await import('quickjs-emscripten');
  const context = await newAsyncContext();
  const runtime = context.runtime;
  runtime.setMemoryLimit(memoryLimitBytes);
  runtime.setMaxStackSize(512 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
  let rowCount = 0;
  let bridgeCalls = 0;
  let quotaFailure: Error | undefined;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const sampleMemory = (phase: 'initialized' | 'completed'): void => {
    if (!options.onMemorySample) return;
    const usage = runtime.computeMemoryUsage();
    try {
      const snapshot = context.dump(usage) as { memory_used_size?: number };
      options.onMemorySample({ phase, usedBytes: Number(snapshot.memory_used_size ?? 0), limitBytes: memoryLimitBytes });
    } finally { usage.dispose(); }
  };
  const deadlineTimer = setTimeout(() => controller.abort(new Error('Script time quota exceeded')), timeoutMs);
  const expose = (name: string, callback: (...args: ExprValue[]) => Promise<ExprValue> | ExprValue): void => {
    const handle = context.newAsyncifiedFunction(name, async (...args) => {
      bridgeCalls += 1;
      if (bridgeCalls > maxBridgeCalls) {
        quotaFailure ??= new RangeError('Script bridge call quota exceeded');
        throw quotaFailure;
      }
      const values = args.map((arg) => context.dump(arg)) as ExprValue[];
      const failQuota = (message: string): never => {
        quotaFailure ??= new RangeError(message);
        throw quotaFailure;
      };
      if (controller.signal.aborted) failQuota('Script time quota exceeded');
      if (new TextEncoder().encode(JSON.stringify(values)).byteLength > maxBridgePayloadBytes) failQuota('Script bridge payload quota exceeded');
      let callValues = values;
      if (name === '__nx_search' || name === '__nx_claim') {
        const suppliedOptions = values[2];
        if (suppliedOptions !== undefined && suppliedOptions !== null && (typeof suppliedOptions !== 'object' || Array.isArray(suppliedOptions))) {
          throw new TypeError('search options must be an object');
        }
        const requestedLimit = typeof suppliedOptions === 'object' && suppliedOptions !== null && !Array.isArray(suppliedOptions) && typeof suppliedOptions.limit === 'number'
          ? suppliedOptions.limit : maxRows;
        if (!Number.isInteger(requestedLimit) || requestedLimit < 0) throw new TypeError('search limit must be a non-negative integer');
        const remaining = maxRows - rowCount;
        if (requestedLimit === 0) return context.newString('[]');
        if (remaining <= 0) failQuota('Script row quota exceeded');
        const boundedLimit = Math.min(remaining, requestedLimit);
        callValues = [values[0]!, values[1], { ...(suppliedOptions as Record<string, ExprValue> | undefined), limit: boundedLimit }];
      } else if (['__nx_create', '__nx_write', '__nx_unlink', '__nx_message_post', '__nx_lock'].includes(name)) {
        const inputRows = values[1];
        const cost = Array.isArray(inputRows) ? inputRows.length : 1;
        if (rowCount + cost > maxRows) failQuota('Script row quota exceeded');
        rowCount += cost;
      } else if (name === '__nx_call' && rowCount >= maxRows) failQuota('Script row quota exceeded');
      // Await each host operation before QuickJS resumes. The adapter must observe
      // cancellation, settle/abort in-flight DB work, then allow caller rollback.
      const result = await callback(...callValues);
      if (controller.signal.aborted) failQuota('Script time quota exceeded');
      if ((name === '__nx_search' || name === '__nx_claim') && Array.isArray(result)) {
        if (result.length > Number((callValues[2] as { limit: number }).limit)) failQuota('Script row quota exceeded');
        rowCount += result.length;
      }
      let guestResult: ExprValue = result;
      if (name === '__nx_call') {
        if (typeof result !== 'object' || result === null || Array.isArray(result) || !('value' in result) || !('rowsConsumed' in result)) {
          failQuota('Action bridge must report consumed rows');
        }
        const actionResult = result as { value: ExprValue; rowsConsumed: number };
        if (!Number.isInteger(actionResult.rowsConsumed) || actionResult.rowsConsumed < 0 || actionResult.rowsConsumed > maxRows - rowCount) {
          failQuota('Action bridge exceeded its row quota');
        }
        rowCount += actionResult.rowsConsumed;
        guestResult = actionResult.value;
      }
      if (quotaFailure) throw quotaFailure;
      return context.newString(JSON.stringify(guestResult ?? null));
    });
    context.setProp(context.global, name, handle);
    handle.dispose();
  };
  try {
    expose('__nx_search', (model, domain, opts) => bridge.search(String(model), domain, opts, controller.signal));
    expose('__nx_create', (model, values) => bridge.create(String(model), values, controller.signal));
    expose('__nx_write', (model, ids, values) => bridge.write(String(model), ids, values, controller.signal));
    expose('__nx_unlink', (model, ids) => bridge.unlink(String(model), ids, controller.signal));
    expose('__nx_message_post', (model, ids, message) => bridge.message_post(String(model), ids, String(message), controller.signal));
    expose('__nx_call', (id, args) => bridge.call(String(id), args, { maxRows: maxRows - rowCount }, controller.signal));
    const unsupported = (what: string) => (): never => { throw new TypeError(`${what} is not available`); };
    const { lock, claim } = bridge;
    expose('__nx_lock', lock ? (model, ids, opts) => lock.call(bridge, String(model), ids, opts, controller.signal) : unsupported('lock'));
    expose('__nx_claim', claim ? (model, domain, opts) => claim.call(bridge, String(model), domain, opts, controller.signal) : unsupported('claim'));
    expose('__nx_raise', (message) => bridge.raise(String(message)));
    expose('__nx_log', (message) => { bridge.log(String(message)); return null; });
    const bootstrap = `
      globalThis.env = Object.freeze({ model: (name) => Object.freeze({
        search: (domain, options) => JSON.parse(__nx_search(name, domain, options)),
        create: (values) => JSON.parse(__nx_create(name, values)),
        write: (ids, values) => JSON.parse(__nx_write(name, ids, values)),
        unlink: (ids) => JSON.parse(__nx_unlink(name, ids)),
        lock: (ids, options) => JSON.parse(__nx_lock(name, ids, options)),
        claim: (domain, options) => JSON.parse(__nx_claim(name, domain, options))
      }) });
      globalThis.message_post = (model, ids, message) => JSON.parse(__nx_message_post(model, ids, message));
      globalThis.call_action = (actionId, args) => JSON.parse(__nx_call(actionId, args));
      globalThis.raise = (message) => JSON.parse(__nx_raise(message));
      globalThis.log = (message) => JSON.parse(__nx_log(message));
      Object.freeze(globalThis.env);
    `;
    const init = await context.evalCodeAsync(bootstrap);
    if (init.error) throw new Error(errorMessage(context, init.error));
    init.value.dispose();
    sampleMemory('initialized');
    const result = await context.evalCodeAsync(source);
    if (Date.now() > deadline) quotaFailure ??= new RangeError('Script time quota exceeded');
    if (result.error) {
      const message = errorMessage(context, result.error);
      throw new Error(message);
    }
    try {
      if (quotaFailure) throw quotaFailure;
      const value = context.dump(result.value) as ExprValue;
      if (Date.now() > deadline) throw new RangeError('Script time quota exceeded');
      sampleMemory('completed');
      return value;
    } finally { result.value.dispose(); }
  } finally {
    clearTimeout(deadlineTimer);
    // Async contexts own their runtime; disposal releases installed functions and host references.
    context.dispose();
  }
}

function errorMessage(context: { dump(handle: { dispose(): void }): unknown }, error: { dispose(): void }): string {
  const dumped = context.dump(error);
  error.dispose();
  if (typeof dumped === 'object' && dumped !== null && 'message' in dumped) return String((dumped as { message: unknown }).message);
  return typeof dumped === 'string' ? dumped : JSON.stringify(dumped);
}
