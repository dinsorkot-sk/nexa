import type { EntityDefinition, FieldDefinition, RelationDefinition } from '@nexa/meta';

export interface DefinitionValidationIssue {
  kind: 'entity' | 'field' | 'relation';
  id: string;
  message: string;
  path?: string[];
}

/**
 * Validates a module's full set of entity, field, and relation definitions.
 * Checks: unique entity/field names, relation endpoints, reference fields, dangling field IDs.
 * Does not access the database.
 */
export function validateModuleSchema(entities: EntityDefinition[], fields: FieldDefinition[], relations: RelationDefinition[]): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
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

  return issues;
}
