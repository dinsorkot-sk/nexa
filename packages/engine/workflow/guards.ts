/** Small guard grammar: each key is a field id, each value is one check against that field's value. */
export type GuardCheck =
  | { eq: unknown }
  | { neq: unknown }
  | { notEmpty: true };
export type WorkflowGuard = Record<string, GuardCheck>;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Evaluates a guard against record data; returns the failing field ids (empty when all checks pass). */
export function failingGuardFields(guard: WorkflowGuard, data: Record<string, unknown>): string[] {
  return Object.entries(guard).filter(([fieldId, check]) => {
    const value = data[fieldId];
    if ('eq' in check) return value !== check.eq;
    if ('neq' in check) return value === check.neq;
    return isEmpty(value);
  }).map(([fieldId]) => fieldId);
}
