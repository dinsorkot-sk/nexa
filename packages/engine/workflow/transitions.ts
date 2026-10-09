import type { WorkflowDefinition, WorkflowTransition } from '../../meta/src/index';
import { failingGuardFields, type WorkflowGuard } from './guards';

export type TransitionRejection =
  | { code: 'TRANSITION_NOT_FOUND'; message: string }
  | { code: 'TRANSITION_STATE_MISMATCH'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'GUARD_FAILED'; message: string; fieldIds: string[] };

export type TransitionResult =
  | { ok: true; transition: WorkflowTransition; nextStateId: string }
  | { ok: false; rejection: TransitionRejection };

/**
 * Validates a requested transition against the linear workflow definition.
 * Pure: the caller supplies the current state, the principal's role ids, and the
 * record data after the proposed update, and performs the write itself.
 */
export function evaluateTransition(
  workflow: WorkflowDefinition,
  transitionId: string,
  currentStateId: string,
  principalRoleIds: readonly string[],
  recordData: Record<string, unknown>,
): TransitionResult {
  const transition = workflow.transitions.find((candidate) => candidate.id === transitionId);
  if (!transition) {
    return { ok: false, rejection: { code: 'TRANSITION_NOT_FOUND', message: `Transition ${transitionId} not found` } };
  }
  if (transition.from !== currentStateId) {
    return {
      ok: false,
      rejection: { code: 'TRANSITION_STATE_MISMATCH', message: `Record is in ${currentStateId}, transition starts from ${transition.from}` },
    };
  }
  if (transition.requiredRoleIds.length > 0 && !transition.requiredRoleIds.some((roleId) => principalRoleIds.includes(roleId))) {
    return { ok: false, rejection: { code: 'FORBIDDEN', message: 'Your role cannot perform this transition' } };
  }
  const guard = (transition.condition ?? {}) as WorkflowGuard;
  const failing = failingGuardFields(guard, recordData);
  if (failing.length > 0) {
    return { ok: false, rejection: { code: 'GUARD_FAILED', message: 'Transition conditions are not met', fieldIds: failing } };
  }
  return { ok: true, transition, nextStateId: transition.to };
}
