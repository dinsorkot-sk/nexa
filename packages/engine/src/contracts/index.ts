// Engine contracts (ADR 0001). Implementations live in sibling folders (orm, domain, schema, ...).

// ---------- Fields ----------
export type ScalarFieldType =
  | 'char' | 'text' | 'html' | 'integer' | 'float' | 'monetary' | 'boolean'
  | 'date' | 'datetime' | 'selection' | 'json' | 'binary';
export type RelationalFieldType = 'many2one' | 'one2many' | 'many2many';
export type FieldType = ScalarFieldType | RelationalFieldType;

export type OnDelete = 'cascade' | 'set null' | 'restrict';

export interface FieldDef {
  type: FieldType;
  string?: string;
  help?: string;
  required?: boolean;
  readonly?: boolean;
  index?: boolean;
  unique?: boolean;
  default?: unknown | ((env: Env) => unknown);
  /** selection options */
  selection?: ReadonlyArray<readonly [value: string, label: string]>;
  /** relational */
  comodel?: string;
  inverseName?: string;       // one2many
  relationTable?: string;     // many2many (default '<t1>_<t2>_rel', tables sorted)
  column1?: string;           // many2many: column pointing at this model
  column2?: string;           // many2many: column pointing at comodel
  ondelete?: OnDelete;
  /** computed / related */
  compute?: string | ComputeFn;
  depends?: string[];
  store?: boolean;
  related?: string;           // dotted path e.g. 'partner_id.country_id'
  /** money */
  currencyField?: string;
  /** groups allowed to read the field */
  groups?: string[];
}

/**
 * Compute values for a batch of records; return a value per id (missing ids get null).
 * Read dependencies through `records.read([...])`; the engine recomputes stored fields when
 * any `depends` path changes.
 */
export type ComputeFn = (records: Recordset) => ComputedValues | Promise<ComputedValues>;
export type ComputedValues = Record<number, unknown> | Map<number, unknown>;

// ---------- Models ----------
export interface ModelDef {
  name: string;               // e.g. 'res.partner'
  description?: string;
  table?: string;             // default derived from name
  abstract?: boolean;         // no table (mixin)
  transient?: boolean;        // wizard, auto vacuum
  extends?: string[];         // Odoo _inherit (mixin / extension)
  delegates?: Record<string, string>; // Odoo _inherits: comodel -> m2o field
  order?: string;
  recName?: string;
  fields: Record<string, FieldDef>;
  constraints?: ConstraintDef[];
  onchange?: Record<string, OnchangeFn>;
  methods?: Record<string, ModelMethod>;
  origin: 'module' | 'custom'; // code (low-code) vs nx_model (no-code)
  module?: string;
}

export interface ConstraintDef {
  name: string;
  sql?: string;                                       // e.g. 'UNIQUE(code, company_id)'
  check?: (records: Recordset) => void | Promise<void>; // throw ValidationError
  fields?: string[];
  message?: string;
}

export type OnchangeFn = (draft: Record<string, unknown>, env: Env) => Partial<Record<string, unknown>> | Promise<Partial<Record<string, unknown>>>;
export type ModelMethod = (records: Recordset, ...args: unknown[]) => unknown;

// ---------- Domain (Odoo-style polish notation) ----------
export type DomainOperator =
  | '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not in'
  | 'like' | 'ilike' | 'not like' | 'not ilike' | '=like' | '=ilike'
  | 'child_of' | 'parent_of' | 'any' | 'not any';
export type DomainLeaf = readonly [field: string, op: DomainOperator, value: unknown];
export type DomainTerm = '&' | '|' | '!' | DomainLeaf;
export type Domain = ReadonlyArray<DomainTerm>;

export interface CompiledSql {
  text: string;
  params: unknown[];
}

