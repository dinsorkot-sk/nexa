import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, Env, LockOptions, Recordset, Registry, SqlDriver } from '../contracts/index.js';
import { RecordsetImpl } from './recordset.js';

/** Odoo convention: uid 1 is the superuser (__system__) and always runs in superuser mode. */
export const SUPERUSER_ID = 1;

/** Per-user security facts, loaded lazily once per env family (see security/access.ts). */
export interface SecurityHolder {
  promise?: Promise<unknown>;
}

/** Record cache: model -> id -> column values. */
export class RecordCache {
  private readonly data = new Map<string, Map<number, Record<string, unknown>>>();
  /** Small derived lookups (e.g. decimal precisions); dropped on every invalidation. */
  readonly memo = new Map<string, unknown>();

  get(model: string, id: number): Record<string, unknown> | undefined {
    return this.data.get(model)?.get(id);
  }

  set(model: string, id: number, values: Record<string, unknown>): void {
    let m = this.data.get(model);
    if (!m) this.data.set(model, (m = new Map()));
    m.set(id, { ...m.get(id), ...values });
  }

  invalidate(model?: string, ids?: readonly number[]): void {
    this.memo.clear();
    if (!model) return this.data.clear();
    if (!ids) return void this.data.delete(model);
    const m = this.data.get(model);
    for (const id of ids) m?.delete(id);
  }
}

export interface EnvInit {
  tenant: string;
  uid: number;
  companyIds?: number[];
  context?: Context;
  su?: boolean;
  registry: Registry;
  db: SqlDriver;
  cache?: RecordCache;
  security?: SecurityHolder;
  automationStack?: readonly string[];
  actionState?: object;
}

/**
 * Record lifecycle hooks (installed by the automation service). They run inside the ORM
 * transaction with the caller's env; a rejection rolls the operation back.
 */
export interface RecordHooks {
  afterCreate(env: EnvImpl, model: string, ids: readonly number[]): Promise<void>;
  beforeWrite(env: EnvImpl, model: string, ids: readonly number[], vals: Record<string, unknown>): Promise<unknown>;
  afterWrite(env: EnvImpl, model: string, ids: readonly number[], vals: Record<string, unknown>, state: unknown): Promise<void>;
  beforeUnlink(env: EnvImpl, model: string, ids: readonly number[]): Promise<void>;
}

let installedHooks: RecordHooks | undefined;
export function setRecordHooks(hooks: RecordHooks | undefined): void { installedHooks = hooks; }
export function recordHooks(): RecordHooks | undefined { return installedHooks; }

/**
 * Record guards (ADR 0004): one installer, not chained. They run first inside the ORM create / write /
 * unlink transaction (before {@link RecordHooks}), also for the superuser, and a rejection rolls the
 * operation back. `vals` of beforeCreate is the caller's raw values, `effective` the same record after
 * defaults were applied.
 */
export interface RecordGuards {
  beforeCreate(env: EnvImpl, model: string, vals: readonly Record<string, unknown>[], effective?: readonly Record<string, unknown>[]): Promise<void>;
  beforeWrite(env: EnvImpl, model: string, ids: readonly number[], vals: Record<string, unknown>): Promise<void>;
  beforeUnlink(env: EnvImpl, model: string, ids: readonly number[]): Promise<void>;
  /** Fields copy() must not copy (the policy supplies them again through defaults). */
  copyExcluded?(env: EnvImpl, model: string): Promise<ReadonlySet<string> | undefined>;
}

let installedGuards: RecordGuards | undefined;
export function setRecordGuards(guards: RecordGuards | undefined): void { installedGuards = guards; }
export function recordGuards(): RecordGuards | undefined { return installedGuards; }

/**
 * ORM transaction frames (async-context scoped): process-level caches that mirror uncommitted
 * configuration (the policy index) register a callback on the OUTERMOST frame, which runs when that
 * transaction ends (commit or rollback), and only then. Other transactions' ends never trigger it.
 */
interface TxFrame { readonly root: TxFrame; readonly onEnd: Array<() => void> }
const txStorage = new AsyncLocalStorage<TxFrame>();
function newRootFrame(): TxFrame {
  const frame = { onEnd: [] as Array<() => void> } as { root?: TxFrame; onEnd: Array<() => void> };
  frame.root = frame as TxFrame;
  return frame as TxFrame;
}
/** Identity of the outermost ORM transaction of the current async context (undefined outside any). */
export function currentTransactionRoot(): object | undefined { return txStorage.getStore()?.root; }
/** Runs `cb` once when the outermost ORM transaction of this async context has ended; false when there is none. */
export function afterOutermostTransaction(cb: () => void): boolean {
  const frame = txStorage.getStore();
  if (!frame) return false;
  frame.root.onEnd.push(cb);
  return true;
}

