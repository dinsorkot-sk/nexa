/** Action kinds this phase executes; every other kind is rejected until its phase lands. */
export const supportedActionKinds = ['updateRecord', 'emitEvent'] as const;
export type SupportedActionKind = typeof supportedActionKinds[number];

export type ActionRejection =
  | { code: 'ACTION_KIND_UNSUPPORTED'; message: string }
  | { code: 'ACTION_CONFIG_INVALID'; message: string };

export type ActionPlan =
  | { ok: true; kind: 'updateRecord'; set: Record<string, unknown> }
  | { ok: true; kind: 'emitEvent'; eventType: string; payload: Record<string, unknown> }
  | { ok: false; rejection: ActionRejection };

/**
 * Turns a stored action definition into a plan the caller can execute inside its
 * record transaction. Pure: no I/O, so validation rules stay testable in node env.
 */
export function planAction(kind: string, config: Record<string, unknown>): ActionPlan {
  if (kind === 'updateRecord') {
    const set = config.set;
    if (!set || typeof set !== 'object' || Array.isArray(set) || Object.keys(set).length === 0) {
      return { ok: false, rejection: { code: 'ACTION_CONFIG_INVALID', message: 'updateRecord requires a non-empty set object' } };
    }
    return { ok: true, kind, set: set as Record<string, unknown> };
  }
  if (kind === 'emitEvent') {
    const eventType = config.eventType;
    if (typeof eventType !== 'string' || !/^[a-z][a-z0-9_.]*$/.test(eventType)) {
      return { ok: false, rejection: { code: 'ACTION_CONFIG_INVALID', message: 'emitEvent requires a lowercase eventType' } };
    }
    const payload = config.payload && typeof config.payload === 'object' && !Array.isArray(config.payload)
      ? config.payload as Record<string, unknown>
      : {};
    return { ok: true, kind, eventType, payload };
  }
  return { ok: false, rejection: { code: 'ACTION_KIND_UNSUPPORTED', message: `Action kind ${kind} is not supported yet` } };
}