// ---------- Persistence ----------
export interface SqlDriver {
  query<T = Record<string, unknown>>(sql: CompiledSql): Promise<T[]>;
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface TenantManager {
  open(tenant: string): Promise<TenantHandle>;
  create(tenant: string, modules: string[]): Promise<TenantHandle>;
  list(): Promise<string[]>;
}

export interface TenantHandle {
  tenant: string;
  driver: SqlDriver;
  registry: Registry;
  env(ctx: { uid: number; companyIds?: number[]; context?: Context }): Env;
}

// ---------- Registry & environment ----------
export interface Registry {
  readonly models: ReadonlyMap<string, ResolvedModel>;
  get(name: string): ResolvedModel;
  /** rebuild from modules + nx_model rows; atomic swap */
  reload(): Promise<void>;
}

export interface ResolvedModel {
  name: string;
  table: string | null;
  fields: ReadonlyMap<string, FieldDef & { name: string; model: string }>;
  def: ModelDef;
}

export type Context = Record<string, unknown> & { lang?: string; tz?: string; activeTest?: boolean };

export interface Env {
  readonly tenant: string;
  readonly uid: number;
  readonly companyIds: number[];
  readonly context: Context;
  readonly su: boolean;
  model(name: string): Recordset;
  sudo(): Env;
  withContext(patch: Partial<Context>): Env;
  /** run fn atomically; nested calls join the outer transaction */
  transaction<T>(fn: (env: Env) => Promise<T>): Promise<T>;
}

export interface SearchOptions {
  offset?: number;
  limit?: number;
  order?: string;
}

export interface Recordset {
  readonly env: Env;
  readonly model: string;
  readonly ids: readonly number[];
  browse(ids: number | number[]): Recordset;
  search(domain: Domain, opts?: SearchOptions): Promise<Recordset>;
  searchCount(domain: Domain): Promise<number>;
  searchRead(domain: Domain, fields?: string[], opts?: SearchOptions): Promise<Record<string, unknown>[]>;
  read(fields?: string[]): Promise<Record<string, unknown>[]>;
  create(vals: Record<string, unknown> | Record<string, unknown>[]): Promise<Recordset>;
  write(vals: Record<string, unknown>): Promise<void>;
  unlink(): Promise<void>;
  call(method: string, ...args: unknown[]): Promise<unknown>;
  checkAccess(op: AccessOperation): Promise<void>;
  /** Run onchange handlers for `field` on unsaved values; returns the resulting values patch. */
  onchange(values: Record<string, unknown>, field: string): Promise<Record<string, unknown>>;
}

/** Relational write commands (Odoo Command equivalents) */
export type X2ManyCommand =
  | { op: 'create'; values: Record<string, unknown> }
  | { op: 'update'; id: number; values: Record<string, unknown> }
  | { op: 'delete'; id: number }
  | { op: 'unlink'; id: number }
  | { op: 'link'; id: number }
  | { op: 'clear' }
  | { op: 'set'; ids: number[] };

// ---------- Security ----------
export type AccessOperation = 'read' | 'write' | 'create' | 'unlink';

export interface AccessRule {
  model: string;
  group: string | null;  // null = everyone
  perms: Record<AccessOperation, boolean>;
}

export interface RecordRule {
  name: string;
  model: string;
  groups: string[];      // empty = global (always applied, AND)
  domain: Domain | string; // string = sandboxed expression evaluated with { user, companyIds }
  perms: Record<AccessOperation, boolean>;
}

// ---------- Modules ----------
export interface ModuleManifest {
  name: string;
  version: string;
  summary?: string;
  depends: string[];
  models?: ModelDef[];
  access?: AccessRule[];
  rules?: RecordRule[];
  views?: ViewDef[];
  actions?: ActionDef[];
  menus?: MenuDef[];
  data?: DataRecord[];
  hooks?: {
    preInit?: (env: Env) => Promise<void>;
    postInit?: (env: Env) => Promise<void>;
    migrate?: Record<string, (env: Env) => Promise<void>>; // by version
    uninstall?: (env: Env) => Promise<void>;
  };
}

export interface DataRecord {
  xmlId: string;          // stable external id, e.g. 'base.main_company'
  model: string;
  values: Record<string, unknown>;
  noUpdate?: boolean;
}

// ---------- UI metadata ----------
export type ViewType = 'list' | 'form' | 'kanban' | 'search' | 'calendar' | 'pivot' | 'graph';

export interface ViewNode {
  tag: string;            // 'field' | 'group' | 'notebook' | 'page' | 'button' | 'header' | ...
  attrs?: Record<string, unknown>;
  children?: ViewNode[];
}

export interface ViewDef {
  xmlId: string;
  model: string;
  type: ViewType;
  priority?: number;
  arch?: ViewNode;
  inherit?: { from: string; patches: ViewPatch[] };
  groups?: string[];
}

export interface ViewPatch {
  target: string;         // selector e.g. "field[name=partner_id]"
  position: 'before' | 'after' | 'inside' | 'replace' | 'attributes';
  node?: ViewNode;
  attrs?: Record<string, unknown>;
}

export interface ActionDef {
  xmlId: string;
  type: 'window' | 'server' | 'url' | 'report' | 'client';
  name: string;
  model?: string;
  viewTypes?: ViewType[];
  domain?: Domain;
  context?: Context;
  code?: string;          // server action (sandboxed)
}

export interface MenuDef {
  xmlId: string;
  name: string;
  parent?: string;
  action?: string;
  sequence?: number;
  groups?: string[];
}

// ---------- Errors ----------
export class EngineError extends Error {}
export class AccessError extends EngineError {}
export class ValidationError extends EngineError {}
export class MissingRecordError extends EngineError {}
export class UserError extends EngineError {}
