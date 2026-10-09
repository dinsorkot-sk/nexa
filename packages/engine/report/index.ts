import type { FieldDefinition, ReportDefinition } from '../../meta/src/index';

export interface ReportRecord {
  id: string;
  data: Record<string, unknown>;
}

export type ReportAggregate = number;

export interface ReportGroup {
  key: Record<string, unknown>;
  rowCount: number;
  /** Per-aggregation result in report.aggregations order. */
  aggregates: ReportAggregate[];
  rows: ReportRecord[];
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function aggregate(operation: string, values: unknown[]): ReportAggregate {
  if (operation === 'count') return values.length;
  if (operation === 'sum') return values.reduce<number>((sum, value) => sum + (numeric(value) ?? 0), 0);
  if (operation === 'min') return values.reduce<number | undefined>((min, value) => { const n = numeric(value); return n === undefined ? min : min === undefined ? n : Math.min(min, n); }, undefined) ?? 0;
  if (operation === 'max') return values.reduce<number | undefined>((max, value) => { const n = numeric(value); return n === undefined ? max : max === undefined ? n : Math.max(max, n); }, undefined) ?? 0;
  const nums = values.map(numeric).filter((value): value is number => value !== undefined);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

/**
 * Groups records by the report's groupBy fields (or one bucket when no groupBy)
 * and computes count/aggregations per group. Pure: rows come from the caller.
 */
export function runReport(report: ReportDefinition, records: ReportRecord[]): ReportGroup[] {
  const keyOf = (record: ReportRecord) => JSON.stringify(report.groupBy.map((fieldId) => record.data[fieldId] ?? null));
  const groups = new Map<string, ReportRecord[]>();
  for (const record of records) {
    const key = keyOf(record);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  const result: ReportGroup[] = [];
  for (const [, groupRecords] of groups) {
    const key: Record<string, unknown> = {};
    report.groupBy.forEach((fieldId) => { key[fieldId] = groupRecords[0]!.data[fieldId] ?? null; });
    const aggregates = report.aggregations.map((agg) => {
      const values = agg.fieldId === undefined ? groupRecords.map(() => undefined as unknown) : groupRecords.map((record) => record.data[agg.fieldId!]);
      return aggregate(agg.operation, values);
    });
    result.push({ key, rowCount: groupRecords.length, aggregates, rows: groupRecords });
  }
  for (const sort of [...report.sort].reverse()) {
    result.sort((a, b) => {
      const av = a.key[sort.fieldId];
      const bv = b.key[sort.fieldId];
      const cmp = av === bv ? 0 : av === null ? -1 : bv === null ? 1 : typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === 'desc' ? -cmp : cmp;
    });
  }
  return result;
}

/** Validates that a report definition only references fields on its entity. Pure helper for definition integrity. */
export function reportFieldIssues(report: ReportDefinition, fields: FieldDefinition[]): string[] {
  const entityFields = new Set(fields.filter((field) => field.entityId === report.entityId).map((field) => field.id));
  const referenced = [...report.fieldIds, ...report.groupBy, ...report.aggregations.filter((agg) => agg.fieldId).map((agg) => agg.fieldId!), ...report.sort.map((sort) => sort.fieldId)];
  return referenced.filter((fieldId) => !entityFields.has(fieldId));
}
