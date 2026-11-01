import type { DbCapabilities, DbDialect } from '@nexa/types';

export interface DialectAdapter {
  readonly dialect: DbDialect;
  readonly capabilities: DbCapabilities;

  /** Map a logical type to the physical column type for this DB. */
  mapType(logical: string, params?: { precision?: number; scale?: number; length?: number }): string;

  /** Quote an identifier safely for this DB. */
  quoteIdentifier(name: string): string;

  /** Qualify a table name with a tenant namespace. */
  qualifyTable(namespace: string, table: string): string;

  /** Create a tenant namespace (schema/database/file) if it does not exist. */
  createTenantNamespace(name: string): Promise<void>;

  /** Drop a tenant namespace. */
  dropTenantNamespace(name: string): Promise<void>;

  /** Generate DDL steps for a schema diff. */
  generateDDL(diff: SchemaDiff): DDLStep[];

  /** Normalize a value read from this DB into the canonical app representation. */
  normalizeValue(value: unknown, logicalType: string): unknown;
}

export interface SchemaDiff {
  addedTables: TableDef[];
  droppedTables: string[];
  alteredTables: TableAlter[];
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  primaryKey: string;
}

export interface ColumnDef {
  name: string;
  logicalType: string;
  nullable: boolean;
  unique?: boolean;
  default?: unknown;
  physicalName: string;
  precision?: number;
  scale?: number;
  length?: number;
}

export interface TableAlter {
  table: string;
  addedColumns: ColumnDef[];
  droppedColumns: string[];
  alteredColumns: { name: string; from: string; to: string }[];
  /** Full new table definition; used by SQLite for atomic table rebuild. */
  newTableDef?: TableDef;
}

export interface DDLStep {
  id: string;
  sql: string;
  reversible: boolean;
  downSql?: string;
}