import type { FieldDefinition } from '@nexa/meta';

export interface QueryIssue { message: string; fieldId?: string }
export class RecordQueryError extends Error {
  readonly issues: QueryIssue[];
  constructor(issues: QueryIssue[]) { super('Invalid record query'); this.name = 'RecordQueryError'; this.issues = issues; }
}
export interface QuerySpec {
  limit: number;
  offset: number;
  sort?: { fieldId: string; direction: 'asc' | 'desc' };
  filters: { fieldId: string; operator: string; value: unknown }[];
  search?: string;
}

export function parseQuery(query: { limit?: number; offset?: number; sort?: string; filter?: string; search?: string }, fields: FieldDefinition[]): QuerySpec {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const issues: QueryIssue[] = [];
  const limit = query.limit ?? 25;
  const offset = query.offset ?? 0;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) issues.push({ message: 'limit must be an integer between 1 and 100' });
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) issues.push({ message: 'offset must be an integer between 0 and 1000000' });
  if (query.sort !== undefined && typeof query.sort !== 'string') issues.push({ message: 'sort must be a string' });
  if (query.filter !== undefined && typeof query.filter !== 'string') issues.push({ message: 'filter must be a string' });
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 200)) issues.push({ message: 'search must be a string of at most 200 characters' });
  const sort = typeof query.sort === 'string' && query.sort ? parseSort(query.sort, byId, issues) : undefined;
  const filters = typeof query.filter === 'string' && query.filter ? parseFilters(query.filter, byId, issues) : [];
  if (typeof query.search === 'string' && query.search && !fields.some((field) => field.options.searchable && !field.options.hidden)) issues.push({ message: 'No searchable fields are configured' });
  if (issues.length) throw new RecordQueryError(issues);
  return { limit, offset, sort, filters, search: query.search };
}

const numericTypes = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);
const textTypes = new Set(['text', 'longText', 'email', 'phone', 'url', 'date', 'datetime', 'time', 'select', 'reference']);

function validFilterValue(field: FieldDefinition, operator: string, value: unknown): boolean {
  if (operator === 'in') return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((item) => validScalar(field, item));
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return false;
  return validScalar(field, value);
}

function validScalar(field: FieldDefinition, value: unknown): boolean {
  if (value === null) return true;
  if (numericTypes.has(field.type)) {
    return typeof value === 'number' && Number.isFinite(value) && (field.type !== 'integer' || Number.isInteger(value));
  }
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (['json', 'multiSelect'].includes(field.type)) return false;
  if (textTypes.has(field.type) || ['file', 'image', 'autoNumber', 'formula', 'computed'].includes(field.type)) {
    if (typeof value !== 'string' || value.length > 2000) return false;
    return field.type !== 'select' || field.options.choices?.some((choice) => choice.value === value) === true;
  }
  return false;
}

function operatorAllowed(field: FieldDefinition, operator: string): boolean {
  if (operator === 'contains') return textTypes.has(field.type);
  if (['gt', 'gte', 'lt', 'lte'].includes(operator)) return numericTypes.has(field.type) || textTypes.has(field.type);
  return ['eq', 'ne', 'in'].includes(operator);
}

function parseSort(raw: string, fields: Map<string, FieldDefinition>, issues: QueryIssue[]) {
  const parts = raw.split(':');
  const fieldId = parts[0] ?? '';
  const direction = parts[1] ?? 'asc';
  if (parts.length > 2 || !/^[a-zA-Z0-9_-]+$/.test(fieldId)) issues.push({ fieldId, message: 'Sort must be fieldId:asc or fieldId:desc' });
  if (fieldId.length > 120) issues.push({ fieldId, message: 'Sort field ID is too long' });

  const field = fields.get(fieldId);
  if (!field || !field.options.sortable || field.options.hidden) issues.push({ fieldId, message: 'Field is not sortable' });
  if (direction !== 'asc' && direction !== 'desc') issues.push({ fieldId, message: 'Sort direction must be asc or desc' });
  return { fieldId, direction: direction as 'asc' | 'desc' };
}

function parseFilters(raw: string, fields: Map<string, FieldDefinition>, issues: QueryIssue[]) {
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { issues.push({ message: 'filter must be valid JSON' }); return []; }
  if (!Array.isArray(decoded)) { issues.push({ message: 'filter must be an array' }); return []; }
  if (decoded.length > 20) { issues.push({ message: 'filter may contain at most 20 conditions' }); return []; }
  return decoded.flatMap((item) => {
    if (!item || typeof item !== 'object') { issues.push({ message: 'Each filter must be an object' }); return []; }
    const candidate = item as Record<string, unknown>;
    const fieldId = typeof candidate.fieldId === 'string' ? candidate.fieldId : '';
    const operator = typeof candidate.operator === 'string' ? candidate.operator : '';
    const field = fields.get(fieldId);
    if (!field || !field.options.filterable || field.options.hidden) issues.push({ fieldId, message: 'Field is not filterable' });
    if (!['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(operator)) issues.push({ fieldId, message: 'Unsupported filter operator' });
    else if (field && !operatorAllowed(field, operator)) issues.push({ fieldId, message: `Operator ${operator} is not supported for ${field.type} fields` });
    if (field && !validFilterValue(field, operator, candidate.value)) issues.push({ fieldId, message: 'Filter value is invalid for field type or exceeds limits' });
    return [{ fieldId, operator, value: candidate.value }];
  });
}

export const queryEngineStatus = { status: 'initialized', module: 'query' };
