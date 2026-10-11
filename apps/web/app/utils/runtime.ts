import type { FieldDefinition } from '@nexa/meta';

const NON_SORTABLE_TYPES = new Set(['multiSelect', 'json', 'formula', 'computed', 'autoNumber']);
const NUMERIC_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);
const COMPUTED_TYPES = new Set(['formula', 'computed', 'autoNumber']);

export function defaultViewColumns(fields: FieldDefinition[]): FieldDefinition[] {
  return fields
    .filter((field) => !field.options.hidden)
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const delta = left.field.position - right.field.position;
      return delta !== 0 ? delta : left.index - right.index;
    })
    .map((entry) => entry.field);
}

export function defaultSortField(fields: FieldDefinition[]): FieldDefinition | undefined {
  const visible = defaultViewColumns(fields);
  return visible.find((field) => field.options.unique)
    ?? visible.find((field) => !NON_SORTABLE_TYPES.has(field.type));
}

function matchesHeader(field: FieldDefinition, header: string): boolean {
  return field.name.toLowerCase() === header.toLowerCase() || field.id.toLowerCase() === header.toLowerCase();
}

function coerceValue(field: FieldDefinition, value: string): unknown {
  if (NUMERIC_TYPES.has(field.type)) return Number(value);
  if (field.type === 'boolean') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return value;
}

export function csvRowToRecordData(fields: FieldDefinition[], headers: string[], row: string[]): { data: Record<string, unknown>; skipped: string[] } {
  const data: Record<string, unknown> = {};
  const skipped: string[] = [];
  headers.forEach((header, index) => {
    const field = fields.find((candidate) => matchesHeader(candidate, header));
    if (!field) {
      skipped.push(header);
      return;
    }
    if (field.options.hidden || field.options.readonly || COMPUTED_TYPES.has(field.type)) {
      skipped.push(field.id);
      return;
    }
    const cell = row[index];
    if (cell === undefined || cell === '') return;
    data[field.id] = coerceValue(field, cell);
  });
  return { data, skipped };
}
