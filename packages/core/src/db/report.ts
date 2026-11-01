export interface ReportColumn {
  field: string;
  label: string;
  aggregate?: 'sum' | 'count' | 'avg' | 'min' | 'max';
}

export interface ReportFilter {
  field: string;
  op: string;
  value: unknown;
}

export interface ReportSpec {
  entity: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
  groupBy: string[];
  orderBy?: { field: string; dir: 'asc' | 'desc' };
}

/** Apply filters to a list of records. */
export function applyReportFilters(rows: Record<string, unknown>[], filters: ReportFilter[]): Record<string, unknown>[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const v = row[f.field];
      switch (f.op) {
        case '=': return v === f.value;
        case '!=': return v !== f.value;
        case '>': return Number(v) > Number(f.value);
        case '<': return Number(v) < Number(f.value);
        case '>=': return Number(v) >= Number(f.value);
        case '<=': return Number(v) <= Number(f.value);
        case 'contains': return String(v).includes(String(f.value));
        default: return true;
      }
    }),
  );
}

/** Group rows by a field. */
export function groupRows(rows: Record<string, unknown>[], field: string): Map<unknown, Record<string, unknown>[]> {
  const map = new Map<unknown, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = r[field];
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

/** Aggregate a column over rows. */
export function aggregate(rows: Record<string, unknown>[], field: string, fn: 'sum' | 'count' | 'avg' | 'min' | 'max'): number {
  const vals = rows.map((r) => Number(r[field])).filter((n) => !Number.isNaN(n));
  switch (fn) {
    case 'sum': return vals.reduce((a, b) => a + b, 0);
    case 'count': return rows.length;
    case 'avg': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    case 'min': return vals.length ? Math.min(...vals) : 0;
    case 'max': return vals.length ? Math.max(...vals) : 0;
  }
}