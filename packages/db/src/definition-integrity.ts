import type { ActionDefinition, EntityDefinition, FieldDefinition, RelationDefinition, WorkflowDefinition } from '@nexa/meta';
import { extractFormulaReferences, parseExpression, parseFormulaGraph, topologicalFormulaOrder } from '../../engine/formula/index';

export interface DefinitionValidationIssue {
  kind: 'entity' | 'field' | 'relation' | 'workflow' | 'action';
  id: string;
  message: string;
  path?: string[];
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
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [...validateWorkflowReferences(entities, fields, workflows, actions)];
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
