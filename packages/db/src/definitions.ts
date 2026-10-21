import { and, eq, sql } from 'drizzle-orm';
import {
  EntityCreateInputSchema,
  EntityDefinitionSchema,
  EntityUpdateInputSchema,
  FieldCreateInputSchema,
  FieldDefinitionSchema,
  FieldUpdateInputSchema,
  RelationCreateInputSchema,
  RelationDefinitionSchema,
  RelationUpdateInputSchema,
  ActionDefinitionSchema,
  AutomationDefinitionSchema,
  DashboardDefinitionSchema,
  ReportDefinitionSchema,
  ViewCreateInputSchema,
  ViewDefinitionSchema,
  ViewUpdateInputSchema,
  FormCreateInputSchema,
  FormDefinitionSchema,
  FormUpdateInputSchema,
  WorkflowDefinitionSchema,
  type ActionDefinition,
  type AutomationDefinition,
  type DashboardDefinition,
  type ReportDefinition,
  type ViewDefinition,
  type FormDefinition,
  type WorkflowDefinition,
  type EntityDefinition,
  type FieldDefinition,
  type RelationDefinition,
  type z,
} from '@nexa/meta';
import { validateModuleSchema } from './definition-integrity';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { auditLog, metadataDefinitions, modules, records } from './schema';

export type DefinitionKind = 'entity' | 'field' | 'relation' | 'view' | 'form' | 'workflow' | 'action' | 'automation' | 'report' | 'dashboard';

export interface ModuleSchema {
  entities: EntityDefinition[];
  fields: FieldDefinition[];
  relations: RelationDefinition[];
  views: ViewDefinition[];
  forms: FormDefinition[];
  workflows: WorkflowDefinition[];
  actions: ActionDefinition[];
  automations: AutomationDefinition[];
  reports: ReportDefinition[];
  dashboards: DashboardDefinition[];
}

export class DefinitionNotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = 'DefinitionNotFoundError';
  }
}

export class DefinitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionConflictError';
  }
}

