import type { EntityDefinition, FieldDefinition } from '@nexa/meta';

export interface RecordValidationIssue {
  fieldId?: string;
  message: string;
}

export class RecordValidationError extends Error {
  readonly issues: RecordValidationIssue[];

  constructor(issues: RecordValidationIssue[]) {
    super('Record data failed validation');
    this.name = 'RecordValidationError';
    this.issues = issues;
  }
}

const numericTypes = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);
const stringTypes = new Set(['text', 'longText', 'email', 'phone', 'url', 'file', 'image']);

function validateValue(field: FieldDefinition, value: unknown): string | undefined {
  const { type, options } = field;
  if (value === null || value === undefined) return options.required ? 'A value is required' : undefined;
  if (numericTypes.has(type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Expected a finite number';
    if (type === 'integer' && !Number.isInteger(value)) return 'Expected an integer';
    if (options.min !== undefined && value < options.min) return `Must be at least ${options.min}`;
    if (options.max !== undefined && value > options.max) return `Must be at most ${options.max}`;
    return undefined;
  }
  if (stringTypes.has(type)) {
    if (typeof value !== 'string') return 'Expected a string';
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Expected a valid email';
    if (type === 'url') {
      try { new URL(value); } catch { return 'Expected a valid URL'; }
    }
    if (options.regex && !new RegExp(options.regex).test(value)) return 'Value does not match the required pattern';
    return undefined;
  }
  if (type === 'boolean') return typeof value === 'boolean' ? undefined : 'Expected a boolean';
  if (['date', 'datetime', 'time'].includes(type)) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(type === 'date' ? `${value}T00:00:00Z` : value))) return 'Expected a valid date/time string';
    return undefined;
  }
  if (type === 'select') {
    if (typeof value !== 'string') return 'Expected a choice value';
    return options.choices?.some((choice) => choice.value === value) ? undefined : 'Value is not an available choice';
  }
  if (type === 'multiSelect') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return 'Expected an array of choice values';
    const allowed = new Set(options.choices?.map((choice) => choice.value) ?? []);
    return value.every((item) => allowed.has(item)) ? undefined : 'Value contains an unavailable choice';
  }
  if (type === 'reference') return typeof value === 'string' ? undefined : 'Expected a record ID';
  if (type === 'json') return typeof value === 'object' && value !== null ? undefined : 'Expected a JSON object or array';
  if (['formula', 'computed', 'autoNumber'].includes(type)) return 'This field type is not writable yet';
  return undefined;
}

export function validateRecordData(
  entity: EntityDefinition,
  fields: FieldDefinition[],
  input: Record<string, unknown>,
  options: { mode: 'create' | 'update'; existing?: Record<string, unknown> } = { mode: 'create' },
): Record<string, unknown> {
  const entityFields = fields.filter((field) => field.entityId === entity.id);
  const known = new Map(entityFields.map((field) => [field.id, field]));
  const merged = { ...(options.existing ?? {}), ...input };
  const issues: RecordValidationIssue[] = [];

  for (const key of Object.keys(input)) {
    const field = known.get(key);
    if (!field) issues.push({ fieldId: key, message: 'Unknown field' });
    else if (field.options.readonly || field.options.hidden) issues.push({ fieldId: key, message: 'Field is not writable' });
  }
  for (const field of entityFields) {
    if (options.mode === 'create' && !(field.id in merged) && field.options.defaultValue !== undefined) {
      merged[field.id] = field.options.defaultValue;
    }
    const issue = validateValue(field, merged[field.id]);
    if (issue) issues.push({ fieldId: field.id, message: issue });
  }
  if (issues.length) throw new RecordValidationError(issues);
  return merged;
}

export const entityEngineStatus = { status: 'initialized', module: 'entity' };
