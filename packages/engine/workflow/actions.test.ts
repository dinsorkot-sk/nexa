import { describe, expect, it } from 'vitest';
import { planAction } from './actions';

describe('planAction', () => {
  it('plans an updateRecord with a non-empty set', () => {
    expect(planAction('updateRecord', { set: { status: 'done' } })).toEqual({ ok: true, kind: 'updateRecord', set: { status: 'done' } });
  });

  it('rejects updateRecord without a usable set', () => {
    expect(planAction('updateRecord', {})).toMatchObject({ ok: false, rejection: { code: 'ACTION_CONFIG_INVALID' } });
    expect(planAction('updateRecord', { set: {} })).toMatchObject({ ok: false, rejection: { code: 'ACTION_CONFIG_INVALID' } });
    expect(planAction('updateRecord', { set: ['x'] })).toMatchObject({ ok: false, rejection: { code: 'ACTION_CONFIG_INVALID' } });
  });

  it('plans an emitEvent with a lowercase event type and defaults payload to empty', () => {
    expect(planAction('emitEvent', { eventType: 'vehicle.inspected' })).toEqual({ ok: true, kind: 'emitEvent', eventType: 'vehicle.inspected', payload: {} });
  });

  it('rejects emitEvent with an invalid event type', () => {
    expect(planAction('emitEvent', { eventType: 'Vehicle Inspected' })).toMatchObject({ ok: false, rejection: { code: 'ACTION_CONFIG_INVALID' } });
    expect(planAction('emitEvent', {})).toMatchObject({ ok: false, rejection: { code: 'ACTION_CONFIG_INVALID' } });
  });

  it('rejects action kinds outside this phase', () => {
    for (const kind of ['webhook', 'createRecord', 'deleteRecord', 'notification']) {
      expect(planAction(kind, {})).toMatchObject({ ok: false, rejection: { code: 'ACTION_KIND_UNSUPPORTED' } });
    }
  });
});
