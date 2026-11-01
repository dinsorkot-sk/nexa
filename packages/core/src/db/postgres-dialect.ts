import type { DialectAdapter, SchemaDiff, DDLStep, TableDef, ColumnDef, TableAlter } from './dialect';
import type { DbCapabilities } from '@nexa/types';

const caps: DbCapabilities = {
  transactionalDDL: true,
  schemas: true,
  jsonIndex: true,
  nativeDecimal: true,
  rowLevelSecurity: true,
  alterColumnConstraints: true,
};

const TYPE_MAP: Record<string, string> = {
  boolean: 'boolean',
  decimal: 'numeric',
  json: 'jsonb',
  datetime: 'timestamptz',
  text: 'text',
  uuid: 'uuid',
  integer: 'integer',
  bigint: 'bigint',
};

export class PostgresDialectAdapter implements DialectAdapter {
  readonly dialect = 'postgres' as const;
  readonly capabilities = caps;

  mapType(logical: string, params?: { precision?: number; scale?: number; length?: number }): string {
    if (logical === 'decimal' && params?.precision && params?.scale) {
      return `numeric(${params.precision},${params.scale})`;
    }
    if (logical === 'text' && params?.length) {
      return `varchar(${params.length})`;
    }
    return TYPE_MAP[logical] ?? 'text';
  }

  quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  qualifyTable(namespace: string, table: string): string {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  async createTenantNamespace(name: string): Promise<void> {
    // Executed by the migration runner; SQL exposed for transparency.
    void name;
  }

  async dropTenantNamespace(name: string): Promise<void> {
    void name;
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
      for (const col of alter.addedColumns) {
        steps.push({
          id: `add_col_${alter.table}_${col.physicalName}`,
          sql: `ALTER TABLE ${this.quoteIdentifier(alter.table)} ADD COLUMN ${this.columnSQL(col)}`,
          reversible: true,
          downSql: `ALTER TABLE ${this.quoteIdentifier(alter.table)} DROP COLUMN ${this.quoteIdentifier(col.physicalName)}`,
        });
      }
      for (const col of alter.droppedColumns) {
        steps.push({
          id: `drop_col_${alter.table}_${col}`,
          sql: `ALTER TABLE ${this.quoteIdentifier(alter.table)} DROP COLUMN ${this.quoteIdentifier(col)}`,
          reversible: false,
        });
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

  normalizeValue(value: unknown, logicalType: string): unknown {
    if (logicalType === 'boolean' && typeof value === 'number') return value !== 0;
    if (logicalType === 'datetime' && value instanceof Date) return value.toISOString();
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