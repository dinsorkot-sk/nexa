import { createHash } from 'node:crypto';
import { EngineError, type FieldDef, type Registry, type ResolvedModel, type SqlDriver } from '../contracts/index.js';
import { isColumn } from '../orm/registry.js';

/** Table of res.users; its id 1 is reserved for the superuser. */
const USERS_TABLE = 'res_users';

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/** Validate an SQL identifier before quoting it (never interpolate unchecked names). */
export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name) || name.length > 63) throw new EngineError(`Invalid SQL identifier '${name}'`);
  return `"${name}"`;
}

/** Postgres column type for a stored field. */
export function columnType(f: FieldDef): string {
  switch (f.type) {
    case 'char': case 'text': case 'html': case 'selection': return 'TEXT';
    case 'integer': return 'INTEGER';
    case 'float': return 'DOUBLE PRECISION';
    case 'monetary': return 'NUMERIC';
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'DATE';
    case 'datetime': return 'TIMESTAMP';
    case 'json': return 'JSONB';
    case 'binary': return 'BYTEA';
    case 'many2one': return 'INTEGER';
    default: throw new Error(`No column type for '${f.type}'`);
  }
}

/** information_schema.columns.data_type for each DDL type. */
const DATA_TYPE: Record<string, string> = {
  TEXT: 'text', INTEGER: 'integer', 'DOUBLE PRECISION': 'double precision', NUMERIC: 'numeric',
  BOOLEAN: 'boolean', DATE: 'date', TIMESTAMP: 'timestamp without time zone', JSONB: 'jsonb', BYTEA: 'bytea',
};

/**
 * Deterministic, unambiguous index name: readable prefix + hash of the exact (table, column) pair,
 * so `x_a`.`x_b_c` and `x_a_x_b`.`c` never collide (index names are schema-wide in Postgres).
 */
export function indexName(table: string, column: string, unique: boolean): string {
  const h = createHash('sha1').update(`${table}\0${column}`).digest('hex').slice(0, 12);
  return `${table.slice(0, 22)}_${column.slice(0, 20)}_${h}_${unique ? 'uniq' : 'idx'}`;
}

export type MigrationOp =
  | { kind: 'create_table'; table: string; destructive: false }
  | { kind: 'add_column'; table: string; column: string; field: FieldDef; destructive: false }
  | { kind: 'create_index'; table: string; column: string; name: string; unique: boolean; destructive: false }
  | { kind: 'alter_type'; table: string; column: string; from: string; to: string; destructive: true }
  | { kind: 'drop_column'; table: string; column: string; destructive: true }
  | { kind: 'drop_table'; table: string; destructive: true }
  | { kind: 'create_relation'; table: string; column1: string; table1: string; column2: string; table2: string; destructive: false }
  | { kind: 'create_constraint'; table: string; name: string; sql: string; destructive: false };

export interface MigrationPlan {
  ops: MigrationOp[];
  /** model map the plan was computed for (needed for FK targets) */
  models: ReadonlyMap<string, ResolvedModel>;
}

export interface PlanOptions {
  /** tables no longer in the registry that should be dropped (only these are ever dropped) */
  dropTables?: string[];
}

function modelsOf(src: Registry | ReadonlyMap<string, ResolvedModel>): ReadonlyMap<string, ResolvedModel> {
  return src instanceof Map ? src : (src as Registry).models;
}

/**
 * Diff the registry against the live database. Additive ops are non-destructive; column drops,
 * type changes and table drops are flagged `destructive` and only run with `allowDestructive`.
 */
