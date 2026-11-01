import type { DialectAdapter, SchemaDiff, DDLStep, TableDef, ColumnDef, TableAlter } from './dialect';
import type { DbCapabilities } from '@nexa/types';

const caps: DbCapabilities = {
  transactionalDDL: true,
  schemas: false,
  jsonIndex: false,
  nativeDecimal: false,
  rowLevelSecurity: false,
  alterColumnConstraints: false,
};

// Decimal stored as INTEGER in minor units; scale is recorded per field in meta_field.
const TYPE_MAP: Record<string, string> = {
  boolean: 'integer',
  decimal: 'integer',
  json: 'text',
  datetime: 'text',
  text: 'text',
  uuid: 'text',
  integer: 'integer',
  bigint: 'integer',
};

export class SqliteDialectAdapter implements DialectAdapter {
  readonly dialect = 'sqlite' as const;
  readonly capabilities = caps;

  mapType(logical: string, _params?: { precision?: number; scale?: number; length?: number }): string {
    return TYPE_MAP[logical] ?? 'text';
  }

  quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  qualifyTable(namespace: string, table: string): string {
    // SQLite has no schemas; namespace is the db file. Table name is unqualified.
    void namespace;
    return this.quoteIdentifier(table);
  }

  async createTenantNamespace(_name: string): Promise<void> {
    // SQLite: namespace = a separate database file per tenant. Created by the connection layer.
  }

  async dropTenantNamespace(_name: string): Promise<void> {
    // Delete the tenant's db file.
  }

  generateDDL(diff: SchemaDiff): DDLStep[] {
    const steps: DDLStep[] = [];
    for (const t of diff.addedTables) {
      steps.push({
        id: `create_table_${t.name}`,
        sql: this.createTableSQL(t),
        reversible: true,
        downSql: `DROP TABLE IF EXISTS ${this.quoteIdentifier(t.name)}`,
      });
    }
    for (const alter of diff.alteredTables) {
      if (alter.newTableDef) {
        steps.push(this.buildRebuildStep(alter.table, alter.newTableDef));
      } else {
        for (const col of alter.addedColumns) {
          steps.push({
            id: `add_col_${alter.table}_${col.physicalName}`,
            sql: `ALTER TABLE ${this.quoteIdentifier(alter.table)} ADD COLUMN ${this.columnSQL(col)}`,
            reversible: false,
          });
        }
        for (const col of alter.droppedColumns) {
          // SQLite >= 3.35 supports DROP COLUMN.
          steps.push({
            id: `drop_col_${alter.table}_${col}`,
            sql: `ALTER TABLE ${this.quoteIdentifier(alter.table)} DROP COLUMN ${this.quoteIdentifier(col)}`,
            reversible: false,
          });
        }
      }
    }
    for (const t of diff.droppedTables) {
      steps.push({
        id: `drop_table_${t}`,
        sql: `DROP TABLE IF EXISTS ${this.quoteIdentifier(t)}`,
        reversible: false,
      });
    }
    return steps;
  }

  /** Atomic table rebuild following SQLite's recommended procedure. */
  buildRebuildStep(oldTableName: string, newTable: TableDef): DDLStep {
    const q = (n: string) => this.quoteIdentifier(n);
    const cols = newTable.columns.map((c) => this.columnSQL(c)).join(', ');
    const colNames = newTable.columns.map((c) => q(c.physicalName)).join(', ');
    const oldColNames = newTable.columns.map((c) => q(c.physicalName)).join(', ');
    const sql = [
      `PRAGMA foreign_keys = OFF;`,
      `BEGIN IMMEDIATE;`,
      `CREATE TABLE ${q(newTable.name + '__new')} (${cols}, PRIMARY KEY (${q(newTable.primaryKey)}));`,
      `INSERT INTO ${q(newTable.name + '__new')} (${colNames}) SELECT ${oldColNames} FROM ${q(oldTableName)};`,
      `DROP TABLE ${q(oldTableName)};`,
      `ALTER TABLE ${q(newTable.name + '__new')} RENAME TO ${q(newTable.name)};`,
      // Recreate indexes/triggers/views is handled by the caller; placeholder note.
      `PRAGMA foreign_key_check;`,
      `COMMIT;`,
      `PRAGMA foreign_keys = ON;`,
    ].join('\n');
    return {
      id: `rebuild_table_${oldTableName}`,
      sql,
      reversible: false,
    };
  }

  normalizeValue(value: unknown, logicalType: string): unknown {
    if (logicalType === 'boolean' && typeof value === 'number') return value !== 0;
    if (logicalType === 'datetime' && value instanceof Date) return value.toISOString();
    if (logicalType === 'decimal' && typeof value === 'string') return value; // minor units kept as-is
    return value;
  }

  private createTableSQL(t: TableDef): string {
    const cols = t.columns.map((c) => this.columnSQL(c)).join(', ');
    const pk = `PRIMARY KEY (${this.quoteIdentifier(t.primaryKey)})`;
    return `CREATE TABLE ${this.quoteIdentifier(t.name)} (${cols}, ${pk})`;
  }

  private columnSQL(c: ColumnDef): string {
    const type = this.mapType(c.logicalType, { precision: c.precision, scale: c.scale, length: c.length });
    const nullSql = c.nullable ? '' : ' NOT NULL';
    const unique = c.unique ? ' UNIQUE' : '';
    const def = c.default !== undefined ? ` DEFAULT ${this.literal(c.default)}` : '';
    return `${this.quoteIdentifier(c.physicalName)} ${type}${nullSql}${unique}${def}`;
  }

  private literal(v: unknown): string {
    if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
    if (v === null) return 'NULL';
    return String(v);
  }
}