const schemas: Record<DefinitionKind, z.ZodTypeAny> = {
  entity: EntityDefinitionSchema,
  field: FieldDefinitionSchema,
  relation: RelationDefinitionSchema,
  view: ViewDefinitionSchema,
  form: FormDefinitionSchema,
  workflow: WorkflowDefinitionSchema,
  action: ActionDefinitionSchema,
  automation: AutomationDefinitionSchema,
  report: ReportDefinitionSchema,
  dashboard: DashboardDefinitionSchema,
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function definitionRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

  const scope = (moduleId: string, kind: DefinitionKind) => and(
    eq(metadataDefinitions.tenantId, tenantId),
    eq(metadataDefinitions.moduleId, moduleId),
    eq(metadataDefinitions.kind, kind),
  );

  async function readAll<T>(db: Tx | DbHandle['db'], moduleId: string, kind: DefinitionKind): Promise<T[]> {
    const rows = await db.select({ definition: metadataDefinitions.definition })
      .from(metadataDefinitions)
      .where(scope(moduleId, kind));
    return rows.map((row) => schemas[kind].parse(row.definition) as T);
  }

  async function loadSchema(db: Tx | DbHandle['db'], moduleId: string): Promise<ModuleSchema> {
    return {
      entities: await readAll<EntityDefinition>(db, moduleId, 'entity'),
      fields: await readAll<FieldDefinition>(db, moduleId, 'field'),
      relations: await readAll<RelationDefinition>(db, moduleId, 'relation'),
      views: await readAll<ViewDefinition>(db, moduleId, 'view'),
      forms: await readAll<FormDefinition>(db, moduleId, 'form'),
      workflows: await readAll<WorkflowDefinition>(db, moduleId, 'workflow'),
      actions: await readAll<ActionDefinition>(db, moduleId, 'action'),
      automations: await readAll<AutomationDefinition>(db, moduleId, 'automation'),
      reports: await readAll<ReportDefinition>(db, moduleId, 'report'),
      dashboards: await readAll<DashboardDefinition>(db, moduleId, 'dashboard'),
    };
  }

  /** Runs `change` in a transaction with the module row locked, gated to draft/review modules. */
  async function mutate<R>(
    moduleId: string,
    action: string,
    actorId: string | undefined,
    change: (tx: Tx, current: ModuleSchema) => Promise<{ next: ModuleSchema; result: R; audit: Record<string, unknown>; entityId: string | null }>,
  ): Promise<R> {
    return handle.db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        SELECT definition->>'status' AS status FROM ${modules}
        WHERE ${modules.tenantId} = ${tenantId} AND ${modules.id} = ${moduleId} FOR UPDATE`);
      const row = (locked.rows as Array<{ status: string }>)[0];
      if (!row) throw new DefinitionNotFoundError('Module', moduleId);
      if (row.status !== 'draft' && row.status !== 'review') {
        throw new DefinitionConflictError(`Definitions cannot be edited while the module is ${row.status}`);
      }
      const current = await loadSchema(tx, moduleId);
      const { next, result, audit, entityId } = await change(tx, current);
      const issues = validateModuleSchema(next.entities, next.fields, next.relations, next.workflows, next.actions, next.automations, next.reports, next.dashboards, next.views, next.forms);
      if (issues.length > 0) {
        throw new DefinitionConflictError(`Invalid module schema: ${issues.map((issue) => issue.message).join('; ')}`);
      }
      await tx.insert(auditLog).values({ tenantId, actorId, action, entityId, changes: { moduleId, ...audit } });
      return result;
    });
  }

  async function insertDefinition(tx: Tx, moduleId: string, kind: DefinitionKind, definition: { id: string }) {
    try {
      await tx.insert(metadataDefinitions).values({ tenantId, moduleId, kind, id: definition.id, definition });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DefinitionConflictError(`${kind} already exists: ${definition.id}`);
      throw error;
    }
  }

  async function writeDefinition(tx: Tx, moduleId: string, kind: DefinitionKind, definition: { id: string }) {
    await tx.update(metadataDefinitions).set({ definition, updatedAt: new Date() })
      .where(and(scope(moduleId, kind), eq(metadataDefinitions.id, definition.id)));
  }

  async function removeDefinitions(tx: Tx, moduleId: string, kind: DefinitionKind, ids: string[]) {
    for (const id of ids) {
      await tx.delete(metadataDefinitions).where(and(scope(moduleId, kind), eq(metadataDefinitions.id, id)));
    }
  }

  async function getOne<T>(moduleId: string, kind: DefinitionKind, id: string): Promise<T | undefined> {
    const [row] = await handle.db.select({ definition: metadataDefinitions.definition })
      .from(metadataDefinitions)
      .where(and(scope(moduleId, kind), eq(metadataDefinitions.id, id)))
      .limit(1);
    return row ? (schemas[kind].parse(row.definition) as T) : undefined;
  }

  return {
    getModuleSchema: (moduleId: string) => loadSchema(handle.db, moduleId),

    listEntities: (moduleId: string) => readAll<EntityDefinition>(handle.db, moduleId, 'entity'),
    getEntity: (moduleId: string, id: string) => getOne<EntityDefinition>(moduleId, 'entity', id),

    listWorkflows: (moduleId: string) => readAll<WorkflowDefinition>(handle.db, moduleId, 'workflow'),
    getWorkflow: (moduleId: string, id: string) => getOne<WorkflowDefinition>(moduleId, 'workflow', id),
    listActions: (moduleId: string) => readAll<ActionDefinition>(handle.db, moduleId, 'action'),
    getAction: (moduleId: string, id: string) => getOne<ActionDefinition>(moduleId, 'action', id),
    listAutomations: (moduleId: string) => readAll<AutomationDefinition>(handle.db, moduleId, 'automation'),
    listReports: (moduleId: string) => readAll<ReportDefinition>(handle.db, moduleId, 'report'),
    getReport: (moduleId: string, id: string) => getOne<ReportDefinition>(moduleId, 'report', id),
    listDashboards: (moduleId: string) => readAll<DashboardDefinition>(handle.db, moduleId, 'dashboard'),
    getDashboard: (moduleId: string, id: string) => getOne<DashboardDefinition>(moduleId, 'dashboard', id),

    async createReport(moduleId: string, definition: ReportDefinition, actorId?: string): Promise<ReportDefinition> {
      const parsed = ReportDefinitionSchema.parse({ ...definition, moduleId });
      return mutate(moduleId, 'report.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'report', parsed);
        return {
          next: { ...current, reports: [...current.reports, parsed] },
          result: parsed,
          audit: { kind: 'report', after: parsed },
          entityId: parsed.entityId,
        };
      });
    },

    async updateReport(moduleId: string, id: string, patch: Partial<ReportDefinition>, actorId?: string): Promise<ReportDefinition> {
      return mutate(moduleId, 'report.updated', actorId, async (tx, current) => {
        const before = current.reports.find((report) => report.id === id);
        if (!before) throw new DefinitionNotFoundError('Report', id);
        const after = ReportDefinitionSchema.parse({ ...before, ...patch, moduleId });
        await writeDefinition(tx, moduleId, 'report', after);
        return {
          next: { ...current, reports: current.reports.map((report) => (report.id === id ? after : report)) },
          result: after,
          audit: { kind: 'report', before, after },
          entityId: after.entityId,
        };
      });
    },

    async deleteReport(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'report.deleted', actorId, async (tx, current) => {
        const before = current.reports.find((report) => report.id === id);
        if (!before) throw new DefinitionNotFoundError('Report', id);
        if (current.dashboards.some((dashboard) => dashboard.widgets.some((widget) => widget.reportId === id))) {
          throw new DefinitionConflictError(`Report ${id} is used by a dashboard and cannot be deleted`);
        }
        await removeDefinitions(tx, moduleId, 'report', [id]);
        return {
          next: { ...current, reports: current.reports.filter((report) => report.id !== id) },
          result: undefined,
          audit: { kind: 'report', before },
          entityId: null,
        };
      });
    },

    async createDashboard(moduleId: string, definition: DashboardDefinition, actorId?: string): Promise<DashboardDefinition> {
      const parsed = DashboardDefinitionSchema.parse({ ...definition, moduleId });
      return mutate(moduleId, 'dashboard.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'dashboard', parsed);
        return {
          next: { ...current, dashboards: [...current.dashboards, parsed] },
          result: parsed,
          audit: { kind: 'dashboard', after: parsed },
          entityId: null,
        };
      });
    },

    async updateDashboard(moduleId: string, id: string, patch: Partial<DashboardDefinition>, actorId?: string): Promise<DashboardDefinition> {
      return mutate(moduleId, 'dashboard.updated', actorId, async (tx, current) => {
        const before = current.dashboards.find((dashboard) => dashboard.id === id);
        if (!before) throw new DefinitionNotFoundError('Dashboard', id);
        const after = DashboardDefinitionSchema.parse({ ...before, ...patch, moduleId });
        await writeDefinition(tx, moduleId, 'dashboard', after);
        return {
          next: { ...current, dashboards: current.dashboards.map((dashboard) => (dashboard.id === id ? after : dashboard)) },
          result: after,
          audit: { kind: 'dashboard', before, after },
          entityId: null,
        };
      });
    },

    async deleteDashboard(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'dashboard.deleted', actorId, async (tx, current) => {
        const before = current.dashboards.find((dashboard) => dashboard.id === id);
        if (!before) throw new DefinitionNotFoundError('Dashboard', id);
        await removeDefinitions(tx, moduleId, 'dashboard', [id]);
        return {
          next: { ...current, dashboards: current.dashboards.filter((dashboard) => dashboard.id !== id) },
          result: undefined,
          audit: { kind: 'dashboard', before },
          entityId: null,
        };
      });
    },
    getAutomation: (moduleId: string, id: string) => getOne<AutomationDefinition>(moduleId, 'automation', id),

    async createAutomation(moduleId: string, definition: AutomationDefinition, actorId?: string): Promise<AutomationDefinition> {
      const parsed = AutomationDefinitionSchema.parse({ ...definition, moduleId });
      return mutate(moduleId, 'automation.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'automation', parsed);
        return {
          next: { ...current, automations: [...current.automations, parsed] },
          result: parsed,
          audit: { kind: 'automation', after: parsed },
          entityId: null,
        };
      });
    },

    async updateAutomation(moduleId: string, id: string, patch: Partial<AutomationDefinition>, actorId?: string): Promise<AutomationDefinition> {
      return mutate(moduleId, 'automation.updated', actorId, async (tx, current) => {
        const before = current.automations.find((automation) => automation.id === id);
        if (!before) throw new DefinitionNotFoundError('Automation', id);
        const after = AutomationDefinitionSchema.parse({ ...before, ...patch, moduleId });
        await writeDefinition(tx, moduleId, 'automation', after);
        return {
          next: { ...current, automations: current.automations.map((automation) => (automation.id === id ? after : automation)) },
          result: after,
          audit: { kind: 'automation', before, after },
          entityId: null,
        };
      });
    },

    async deleteAutomation(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'automation.deleted', actorId, async (tx, current) => {
        const before = current.automations.find((automation) => automation.id === id);
        if (!before) throw new DefinitionNotFoundError('Automation', id);
        await removeDefinitions(tx, moduleId, 'automation', [id]);
        return {
          next: { ...current, automations: current.automations.filter((automation) => automation.id !== id) },
          result: undefined,
          audit: { kind: 'automation', before },
          entityId: null,
        };
      });
    },

    async createWorkflow(moduleId: string, definition: WorkflowDefinition, actorId?: string): Promise<WorkflowDefinition> {
      const parsed = WorkflowDefinitionSchema.parse({ ...definition, moduleId });
      return mutate(moduleId, 'workflow.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'workflow', parsed);
        return {
          next: { ...current, workflows: [...current.workflows, parsed] },
          result: parsed,
          audit: { kind: 'workflow', after: parsed },
          entityId: parsed.entityId,
        };
      });
    },

    async createAction(moduleId: string, definition: ActionDefinition, actorId?: string): Promise<ActionDefinition> {
      const parsed = ActionDefinitionSchema.parse({ ...definition, moduleId });
      return mutate(moduleId, 'action.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'action', parsed);
        return {
          next: { ...current, actions: [...current.actions, parsed] },
          result: parsed,
          audit: { kind: 'action', after: parsed },
          entityId: parsed.entityId ?? null,
        };
      });
    },

    async createEntity(moduleId: string, input: z.input<typeof EntityCreateInputSchema>, actorId?: string): Promise<EntityDefinition> {
      const parsed = EntityCreateInputSchema.parse(input);
      const now = new Date().toISOString();
      const entity = EntityDefinitionSchema.parse({ ...parsed, moduleId, createdAt: now, updatedAt: now });
      return mutate(moduleId, 'entity.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'entity', entity);
        return {
          next: { ...current, entities: [...current.entities, entity] },
          result: entity,
          audit: { kind: 'entity', after: entity },
          entityId: entity.id,
        };
      });
    },

    async updateEntity(moduleId: string, id: string, patch: z.input<typeof EntityUpdateInputSchema>, actorId?: string): Promise<EntityDefinition> {
      const parsed = EntityUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'entity.updated', actorId, async (tx, current) => {
        const before = current.entities.find((entity) => entity.id === id);
        if (!before) throw new DefinitionNotFoundError('Entity', id);
        const { icon, ...rest } = parsed;
        const after = EntityDefinitionSchema.parse({
          ...before,
          ...rest,
          ...(icon === undefined ? {} : { icon: icon ?? undefined }),
          updatedAt: new Date().toISOString(),
        });
        await writeDefinition(tx, moduleId, 'entity', after);
        return {
          next: { ...current, entities: current.entities.map((entity) => (entity.id === id ? after : entity)) },
          result: after,
          audit: { kind: 'entity', before, after },
          entityId: id,
        };
      });
    },

    /** Deletes an entity and its own fields; refused while relations, reference fields, or records depend on it. */
    async deleteEntity(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'entity.deleted', actorId, async (tx, current) => {
        const before = current.entities.find((entity) => entity.id === id);
        if (!before) throw new DefinitionNotFoundError('Entity', id);
        const [existing] = await tx.select({ id: records.id }).from(records)
          .where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, id), sql`${records.deletedAt} IS NULL`)).limit(1);
        if (existing) throw new DefinitionConflictError(`Entity ${id} has records and cannot be deleted`);
        const ownedFields = current.fields.filter((field) => field.entityId === id);
        await removeDefinitions(tx, moduleId, 'field', ownedFields.map((field) => field.id));
        await removeDefinitions(tx, moduleId, 'entity', [id]);
        return {
          next: {
            ...current,
            entities: current.entities.filter((entity) => entity.id !== id),
            fields: current.fields.filter((field) => field.entityId !== id),
          },
          result: undefined,
          audit: { kind: 'entity', before, removedFields: ownedFields.map((field) => field.id) },
          entityId: id,
        };
      });
    },

    listFields: async (moduleId: string, entityId?: string) => {
      const all = await readAll<FieldDefinition>(handle.db, moduleId, 'field');
      return entityId ? all.filter((field) => field.entityId === entityId) : all;
    },
    getField: (moduleId: string, id: string) => getOne<FieldDefinition>(moduleId, 'field', id),

    async createField(moduleId: string, entityId: string, input: z.input<typeof FieldCreateInputSchema>, actorId?: string): Promise<FieldDefinition> {
      const parsed = FieldCreateInputSchema.parse(input);
      const field = FieldDefinitionSchema.parse({ ...parsed, entityId });
      return mutate(moduleId, 'field.created', actorId, async (tx, current) => {
        if (!current.entities.some((entity) => entity.id === entityId)) throw new DefinitionNotFoundError('Entity', entityId);
        await insertDefinition(tx, moduleId, 'field', field);
        return {
          next: { ...current, fields: [...current.fields, field] },
          result: field,
          audit: { kind: 'field', after: field },
          entityId: field.id,
        };
      });
    },

    async updateField(moduleId: string, id: string, patch: z.input<typeof FieldUpdateInputSchema>, actorId?: string): Promise<FieldDefinition> {
      const parsed = FieldUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'field.updated', actorId, async (tx, current) => {
        const before = current.fields.find((field) => field.id === id);
        if (!before) throw new DefinitionNotFoundError('Field', id);
        const after = FieldDefinitionSchema.parse({ ...before, ...parsed });
        await writeDefinition(tx, moduleId, 'field', after);
        return {
          next: { ...current, fields: current.fields.map((field) => (field.id === id ? after : field)) },
          result: after,
          audit: { kind: 'field', before, after },
          entityId: id,
        };
      });
    },

    async deleteField(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'field.deleted', actorId, async (tx, current) => {
        const before = current.fields.find((field) => field.id === id);
        if (!before) throw new DefinitionNotFoundError('Field', id);
        await removeDefinitions(tx, moduleId, 'field', [id]);
        return {
          next: { ...current, fields: current.fields.filter((field) => field.id !== id) },
          result: undefined,
          audit: { kind: 'field', before },
          entityId: id,
        };
      });
    },

    listRelations: (moduleId: string) => readAll<RelationDefinition>(handle.db, moduleId, 'relation'),
    getRelation: (moduleId: string, id: string) => getOne<RelationDefinition>(moduleId, 'relation', id),

    listViews: async (moduleId: string, entityId?: string) => {
      const all = await readAll<ViewDefinition>(handle.db, moduleId, 'view');
      return entityId ? all.filter((view) => view.entityId === entityId) : all;
    },
    getView: (moduleId: string, id: string) => getOne<ViewDefinition>(moduleId, 'view', id),

    async createView(moduleId: string, input: z.input<typeof ViewCreateInputSchema>, actorId?: string): Promise<ViewDefinition> {
      const parsed = ViewCreateInputSchema.parse(input);
      const view = ViewDefinitionSchema.parse({ ...parsed, moduleId });
      return mutate(moduleId, 'view.created', actorId, async (tx, current) => {
        if (!current.entities.some((entity) => entity.id === view.entityId)) throw new DefinitionNotFoundError('Entity', view.entityId);
        await insertDefinition(tx, moduleId, 'view', view);
        return {
          next: { ...current, views: [...current.views, view] },
          result: view,
          audit: { kind: 'view', after: view },
          entityId: view.entityId,
        };
      });
    },

    async updateView(moduleId: string, id: string, patch: z.input<typeof ViewUpdateInputSchema>, actorId?: string): Promise<ViewDefinition> {
      const parsed = ViewUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'view.updated', actorId, async (tx, current) => {
        const before = current.views.find((view) => view.id === id);
        if (!before) throw new DefinitionNotFoundError('View', id);
        const after = ViewDefinitionSchema.parse({ ...before, ...parsed, moduleId });
        await writeDefinition(tx, moduleId, 'view', after);
        return {
          next: { ...current, views: current.views.map((view) => (view.id === id ? after : view)) },
          result: after,
          audit: { kind: 'view', before, after },
          entityId: after.entityId,
        };
      });
    },

    async deleteView(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'view.deleted', actorId, async (tx, current) => {
        const before = current.views.find((view) => view.id === id);
        if (!before) throw new DefinitionNotFoundError('View', id);
        await removeDefinitions(tx, moduleId, 'view', [id]);
        return {
          next: { ...current, views: current.views.filter((view) => view.id !== id) },
          result: undefined,
          audit: { kind: 'view', before },
          entityId: before.entityId,
        };
      });
    },

    listForms: async (moduleId: string, entityId?: string) => {
      const all = await readAll<FormDefinition>(handle.db, moduleId, 'form');
      return entityId ? all.filter((form) => form.entityId === entityId) : all;
    },
    getForm: (moduleId: string, id: string) => getOne<FormDefinition>(moduleId, 'form', id),

    async createForm(moduleId: string, input: z.input<typeof FormCreateInputSchema>, actorId?: string): Promise<FormDefinition> {
      const parsed = FormCreateInputSchema.parse(input);
      const form = FormDefinitionSchema.parse({ ...parsed, moduleId });
      return mutate(moduleId, 'form.created', actorId, async (tx, current) => {
        if (!current.entities.some((entity) => entity.id === form.entityId)) throw new DefinitionNotFoundError('Entity', form.entityId);
        await insertDefinition(tx, moduleId, 'form', form);
        return {
          next: { ...current, forms: [...current.forms, form] },
          result: form,
          audit: { kind: 'form', after: form },
          entityId: form.entityId,
        };
      });
    },

    async updateForm(moduleId: string, id: string, patch: z.input<typeof FormUpdateInputSchema>, actorId?: string): Promise<FormDefinition> {
      const parsed = FormUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'form.updated', actorId, async (tx, current) => {
        const before = current.forms.find((form) => form.id === id);
        if (!before) throw new DefinitionNotFoundError('Form', id);
        const after = FormDefinitionSchema.parse({ ...before, ...parsed, moduleId });
        await writeDefinition(tx, moduleId, 'form', after);
        return {
          next: { ...current, forms: current.forms.map((form) => (form.id === id ? after : form)) },
          result: after,
          audit: { kind: 'form', before, after },
          entityId: after.entityId,
        };
      });
    },

    async deleteForm(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'form.deleted', actorId, async (tx, current) => {
        const before = current.forms.find((form) => form.id === id);
        if (!before) throw new DefinitionNotFoundError('Form', id);
        await removeDefinitions(tx, moduleId, 'form', [id]);
        return {
          next: { ...current, forms: current.forms.filter((form) => form.id !== id) },
          result: undefined,
          audit: { kind: 'form', before },
          entityId: before.entityId,
        };
      });
    },

    async createRelation(moduleId: string, input: z.input<typeof RelationCreateInputSchema>, actorId?: string): Promise<RelationDefinition> {
      const relation = RelationDefinitionSchema.parse(RelationCreateInputSchema.parse(input));
      return mutate(moduleId, 'relation.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'relation', relation);
        return {
          next: { ...current, relations: [...current.relations, relation] },
          result: relation,
          audit: { kind: 'relation', after: relation },
          entityId: relation.id,
        };
      });
    },

    async updateRelation(moduleId: string, id: string, patch: z.input<typeof RelationUpdateInputSchema>, actorId?: string): Promise<RelationDefinition> {
      const parsed = RelationUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'relation.updated', actorId, async (tx, current) => {
        const before = current.relations.find((relation) => relation.id === id);
        if (!before) throw new DefinitionNotFoundError('Relation', id);
        const { reverseName, ...rest } = parsed;
        const after = RelationDefinitionSchema.parse({
          ...before,
          ...rest,
          ...(reverseName === undefined ? {} : { reverseName: reverseName ?? undefined }),
        });
        await writeDefinition(tx, moduleId, 'relation', after);
        return {
          next: { ...current, relations: current.relations.map((relation) => (relation.id === id ? after : relation)) },
          result: after,
          audit: { kind: 'relation', before, after },
          entityId: id,
        };
      });
    },

    async deleteRelation(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'relation.deleted', actorId, async (tx, current) => {
        const before = current.relations.find((relation) => relation.id === id);
        if (!before) throw new DefinitionNotFoundError('Relation', id);
        await removeDefinitions(tx, moduleId, 'relation', [id]);
        return {
          next: { ...current, relations: current.relations.filter((relation) => relation.id !== id) },
          result: undefined,
          audit: { kind: 'relation', before },
          entityId: id,
        };
      });
    },
  };
}
