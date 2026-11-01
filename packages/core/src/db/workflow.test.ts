import { describe, it, expect } from 'vitest';
import type { MetaWorkflow } from '@nexa/types';
import { WorkflowEngine } from './workflow';
import { applyReportFilters, groupRows, aggregate } from './report';
import { groupAuditByRecord, filterAuditByAction } from './audit';
import { NotificationCenter } from './notifications';

describe('WorkflowEngine', () => {
  const wf: MetaWorkflow = {
    id: 'w1', entityId: 'e1', name: 'approval',
    states: ['draft', 'review', 'approved', 'rejected'],
    transitions: [
      { from: 'draft', to: 'review' },
      { from: 'review', to: 'approved' },
      { from: 'review', to: 'rejected' },
    ],
    createdAt: '',
  };

  it('availableTransitions lists next states', () => {
    const engine = new WorkflowEngine(wf);
    expect(engine.availableTransitions('draft')).toEqual(['review']);
    expect(engine.availableTransitions('review')).toEqual(['approved', 'rejected']);
  });

  it('transition succeeds for allowed', () => {
    const engine = new WorkflowEngine(wf);
    const inst = { entity: 'e1', recordId: 'r1', state: 'draft' };
    const next = engine.transition(inst, 'review');
    expect(next.state).toBe('review');
  });

  it('transition throws for disallowed', () => {
    const engine = new WorkflowEngine(wf);
    const inst = { entity: 'e1', recordId: 'r1', state: 'draft' };
    expect(() => engine.transition(inst, 'approved')).toThrow();
  });

  it('guard blocks transition', () => {
    const engine = new WorkflowEngine(wf);
    const inst = { entity: 'e1', recordId: 'r1', state: 'draft' };
    expect(() => engine.transition(inst, 'review', () => false)).toThrow(/Guard/);
  });

  it('isTerminal true when no transitions', () => {
    const engine = new WorkflowEngine(wf);
    expect(engine.isTerminal('approved')).toBe(true);
  });
});

describe('report', () => {
  const rows = [
    { name: 'a', amount: 10, status: 'active' },
    { name: 'b', amount: 20, status: 'inactive' },
    { name: 'c', amount: 30, status: 'active' },
  ];

  it('applyReportFilters filters rows', () => {
    const out = applyReportFilters(rows, [{ field: 'status', op: '=', value: 'active' }]);
    expect(out.length).toBe(2);
  });

  it('groupRows groups', () => {
    const g = groupRows(rows, 'status');
    expect(g.get('active')?.length).toBe(2);
  });

  it('aggregate sum/avg/min/max/count', () => {
    expect(aggregate(rows, 'amount', 'sum')).toBe(60);
    expect(aggregate(rows, 'amount', 'count')).toBe(3);
    expect(aggregate(rows, 'amount', 'min')).toBe(10);
    expect(aggregate(rows, 'amount', 'max')).toBe(30);
  });
});

describe('audit', () => {
  it('groupAuditByRecord groups by entity:recordId', () => {
    const entries = [
      { id: '1', tenantId: 't', entity: 'item', recordId: 'r1', action: 'create' as const, userId: null, before: null, after: null, createdAt: '' },
      { id: '2', tenantId: 't', entity: 'item', recordId: 'r1', action: 'update' as const, userId: null, before: null, after: null, createdAt: '' },
    ];
    const m = groupAuditByRecord(entries);
    expect(m.get('item:r1')?.length).toBe(2);
  });

  it('filterAuditByAction filters', () => {
    const entries = [
      { id: '1', tenantId: 't', entity: 'item', recordId: 'r1', action: 'create' as const, userId: null, before: null, after: null, createdAt: '' },
      { id: '2', tenantId: 't', entity: 'item', recordId: 'r1', action: 'update' as const, userId: null, before: null, after: null, createdAt: '' },
    ];
    expect(filterAuditByAction(entries, 'create').length).toBe(1);
  });
});

describe('NotificationCenter', () => {
  it('push/list/unread/markRead', () => {
    const nc = new NotificationCenter();
    nc.push({ tenantId: 't1', userId: null, title: 'hi', body: 'body' });
    expect(nc.list('t1').length).toBe(1);
    expect(nc.unreadCount('t1')).toBe(1);
    const id = nc.list('t1')[0].id;
    nc.markRead(id);
    expect(nc.unreadCount('t1')).toBe(0);
  });
});