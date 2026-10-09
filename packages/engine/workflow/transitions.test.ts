import { describe, expect, it } from 'vitest';
import { WorkflowDefinitionSchema, type WorkflowDefinition } from '../../meta/src/index';
import { evaluateTransition } from './transitions';

const workflow: WorkflowDefinition = WorkflowDefinitionSchema.parse({
  id: 'wf', moduleId: 'fleet', entityId: 'vehicle', name: 'Lifecycle', stateFieldId: 'status',
  states: [
    { id: 'draft', name: 'draft', label: 'Draft', initial: true },
    { id: 'review', name: 'review', label: 'Review' },
    { id: 'done', name: 'done', label: 'Done', terminal: true },
  ],
  transitions: [
    { id: 'submit', from: 'draft', to: 'review', label: 'Submit', condition: { owner: { notEmpty: true } } },
    { id: 'approve', from: 'review', to: 'done', label: 'Approve', requiredRoleIds: ['manager'] },
  ],
});

describe('evaluateTransition', () => {
  it('accepts a valid forward transition and returns the next state', () => {
    const result = evaluateTransition(workflow, 'submit', 'draft', ['member'], { owner: 'u1' });
    expect(result).toMatchObject({ ok: true, nextStateId: 'review' });
  });

  it('rejects an unknown transition id', () => {
    const result = evaluateTransition(workflow, 'missing', 'draft', [], {});
    expect(result).toMatchObject({ ok: false, rejection: { code: 'TRANSITION_NOT_FOUND' } });
  });

  it('rejects when the record is not in the transition source state', () => {
    const result = evaluateTransition(workflow, 'approve', 'draft', ['manager'], {});
    expect(result).toMatchObject({ ok: false, rejection: { code: 'TRANSITION_STATE_MISMATCH' } });
  });

  it('rejects principals without any required role', () => {
    const result = evaluateTransition(workflow, 'approve', 'review', ['member'], {});
    expect(result).toMatchObject({ ok: false, rejection: { code: 'FORBIDDEN' } });
  });

  it('allows a principal holding any one required role', () => {
    const result = evaluateTransition(workflow, 'approve', 'review', ['viewer', 'manager'], {});
    expect(result).toMatchObject({ ok: true, nextStateId: 'done' });
  });

  it('reports failing guard fields', () => {
    const result = evaluateTransition(workflow, 'submit', 'draft', ['member'], {});
    expect(result).toMatchObject({ ok: false, rejection: { code: 'GUARD_FAILED', fieldIds: ['owner'] } });
  });
});