/**
 * Stored default values (ir.default-like) for a model, already resolved by scope precedence.
 * Consulted after context `default_*` keys and before field defaults. Installed by the config service.
 */
export type DefaultsProvider = (env: EnvImpl, model: string) => Promise<ReadonlyMap<string, unknown> | undefined>;
let installedDefaults: DefaultsProvider | undefined;
export function setDefaultsProvider(provider: DefaultsProvider | undefined): void { installedDefaults = provider; }
export function defaultsProvider(): DefaultsProvider | undefined { return installedDefaults; }

/**
 * Execution environment. Envs are meant to be short-lived (one per request/job): the cache
 * only sees writes made through this env and its derivatives (sudo/withContext/transaction).
 * Writes from other envs or raw SQL are not visible to an already-populated cache.
 */
export class EnvImpl implements Env {
  readonly tenant: string;
  readonly uid: number;
  readonly companyIds: number[];
  readonly context: Context;
  readonly su: boolean;
  readonly registry: Registry;
  readonly db: SqlDriver;
  readonly cache: RecordCache;
  readonly security: SecurityHolder;
  /** Automation rules currently executing in this call chain (not caller-controllable context). */
  readonly automationStack: readonly string[];
  /** Shared server-action run state (row budget) for a whole action/automation cascade. */
  readonly actionState: object | undefined;

  constructor(init: EnvInit) {
    this.tenant = init.tenant;
    this.uid = init.uid;
    this.companyIds = init.companyIds ?? [];
    this.context = Object.freeze({ ...init.context });
    this.su = init.su ?? init.uid === SUPERUSER_ID;
    this.registry = init.registry;
    this.db = init.db;
    this.cache = init.cache ?? new RecordCache();
    this.security = init.security ?? {};
    this.automationStack = Object.freeze([...(init.automationStack ?? [])]);
    this.actionState = init.actionState;
  }

  private derive(patch: Partial<EnvInit>): EnvImpl {
    return new EnvImpl({
      tenant: this.tenant, uid: this.uid, companyIds: this.companyIds, context: this.context,
      su: this.su, registry: this.registry, db: this.db, cache: this.cache, security: this.security,
      automationStack: this.automationStack, actionState: this.actionState, ...patch,
    });
  }

  model(name: string): Recordset {
    this.registry.get(name); // throws on unknown model
    return new RecordsetImpl(this, name, []);
  }

  sudo(): Env {
    return this.derive({ su: true });
  }

  /** Env marked as running automation rule `key` (used to stop self-triggering). */
  withAutomation(key: string): EnvImpl {
    // automations never inherit sudo from the triggering operation; only uid 1 stays superuser
    return this.derive({ automationStack: [...this.automationStack, key], su: this.uid === SUPERUSER_ID });
  }

  /** Env carrying a server-action run state shared by nested actions and the automations they trigger. */
  withActionState(state: object): EnvImpl {
    return this.derive({ actionState: state });
  }

  lock(model: string, ids: number | number[], opts?: LockOptions): Promise<number[]> {
    return this.model(model).browse(ids).lock(opts);
  }

  /** Env with exactly this context (no merge), e.g. to drop a one-shot key. */
  withExactContext(context: Context): EnvImpl {
    return this.derive({ context });
  }

  withContext(patch: Partial<Context>): Env {
    return this.derive({ context: { ...this.context, ...patch } });
  }

  /**
   * Shares this env's cache. On failure the whole cache is dropped, since values loaded or
   * written inside the rolled-back (sub)transaction may no longer match the database.
   */
  async transaction<T>(fn: (env: Env) => Promise<T>): Promise<T> {
    const parent = txStorage.getStore();
    const frame: TxFrame = parent ? { root: parent.root, onEnd: [] } : newRootFrame();
    try {
      return await txStorage.run(frame, () => this.db.transaction(() => fn(this)));
    } catch (err) {
      this.cache.invalidate();
      throw err;
    } finally {
      if (frame.root === frame) for (const cb of frame.onEnd) cb();
    }
  }
}
