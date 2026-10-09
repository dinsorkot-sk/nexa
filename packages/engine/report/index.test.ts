import { describe, expect, it } from 'vitest';
import type { ReportDefinition } from '../../meta/src/index';
import { runReport } from './index';

function report(partial: Partial<ReportDefinition>): ReportDefinition {
  return {
    id: 'r1', moduleId: 'm', name: 'n', entityId: 'vehicle',
    fieldIds: [], filters: {}, groupBy: [], sort: [], aggregations: [], calculatedColumns: [],
    ...partial,
  } as ReportDefinition;
}

const rows = [
  { id: '1', data: { status: 'draft', price: 10 } },
  { id: '2', data: { status: 'draft', price: 30 } },
  { id: '3', data: { status: 'done', price: 20 } },
];

describe('runReport', () => {
  it('counts all records without groupBy', () => {
    const groups = runReport(report({ aggregations: [{ operation: 'count' }] }), rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rowCount: 3, aggregates: [3] });
  });

  it('groups by a field and computes sum and avg per group', () => {
    const groups = runReport(report({
      groupBy: ['status'],
      aggregations: [{ operation: 'sum', fieldId: 'price' }, { operation: 'avg', fieldId: 'price' }],
    }), rows);
    expect(groups).toHaveLength(2);
    const draft = groups.find((group) => group.key.status === 'draft')!;
    const done = groups.find((group) => group.key.status === 'done')!;
    expect(draft).toMatchObject({ rowCount: 2, aggregates: [40, 20] });
    expect(done).toMatchObject({ rowCount: 1, aggregates: [20, 20] });
  });

  it('sorts groups per report.sort asc and desc', () => {
    const base = { groupBy: ['status'], aggregations: [{ operation: 'count' as const }] };
    const asc = runReport(report({ ...base, sort: [{ fieldId: 'status', direction: 'asc' as const }] }), rows);
    expect(asc.map((group) => group.key.status)).toEqual(['done', 'draft']);
    const desc = runReport(report({ ...base, sort: [{ fieldId: 'status', direction: 'desc' as const }] }), rows);
    expect(desc.map((group) => group.key.status)).toEqual(['draft', 'done']);
  });

  it('ignores non-numeric values in sum', () => {
    const groups = runReport(report({ aggregations: [{ operation: 'sum', fieldId: 'price' }] }), [{ id: '9', data: { price: 'abc' } }]);
    expect(groups[0]!.aggregates).toEqual([0]);
  });
});
