import type { FieldDef, Registry, SqlDriver } from '../contracts/index.js';
import { isColumn } from '../orm/registry.js';

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

/**
 * Additive schema sync (T2 baseline): create missing tables, then missing columns.
 * Never drops or retypes columns — destructive changes belong to confirmed migrations (T4).
 */
export async function syncSchema(registry: Registry, db: SqlDriver): Promise<void> {
  const models = [...registry.models.values()].filter((m) => m.table);
  await db.transaction(async (tx) => {
    for (const m of models) {
      await tx.query({ text: `CREATE TABLE IF NOT EXISTS "${m.table}" (id SERIAL PRIMARY KEY)`, params: [] });
    }
    for (const m of models) {
      const rows = await tx.query<{ column_name: string }>({
        text: `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
        params: [m.table],
      });
      const existing = new Set(rows.map((r) => r.column_name));
      for (const f of m.fields.values()) {
        if (f.name === 'id' || !isColumn(f) || existing.has(f.name)) continue;
        let ddl = `ALTER TABLE "${m.table}" ADD COLUMN "${f.name}" ${columnType(f)}`;
        if (f.type === 'many2one') {
          const ref = registry.get(f.comodel!).table;
          const od = { cascade: 'CASCADE', 'set null': 'SET NULL', restrict: 'RESTRICT' }[f.ondelete ?? 'set null'];
          ddl += ` REFERENCES "${ref}"(id) ON DELETE ${od}`;
        }
        await tx.query({ text: ddl, params: [] });
      }
    }
  });
}
