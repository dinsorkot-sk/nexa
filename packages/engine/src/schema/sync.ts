import { createHash } from 'node:crypto';
import { EngineError, type FieldDef, type Registry, type ResolvedModel, type SqlDriver } from '../contracts/index.js';
import { isColumn } from '../orm/registry.js';

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

/** Deterministic index name `<table>_<column>_<uniq|idx>`, hashed when over Postgres' 63-char limit. */
export function indexName(table: string, column: string, unique: boolean): string {
  const name = `${table}_${column}_${unique ? 'uniq' : 'idx'}`;
  if (name.length <= 63) return name;
  const h = createHash('sha1').update(name).digest('hex').slice(0, 10);
  return `${name.slice(0, 52)}_${h}`;
}

export type MigrationOp =
  | { kind: 'create_table'; table: string; destructive: false }
  | { kind: 'add_column'; table: string; column: string; field: FieldDef; destructive: false }
  | { kind: 'create_index'; table: string; column: string; name: string; unique: boolean; destructive: false }
  | { kind: 'alter_type'; table: string; column: string; from: string; to: string; destructive: true }
  | { kind: 'drop_column'; table: string; column: string; destructive: true }
  | { kind: 'drop_table'; table: string; destructive: true };

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
    for (const c of cols.keys()) if (!wanted.has(c)) ops.push({ kind: 'drop_column', table, column: c, destructive: true });
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
      return `CREATE ${op.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quoteIdent(op.name)} ON ${t} (${quoteIdent(op.column)})`;
    case 'alter_type': {
      if (!(op.to in DATA_TYPE)) throw new EngineError(`Unsupported column type '${op.to}'`);
      const c = quoteIdent(op.column);
      return `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE ${op.to} USING ${c}::${op.to}`;
    }
    case 'drop_column': return `ALTER TABLE ${t} DROP COLUMN ${quoteIdent(op.column)}`;
    case 'drop_table': return `DROP TABLE ${t}`;
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
  const rank: Record<MigrationOp['kind'], number> = { create_table: 0, add_column: 1, alter_type: 2, create_index: 3, drop_column: 4, drop_table: 5 };
  const ordered = [...plan.ops].sort((a, b) => rank[a.kind] - rank[b.kind]);
  await db.transaction(async (tx) => {
    for (const op of ordered) await tx.query({ text: ddlFor(op, plan.models), params: [] });
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
