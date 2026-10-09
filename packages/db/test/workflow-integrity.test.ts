import { describe, expect, it } from 'vitest';
import { ActionDefinitionSchema, WorkflowDefinitionSchema, type EntityDefinition, type FieldDefinition } from '../../meta/src/index';
import { validateWorkflowReferences } from '../src/definition-integrity';

const entity = { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', moduleId: 'fleet', description: '', settings: {}, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' } as EntityDefinition;

const statusField = {
  id: 'status', entityId: 'vehicle', moduleId: 'fleet', name: 'status', label: 'Status', type: 'select', position: 0,
  options: { choices: [{ value: 'draft', label: 'Draft' }, { value: 'done', label: 'Done' }] },
  createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
} as unknown as FieldDefinition;

const action = ActionDefinitionSchema.parse({
  id: 'mark-inspected', moduleId: 'fleet', entityId: 'vehicle', name: 'mark-inspected', label: 'Mark inspected',
  kind: 'updateRecord', config: { set: { status: 'done' } },
});

function workflow(overrides: Record<string, unknown> = {}) {
  return WorkflowDefinitionSchema.parse({
    id: 'wf', moduleId: 'fleet', entityId: 'vehicle', name: 'Lifecycle', stateFieldId: 'status',
    states: [
      { id: 'draft', name: 'draft', label: 'Draft', initial: true },
      { id: 'done', name: 'done', label: 'Done', terminal: true },
    ],
    transitions: [{ id: 't1', from: 'draft', to: 'done', label: 'Finish', actions: [{ actionId: 'mark-inspected', input: {} }] }],
    ...overrides,
  });
}

describe('validateWorkflowReferences', () => {
  it('accepts a workflow bound to a select field with known actions', () => {
    expect(validateWorkflowReferences([entity], [statusField], [workflow()], [action])).toEqual([]);
  });

  it('rejects a state field that is not a select field on the same entity', () => {
    const text = { ...statusField, type: 'text' } as FieldDefinition;
    const issues = validateWorkflowReferences([entity], [text], [workflow()], [action]);
    expect(issues).toEqual([expect.objectContaining({ kind: 'workflow', id: 'wf', path: ['stateFieldId'] })]);
  });

  it('rejects a state field that belongs to another entity', () => {
    const other = { ...statusField, entityId: 'driver' } as FieldDefinition;
    const issues = validateWorkflowReferences([entity], [other], [workflow()], [action]);
    expect(issues).toEqual([expect.objectContaining({ path: ['stateFieldId'] })]);
  });

  it('rejects transitions that reference an unknown action', () => {
    const issues = validateWorkflowReferences([entity], [statusField], [workflow()], []);
    expect(issues).toEqual([expect.objectContaining({ kind: 'workflow', message: expect.stringContaining('mark-inspected') })]);
  });

  it('rejects a workflow whose entity does not exist', () => {
    const issues = validateWorkflowReferences([], [statusField], [workflow()], [action]);
    expect(issues).toEqual([expect.objectContaining({ path: ['entityId'] })]);
  });
});
