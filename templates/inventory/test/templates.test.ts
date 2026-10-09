import { describe, expect, it } from 'vitest';
import {
  EntityDefinitionSchema, FieldDefinitionSchema, RelationDefinitionSchema,
} from '../../../packages/meta/src/index';
import { validateModuleSchema } from '../../../packages/db/src/definition-integrity';
import type { EntityDefinition, FieldDefinition } from '@nexa/meta';
import { inventoryTemplate } from '../src/index';
import { crmTemplate } from '../../crm/src/index';
import { hrTemplate } from '../../hr/src/index';

const templates = [
  { template: inventoryTemplate, name: 'inventory' },
  { template: crmTemplate, name: 'crm' },
  { template: hrTemplate, name: 'hr' },
] as const;

describe('metadata templates', () => {
  for (const { template, name } of templates) {
    it(`validates the ${name} template against meta schemas and module integrity`, () => {
      expect(template.moduleId).toBeTruthy();

      const entities: EntityDefinition[] = [];
      const fields: FieldDefinition[] = [];
      template.entities.forEach(({ fields: entityFields, ...entity }) => {
        entities.push(EntityDefinitionSchema.parse({
          ...entity, moduleId: template.moduleId,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        }));
        entityFields.forEach((field) => {
          fields.push(FieldDefinitionSchema.parse({ ...field, entityId: entity.id }) as FieldDefinition);
        });
      });
      const relations = template.relations.map((relation) => RelationDefinitionSchema.parse(relation));

      const issues = validateModuleSchema(entities, fields, relations, [], [], [], [], []);
      expect(issues).toEqual([]);
    });
  }

  it('uses unique module ids and semantic versions', () => {
    const ids = templates.map(({ template }) => template.moduleId);
    expect(new Set(ids).size).toBe(templates.length);
    for (const { template } of templates) {
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
