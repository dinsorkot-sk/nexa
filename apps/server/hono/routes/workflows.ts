import { Hono } from 'hono';
import { NotificationActionConfigSchema, RecordUpdateInputSchema, WebhookActionConfigSchema } from '@nexa/meta';
import { createTenantContext, moduleRepository, tenantRepository } from '@nexa/db';
import { validateRecordData } from '../../../../packages/engine/entity/index';
import { evaluateTransition } from '../../../../packages/engine/workflow/transitions';
import { planAction } from '../../../../packages/engine/workflow/actions';
import { deliverWebhook } from '../../../../integrations/webhook/src/index';
import { sendNotification } from '../../../../integrations/email/src/index';
import { createHelpers, errorResponse, invalid, missingDefinition, missingRecord, redactHidden, requireEnabled, type AppDependencies } from '../shared';

/** Workflow transitions and record actions. Persistence stays in db; actions are dispatched through the same integrations as automations. */
export function workflowRoutes(dependencies: AppDependencies) {
  const app = new Hono();
  const { withDefinitions, dispatchAutomations } = createHelpers(dependencies);

  app.post('/modules/:moduleId/entities/:entityId/records/:recordId/transitions/:transitionId', async (c) => withDefinitions(c, 'workflow:transition', async (defs, moduleId, tenantId, principal) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const workflow = (await defs.listWorkflows(moduleId)).find((candidate) => candidate.entityId === entityId);
    if (!workflow) return missingDefinition(c, 'Workflow');
    const parsed = RecordUpdateInputSchema.pick({ version: true }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const existing = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!existing) return missingRecord(c);
    const currentState = String(existing.data[workflow.stateFieldId] ?? workflow.states.find((state) => state.initial)?.id ?? '');
    const data = { ...existing.data, [workflow.stateFieldId]: currentState };
    const decision = evaluateTransition(workflow, c.req.param('transitionId'), currentState, principal.roleIds, data);
    if (!decision.ok) {
      const status = decision.rejection.code === 'FORBIDDEN' ? 403 : decision.rejection.code === 'TRANSITION_NOT_FOUND' ? 404 : 409;
      return c.json(errorResponse(decision.rejection.code, decision.rejection.message, status), status);
    }
    const nextData = { ...existing.data, [workflow.stateFieldId]: decision.nextStateId };
    const updated = await repo.runInTransaction(async (tx) => {
      const record = await repo.updateScopedRecord(moduleId, entityId, existing.id, nextData, parsed.data.version ?? existing.version, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id), tx);
      if (!record) return undefined;
      await repo.appendEvent({ eventType: 'workflow.transitioned', moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { workflowId: workflow.id, transitionId: decision.transition.id, from: currentState, to: decision.nextStateId } }, tx);
      return record;
    });
    if (updated) {
      // Execute the transition's actions after the commit; delivery failures never fail the transition.
      const allActions = await defs.listActions(moduleId);
      for (const ref of decision.transition.actions) {
        const action = allActions.find((candidate) => candidate.id === ref.actionId);
        if (!action) continue;
        try {
          if (action.kind === 'webhook') {
            await deliverWebhook(WebhookActionConfigSchema.parse(action.config), { event: 'workflow.transitioned', transitionId: decision.transition.id, recordId: updated.id }, dependencies.webhookTransport);
          } else if (action.kind === 'notification') {
            await sendNotification(NotificationActionConfigSchema.parse(action.config), dependencies.emailTransport);
          }
          // Other kinds are handled by their own surfaces until their phase.
        } catch (error) {
          console.error(`Transition action "${action.id}" failed:`, error);
        }
      }
      await dispatchAutomations(tenantId, moduleId, { type: 'workflow', entityId, recordId: updated.id, workflowId: workflow.id, transitionId: decision.transition.id, payload: { from: currentState, to: decision.nextStateId } }, principal.userId);
    }
    return updated ? c.json(redactHidden(updated, fields)) : missingRecord(c);
  }));

  app.post('/modules/:moduleId/entities/:entityId/records/:recordId/actions/:actionId', async (c) => withDefinitions(c, 'action:execute', async (defs, moduleId, tenantId, principal) => {
    const modules = moduleRepository(dependencies.db!, createTenantContext(tenantId));
    if (!(await requireEnabled(modules, moduleId))) return c.json(errorResponse('MODULE_NOT_ENABLED', 'Records require an enabled module', 409), 409);
    const entityId = c.req.param('entityId');
    const entity = await defs.getEntity(moduleId, entityId);
    if (!entity) return missingDefinition(c, 'Entity');
    const action = await defs.getAction(moduleId, c.req.param('actionId'));
    if (!action) return missingDefinition(c, 'Action');
    const plan = planAction(action.kind, action.config);
    if (!plan.ok) return c.json(errorResponse(plan.rejection.code, plan.rejection.message, 422), 422);
    const parsed = RecordUpdateInputSchema.pick({ version: true }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, parsed.error.message);
    const fields = await defs.listFields(moduleId, entityId);
    const repo = tenantRepository(dependencies.db!, createTenantContext(tenantId));
    const existing = await repo.getScopedRecord(moduleId, entityId, c.req.param('recordId'));
    if (!existing) return missingRecord(c);
    const result = await repo.runInTransaction(async (tx) => {
      if (plan.kind === 'updateRecord') {
        const data = validateRecordData(entity, fields, { ...existing.data, ...plan.set }, { mode: 'update', existing: existing.data });
        await repo.assertReferences(moduleId, fields.filter((field) => field.type === 'reference'), data);
        const record = await repo.updateScopedRecord(moduleId, entityId, existing.id, data, parsed.data.version ?? existing.version, principal.userId, fields.filter((field) => field.options.unique).map((field) => field.id), tx);
        if (!record) return undefined;
        await repo.appendEvent({ eventType: 'action.executed', moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { actionId: action.id, kind: plan.kind } }, tx);
        return record;
      }
      const record = await repo.getScopedRecord(moduleId, entityId, existing.id);
      if (!record) return undefined;
      await repo.appendEvent({ eventType: plan.eventType, moduleId, entityId, recordId: record.id, actorId: principal.userId, payload: { actionId: action.id, ...plan.payload } }, tx);
      return record;
    });
    if (result && plan.kind === 'emitEvent') {
      await dispatchAutomations(tenantId, moduleId, { type: 'event', entityId, recordId: result.id, eventType: (plan as { eventType: string }).eventType, payload: { actionId: action.id } }, principal.userId);
    }
    return result ? c.json(redactHidden(result, fields)) : missingRecord(c);
  }));

  return app;
}
