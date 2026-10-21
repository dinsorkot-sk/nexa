import type { ActionDefinition, AutomationDefinition, DashboardDefinition, EntityDefinition, FieldDefinition, FormDefinition, PermissionDefinition, RelationDefinition, ReportDefinition, ViewDefinition, WorkflowDefinition } from '@nexa/meta';
import { extractFormulaReferences, parseExpression, parseFormulaGraph, topologicalFormulaOrder } from '../../engine/formula/index';

export interface DefinitionValidationIssue {
  kind: 'entity' | 'field' | 'relation' | 'view' | 'form' | 'workflow' | 'action' | 'automation' | 'report' | 'dashboard' | 'permission';
  id: string;
  message: string;
  path?: string[];
}

/**
 * Cross-checks permission definitions against the module's entities, fields
 * and actions. A permission that names a resource the module does not have
 * grants nothing, so it is refused rather than stored.
 */
export function validatePermissionReferences(
  entities: EntityDefinition[],
  fields: FieldDefinition[],
  actions: ActionDefinition[],
  permissions: PermissionDefinition[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const fieldIds = new Set(fields.map((field) => field.id));
  const actionIds = new Set(actions.map((action) => action.id));
  for (const permission of permissions) {
    const resource = permission.resource;
    if (!resource.id) continue;
    if (resource.type === 'entity' && !entityIds.has(resource.id)) {
      issues.push({ kind: 'permission', id: permission.id, message: `Permission references unknown entity "${resource.id}"`, path: ['resource', 'id'] });
    }
    if (resource.type === 'field' && !fieldIds.has(resource.id)) {
      issues.push({ kind: 'permission', id: permission.id, message: `Permission references unknown field "${resource.id}"`, path: ['resource', 'id'] });
    }
    if (resource.type === 'action' && !actionIds.has(resource.id)) {
      issues.push({ kind: 'permission', id: permission.id, message: `Permission references unknown action "${resource.id}"`, path: ['resource', 'id'] });
    }
  }
  return issues;
}

/**
 * Cross-checks views and forms against the module's entities and fields.
 * A view or a form belongs to an entity that has to exist, and the fields it
 * names have to be fields of that entity. An entity has one default view:
 * two of them would leave the choice of which one to open ambiguous.
 */
export function validateViewReferences(
  entities: EntityDefinition[],
  fields: FieldDefinition[],
  views: ViewDefinition[],
  forms: FormDefinition[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const fieldsByEntity = new Map<string, Set<string>>();
  for (const field of fields) {
    const owned = fieldsByEntity.get(field.entityId) ?? new Set<string>();
    owned.add(field.id);
    fieldsByEntity.set(field.entityId, owned);
  }
  const defaults = new Map<string, string>();
  for (const view of views) {
    if (!entityIds.has(view.entityId)) {
      issues.push({ kind: 'view', id: view.id, message: `View references unknown entity "${view.entityId}"`, path: ['entityId'] });
      continue;
    }
    const owned = fieldsByEntity.get(view.entityId) ?? new Set<string>();
    view.columns.forEach((column, index) => {
      if (!owned.has(column.fieldId)) {
        issues.push({ kind: 'view', id: view.id, message: `View column references unknown field "${column.fieldId}"`, path: ['columns', String(index), 'fieldId'] });
      }
    });
    view.sort.forEach((entry, index) => {
      if (!owned.has(entry.fieldId)) {
        issues.push({ kind: 'view', id: view.id, message: `View sort references unknown field "${entry.fieldId}"`, path: ['sort', String(index), 'fieldId'] });
      }
    });
    if (view.isDefault) {
      const existing = defaults.get(view.entityId);
      if (existing) {
        issues.push({ kind: 'view', id: view.id, message: `Entity "${view.entityId}" already has a default view "${existing}"`, path: ['isDefault'] });
      }
      defaults.set(view.entityId, view.id);
    }
  }
  for (const form of forms) {
    if (!entityIds.has(form.entityId)) {
      issues.push({ kind: 'form', id: form.id, message: `Form references unknown entity "${form.entityId}"`, path: ['entityId'] });
      continue;
    }
    const owned = fieldsByEntity.get(form.entityId) ?? new Set<string>();
    form.sections.forEach((section, index) => {
      section.fieldIds.forEach((fieldId, fieldIndex) => {
        if (!owned.has(fieldId)) {
          issues.push({ kind: 'form', id: form.id, message: `Form section references unknown field "${fieldId}"`, path: ['sections', String(index), 'fieldIds', String(fieldIndex)] });
        }
      });
    });
  }
  return issues;
}

/**
 * Cross-checks automations against the module's entities and actions.
 * A record trigger must name an existing entity, and every automation action
 * must reference an existing action definition.
 */
export function validateAutomationReferences(
  entities: EntityDefinition[],
  automations: AutomationDefinition[],
  actions: ActionDefinition[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const actionIds = new Set(actions.map((action) => action.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const automation of automations) {
    if (automation.trigger.type === 'record' && !entityIds.has(automation.trigger.entityId)) {
      issues.push({ kind: 'automation', id: automation.id, message: `Automation references unknown entity "${automation.trigger.entityId}"`, path: ['trigger', 'entityId'] });
    }
    automation.actions.forEach((ref, index) => {
      if (!actionIds.has(ref.actionId)) {
        issues.push({ kind: 'automation', id: automation.id, message: `Automation references unknown action "${ref.actionId}"`, path: ['actions', String(index), 'actionId'] });
      }
    });
  }
  return issues;
}

/**
 * Cross-checks reports and dashboards against the module's entities and fields.
 */
export function validateReportReferences(
  entities: EntityDefinition[],
  fields: FieldDefinition[],
  reports: ReportDefinition[],
  dashboards: DashboardDefinition[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const fieldsByEntity = new Map<string, Set<string>>();
  for (const field of fields) {
    const group = fieldsByEntity.get(field.entityId) ?? new Set<string>();
    group.add(field.id);
    fieldsByEntity.set(field.entityId, group);
  }
  for (const report of reports) {
    if (!entityIds.has(report.entityId)) {
      issues.push({ kind: 'report', id: report.id, message: `Report references unknown entity "${report.entityId}"`, path: ['entityId'] });
      continue;
    }
    const entityFields = fieldsByEntity.get(report.entityId) ?? new Set<string>();
    for (const fieldId of [...report.fieldIds, ...report.groupBy, ...report.aggregations.filter((agg) => agg.fieldId).map((agg) => agg.fieldId!), ...report.sort.map((sort) => sort.fieldId)]) {
      if (!entityFields.has(fieldId)) {
        issues.push({ kind: 'report', id: report.id, message: `Report references unknown field "${fieldId}" on entity "${report.entityId}"`, path: ['fieldIds'] });
        break;
      }
    }
  }
  const reportIds = new Set(reports.map((report) => report.id));
  for (const dashboard of dashboards) {
    for (const widget of dashboard.widgets) {
      if (widget.reportId && !reportIds.has(widget.reportId)) {
        issues.push({ kind: 'dashboard', id: dashboard.id, message: `Widget "${widget.id}" references unknown report "${widget.reportId}"`, path: ['widgets'] });
      }
    }
  }
  return issues;
}

/**
 * Validates a module's full set of entity, field, and relation definitions.
 * Checks: unique entity/field names, relation endpoints, reference fields, dangling field IDs.
 * Does not access the database.
 */
/**
 * Cross-checks workflows against the module's entities, fields, and actions.
 * `stateFieldId` must name a select field on the workflow's own entity, and every
 * workflow transition action must reference an existing action definition.
 */
export function validateWorkflowReferences(
  entities: EntityDefinition[],
  fields: FieldDefinition[],
  workflows: WorkflowDefinition[],
  actions: ActionDefinition[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const actionIds = new Set(actions.map((action) => action.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const workflow of workflows) {
    if (!entityIds.has(workflow.entityId)) {
      issues.push({ kind: 'workflow', id: workflow.id, message: `Workflow references unknown entity "${workflow.entityId}"`, path: ['entityId'] });
      continue;
    }
    const stateField = fields.find((field) => field.entityId === workflow.entityId && field.id === workflow.stateFieldId);
    if (!stateField || stateField.type !== 'select') {
      issues.push({ kind: 'workflow', id: workflow.id, message: `stateFieldId "${workflow.stateFieldId}" must be a select field on entity "${workflow.entityId}"`, path: ['stateFieldId'] });
    }
    workflow.transitions.forEach((transition, index) => {
      transition.actions.forEach((ref, actionIndex) => {
        if (!actionIds.has(ref.actionId)) {
          issues.push({
            kind: 'workflow',
            id: workflow.id,
            message: `Transition "${transition.id}" references unknown action "${ref.actionId}"`,
            path: ['transitions', String(index), 'actions', String(actionIndex), 'actionId'],
          });
        }
      });
    });
  }
  return issues;
}

export function validateModuleSchema(
  entities: EntityDefinition[],
  fields: FieldDefinition[],
  relations: RelationDefinition[],
  workflows: WorkflowDefinition[] = [],
  actions: ActionDefinition[] = [],
  automations: AutomationDefinition[] = [],
  reports: ReportDefinition[] = [],
  dashboards: DashboardDefinition[] = [],
  views: ViewDefinition[] = [],
  forms: FormDefinition[] = [],
  permissions: PermissionDefinition[] = [],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [
    ...validateWorkflowReferences(entities, fields, workflows, actions),
    ...validateAutomationReferences(entities, automations, actions),
    ...validateReportReferences(entities, fields, reports, dashboards),
    ...validateViewReferences(entities, fields, views, forms),
    ...validatePermissionReferences(entities, fields, actions, permissions),
  ];
  const entityById = new Map(entities.map(e => [e.id, e]));
  const fieldsByEntityId = new Map<string, Map<string, FieldDefinition>>();

  // Index fields by entity
  for (const field of fields) {
    if (!fieldsByEntityId.has(field.entityId)) {
      fieldsByEntityId.set(field.entityId, new Map());
    }
    fieldsByEntityId.get(field.entityId)!.set(field.id, field);
  }

  // Check unique entity names
  const entityNames = new Map<string, string>();
  for (const entity of entities) {
    if (entityNames.has(entity.name)) {
      issues.push({
        kind: 'entity',
        id: entity.id,
        message: `Entity name "${entity.name}" is not unique in this module`,
        path: ['name'],
      });
    } else {
      entityNames.set(entity.name, entity.id);
    }
  }

  // Check unique field names per entity
  for (const entity of entities) {
    const fieldNames = new Map<string, string>();
    const fieldsInEntity = fieldsByEntityId.get(entity.id) || new Map();
    for (const field of fieldsInEntity.values()) {
      if (fieldNames.has(field.name)) {
        issues.push({
          kind: 'field',
          id: field.id,
          message: `Field name "${field.name}" is not unique in entity "${entity.name}"`,
          path: ['name'],
        });
      } else {
        fieldNames.set(field.name, field.id);
      }
    }
  }

  // Check reference fields point at existing entities
  for (const field of fields) {
    if (field.options.referenceEntityId && !entityById.has(field.options.referenceEntityId)) {
      issues.push({
        kind: 'field',
        id: field.id,
        message: `Reference field points to non-existent entity "${field.options.referenceEntityId}"`,
        path: ['options', 'referenceEntityId'],
      });
    }
  }

  // Check relation endpoints exist
  for (const relation of relations) {
    if (!entityById.has(relation.sourceEntityId)) {
      issues.push({
        kind: 'relation',
        id: relation.id,
        message: `Relation source entity "${relation.sourceEntityId}" does not exist`,
        path: ['sourceEntityId'],
      });
    }
    if (!entityById.has(relation.targetEntityId)) {
      issues.push({
        kind: 'relation',
        id: relation.id,
        message: `Relation target entity "${relation.targetEntityId}" does not exist`,
        path: ['targetEntityId'],
      });
    }
  }

  // Check relation field IDs exist
  for (const relation of relations) {
    if (relation.sourceFieldId) {
      const sourceEntity = entityById.get(relation.sourceEntityId);
      const sourceFieldsMap = fieldsByEntityId.get(relation.sourceEntityId) || new Map();
      if (sourceEntity && !sourceFieldsMap.has(relation.sourceFieldId)) {
        issues.push({
          kind: 'relation',
          id: relation.id,
          message: `Relation source field "${relation.sourceFieldId}" does not exist in entity "${relation.sourceEntityId}"`,
          path: ['sourceFieldId'],
        });
      }
    }
    if (relation.targetFieldId) {
      const targetEntity = entityById.get(relation.targetEntityId);
      const targetFieldsMap = fieldsByEntityId.get(relation.targetEntityId) || new Map();
      if (targetEntity && !targetFieldsMap.has(relation.targetFieldId)) {
        issues.push({
          kind: 'relation',
          id: relation.id,
          message: `Relation target field "${relation.targetFieldId}" does not exist in entity "${relation.targetEntityId}"`,
          path: ['targetFieldId'],
        });
      }
    }
  }

  // autoNumber generation is deferred; reject definitions that bypassed
  // creation-time validation rather than failing on every record write.
  for (const field of fields) {
    if (field.type === 'autoNumber') {
      issues.push({
        kind: 'field',
        id: field.id,
        message: 'autoNumber fields are not supported yet',
        path: ['type'],
      });
    }
  }

  // Check formula/computed expressions parse and reference existing fields in the same entity
  for (const field of fields) {
    if (field.type !== 'formula' && field.type !== 'computed') continue;
    const expression = field.options.expression;
    if (!expression) continue; // schema-level rule already requires expression
    let ast;
    try {
      ast = parseExpression(expression);
    } catch (error) {
      issues.push({
        kind: 'field',
        id: field.id,
        message: `Invalid expression: ${error instanceof Error ? error.message : String(error)}`,
        path: ['options', 'expression'],
      });
      continue;
    }
    const entityFields = fieldsByEntityId.get(field.entityId) || new Map();
    for (const ref of extractFormulaReferences(ast)) {
      if (!entityFields.has(ref)) {
        issues.push({
          kind: 'field',
          id: field.id,
          message: `Expression references field "${ref}" which does not exist in entity "${field.entityId}"`,
          path: ['options', 'expression'],
        });
      }
    }
  }

  // Detect formula cycles at definition time so an invalid graph cannot be
  // written and then fail silently on every record operation.
  const formulaFieldsByEntity = new Map<string, typeof fields>();
  for (const field of fields) {
    if (field.type !== 'formula' && field.type !== 'computed') continue;
    const group = formulaFieldsByEntity.get(field.entityId) ?? [];
    group.push(field);
    formulaFieldsByEntity.set(field.entityId, group);
  }
  for (const [entityId, group] of formulaFieldsByEntity) {
    const { nodes, parseErrors } = parseFormulaGraph(group);
    if (parseErrors.length > 0) continue; // already reported by the syntax check above
    const { cyclic } = topologicalFormulaOrder(nodes);
    for (const id of cyclic) {
      issues.push({
        kind: 'field',
        id,
        message: `Expression creates a circular reference in entity "${entityId}"`,
        path: ['options', 'expression'],
      });
    }
  }

  return issues;
}
