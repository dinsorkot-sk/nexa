/**
 * Sort state the table reports upward. `fieldId` targets a field the API can sort by; the caller
 * turns this into the record query's `sort` parameter (`fieldId:direction`). `null` means no sort.
 */
export type MetaTableSort = { fieldId: string; direction: 'asc' | 'desc' } | null;

/**
 * One filter the table reports upward. Mirrors the API's RecordFilter: `{ fieldId, operator, value }`.
 * The table builds it from the caller-supplied filter editor slot; the API validates it.
 */
export type MetaTableFilter = { fieldId: string; operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'; value: unknown };

/**
 * One row of the table: a record as the list endpoint returns it — `id`, `version`, and `data`
 * keyed by field id, with hidden fields already redacted by the server.
 */
export interface MetaTableRow {
  id: string;
  version: number;
  data: Record<string, unknown>;
}

/**
 * Page of records the caller loaded from `GET /modules/:moduleId/entities/:entityId/records`
 * and hands to the table. `total` drives the pagination; `limit`/`offset` echo the query so the
 * component can show the current range without guessing.
 */
export interface MetaTablePage {
  items: MetaTableRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Resolves a reference id to a display label, as MetaFieldValue expects. */
export type MetaReferenceLabel = (id: string) => string | undefined;

/**
 * Row click payload. The caller decides what opening a record means (navigate, open a dialog).
 */
export interface MetaTableRowClick {
  row: MetaTableRow;
}

/**
 * States the table can be in. `loading` shows skeleton rows; `error` shows a retry affordance the
 * caller wires up; `empty` is derived (loaded, zero rows) unless the caller overrides the text.
 */
export interface MetaTableState {
  loading?: boolean;
  error?: string | null;
  /** Called when the user asks to retry after an error. Absent hides the retry button. */
  retry?: () => void;
}
