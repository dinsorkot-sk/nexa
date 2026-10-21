import { describe, expect, it } from 'vitest';
import { MetadataTemplateSchema } from '../../../packages/meta/src/index';
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
    it(`validates the ${name} template against the template schema and module integrity`, () => {
      const parsed = MetadataTemplateSchema.parse(template);
      expect(parsed.moduleId).toBeTruthy();

      const entities: EntityDefinition[] = [];
      const fields: FieldDefinition[] = [];
      parsed.entities.forEach(({ fields: entityFields, ...entity }) => {
        entities.push({
          ...entity,
          moduleId: parsed.moduleId,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        entityFields.forEach((field) => {
          fields.push({ ...field, entityId: entity.id });
        });
      });

      const issues = validateModuleSchema(entities, fields, parsed.relations, [], [], [], [], []);
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