export async function planMigration(
  src: Registry | ReadonlyMap<string, ResolvedModel>, db: SqlDriver, opts: PlanOptions = {},
): Promise<MigrationPlan> {
  const models = modelsOf(src);
  const ops: MigrationOp[] = [];
  const tables = [...models.values()].filter((m) => m.table);
  const existingTables = new Set((await db.query<{ table_name: string }>({
    text: `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`, params: [],
  })).map((r) => r.table_name));

  for (const m of tables) if (!existingTables.has(m.table!)) ops.push({ kind: 'create_table', table: m.table!, destructive: false });

  for (const m of tables) {
    const table = m.table!;
    quoteIdent(table);
    const cols = new Map((await db.query<{ column_name: string; data_type: string }>({
      text: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
      params: [table],
    })).map((r) => [r.column_name, r.data_type]));
    const idx = new Set((await db.query<{ indexname: string }>({
      text: `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1`, params: [table],
    })).map((r) => r.indexname));

    const wanted = new Set<string>(['id']);
    for (const f of m.fields.values()) {
      if (f.name === 'id' || !isColumn(f)) continue;
      wanted.add(f.name);
      const have = cols.get(f.name);
      const ddlType = columnType(f);
      if (have === undefined) {
        ops.push({ kind: 'add_column', table, column: f.name, field: f, destructive: false });
      } else if (have !== DATA_TYPE[ddlType]) {
        ops.push({ kind: 'alter_type', table, column: f.name, from: have, to: ddlType, destructive: true });
      }
      if (f.unique || f.index) {
        const name = indexName(table, f.name, !!f.unique);
        if (!idx.has(name)) ops.push({ kind: 'create_index', table, column: f.name, name, unique: !!f.unique, destructive: false });
      }
    }
    // NOTE: any column not owned by a field is proposed for dropping (destructive). Callers that apply
    // destructive ops must filter them to an explicit target (see MetadataStore), never apply blindly.
    for (const c of cols.keys()) if (!wanted.has(c)) ops.push({ kind: 'drop_column', table, column: c, destructive: true });
  }

  // many2many relation tables (shared by both sides; created once)
  const relations = new Set<string>();
  for (const m of tables) {
    for (const f of m.fields.values()) {
      if (f.type !== 'many2many' || f.compute || f.related || !f.relationTable) continue;
      if (relations.has(f.relationTable)) continue;
      if (existingTables.has(f.relationTable)) {
        // reuse only a table that really is this relation
        const cols = new Set((await db.query<{ column_name: string }>({
          text: `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
          params: [f.relationTable],
        })).map((r) => r.column_name));
        if (cols.size !== 2 || !cols.has(f.column1!) || !cols.has(f.column2!)) {
          throw new EngineError(`Existing table '${f.relationTable}' is not the relation table of '${m.name}.${f.name}'`);
        }
        relations.add(f.relationTable);
        continue;
      }
      relations.add(f.relationTable);
      ops.push({
        kind: 'create_relation', table: f.relationTable, destructive: false,
        column1: f.column1!, table1: m.table!, column2: f.column2!, table2: models.get(f.comodel!)!.table!,
      });
    }
  }

  // SQL constraints (module code only), named <table>_<constraint>
  const existingConstraints = new Set((await db.query<{ conname: string }>({
    text: `SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = current_schema()`,
    params: [],
  })).map((r) => r.conname));
  for (const m of tables) {
    for (const c of m.def.constraints ?? []) {
      if (!c.sql) continue;
      if (m.def.origin !== 'module') throw new EngineError(`SQL constraint '${c.name}' is only allowed in module code`);
      const name = `${m.table}_${c.name}`;
      quoteIdent(name);
      if (existingConstraints.has(name)) continue;
      existingConstraints.add(name);
      ops.push({ kind: 'create_constraint', table: m.table!, name, sql: c.sql, destructive: false });
    }
  }

  const live = new Set(tables.map((m) => m.table));
  for (const t of opts.dropTables ?? []) {
    if (live.has(t)) throw new EngineError(`Table '${t}' is still used by a model`);
    if (existingTables.has(t)) ops.push({ kind: 'drop_table', table: t, destructive: true });
  }
  return { ops, models };
}

const ON_DELETE = { cascade: 'CASCADE', 'set null': 'SET NULL', restrict: 'RESTRICT' } as const;

function ddlFor(op: MigrationOp, models: ReadonlyMap<string, ResolvedModel>): string {
  const t = quoteIdent(op.table);
  switch (op.kind) {
    case 'create_table': return `CREATE TABLE IF NOT EXISTS ${t} (id SERIAL PRIMARY KEY)`;
    case 'add_column': {
      let ddl = `ALTER TABLE ${t} ADD COLUMN ${quoteIdent(op.column)} ${columnType(op.field)}`;
      if (op.field.type === 'many2one') {
        const ref = models.get(op.field.comodel!)?.table;
        if (!ref) throw new EngineError(`Field '${op.table}.${op.column}' references a model without table`);
        ddl += ` REFERENCES ${quoteIdent(ref)}(id) ON DELETE ${ON_DELETE[op.field.ondelete ?? 'set null']}`;
      }
      return ddl;
    }
    case 'create_index':
      // no IF NOT EXISTS: a name clash must fail loudly instead of silently skipping a unique index
      return `CREATE ${op.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(op.name)} ON ${t} (${quoteIdent(op.column)})`;
    case 'alter_type': {
      if (!(op.to in DATA_TYPE)) throw new EngineError(`Unsupported column type '${op.to}'`);
      const c = quoteIdent(op.column);
      return `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE ${op.to} USING ${c}::${op.to}`;
    }
    case 'drop_column': return `ALTER TABLE ${t} DROP COLUMN ${quoteIdent(op.column)}`;
    case 'drop_table': return `DROP TABLE ${t}`;
    case 'create_relation': {
      const c1 = quoteIdent(op.column1);
      const c2 = quoteIdent(op.column2);
      return `CREATE TABLE ${t} (${c1} INTEGER NOT NULL REFERENCES ${quoteIdent(op.table1)}(id) ON DELETE CASCADE, `
        + `${c2} INTEGER NOT NULL REFERENCES ${quoteIdent(op.table2)}(id) ON DELETE CASCADE, PRIMARY KEY (${c1}, ${c2}))`;
    }
    // module-defined SQL (trusted code, never from no-code metadata)
    case 'create_constraint': return `ALTER TABLE ${t} ADD CONSTRAINT ${quoteIdent(op.name)} ${op.sql}`;
  }
}

/** Apply a plan in one transaction. Refuses (before running anything) if it holds destructive ops and they are not allowed. */
export async function applyMigration(
  plan: MigrationPlan, db: SqlDriver, opts: { allowDestructive?: boolean } = {},
): Promise<void> {
  const bad = plan.ops.filter((o) => o.destructive);
  if (bad.length && !opts.allowDestructive) {
    throw new EngineError(`Migration has destructive operations (${bad.map((o) => `${o.kind} ${o.table}${'column' in o ? '.' + o.column : ''}`).join(', ')}); pass allowDestructive to apply`);
  }
  // tables first, then columns (FKs need target tables), then indexes, then destructive ops
  const rank: Record<MigrationOp['kind'], number> = {
    create_table: 0, add_column: 1, alter_type: 2, create_relation: 3, create_index: 4, create_constraint: 5, drop_column: 6, drop_table: 7,
  };
  const ordered = [...plan.ops].sort((a, b) => rank[a.kind] - rank[b.kind]);
  await db.transaction(async (tx) => {
    for (const op of ordered) {
      await tx.query({ text: ddlFor(op, plan.models), params: [] });
      // uid 1 is the superuser (SUPERUSER_ID): no real user row may ever receive id 1
      if (op.kind === 'create_table' && op.table === USERS_TABLE) {
        await tx.query({ text: `ALTER SEQUENCE ${quoteIdent(USERS_TABLE + '_id_seq')} RESTART WITH 2`, params: [] });
      }
    }
  });
}

/**
 * Additive schema sync: create missing tables, columns and indexes (unique / btree).
 * Never drops or retypes columns — destructive changes go through planMigration/applyMigration.
 */
export async function syncSchema(registry: Registry | ReadonlyMap<string, ResolvedModel>, db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    const plan = await planMigration(registry, tx);
    await applyMigration({ ...plan, ops: plan.ops.filter((o) => !o.destructive) }, tx);
  });
}
