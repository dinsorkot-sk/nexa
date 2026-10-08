import { describe, expect, it } from 'vitest';
import type { EntityDefinition, FieldDefinition, RelationDefinition } from '@nexa/meta';
import { validateModuleSchema } from '../src/definition-integrity';

const entity = (id: string, name = id): EntityDefinition => ({
  id, moduleId: 'm', name, label: name, pluralLabel: `${name}s`, description: '', settings: {},
});
const field = (id: string, entityId: string, name = id, referenceEntityId?: string): FieldDefinition => ({
  id, entityId, name, label: name, type: referenceEntityId ? 'reference' : 'text', position: 0,
  options: {
    required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true,
    filterable: true, indexed: false, isStatus: false, ui: {}, ...(referenceEntityId ? { referenceEntityId } : {}),
  },
});
const relation = (overrides: Partial<RelationDefinition> = {}): RelationDefinition => ({
  id: 'r', name: 'r', sourceEntityId: 'a', targetEntityId: 'b', type: 'oneToMany', onDelete: 'restrict', ...overrides,
});

describe('validateModuleSchema', () => {
  it('accepts a consistent schema', () => {
    const issues = validateModuleSchema(
      [entity('a'), entity('b')],
      [field('a1', 'a', 'title'), field('b1', 'b', 'title'), field('a2', 'a', 'link', 'b')],
      [relation({ sourceFieldId: 'a1', targetFieldId: 'b1' })],
    );
    expect(issues).toEqual([]);
  });

  it('reports duplicate entity and field names', () => {
    const issues = validateModuleSchema(
      [entity('a', 'same'), entity('b', 'same')],
      [field('f1', 'a', 'dup'), field('f2', 'a', 'dup')],
      [],
    );
    expect(issues.map((issue) => issue.kind)).toEqual(['entity', 'field']);
  });

  it('reports dangling references, relation endpoints, and relation fields', () => {
    const issues = validateModuleSchema(
      [entity('a')],
      [field('f1', 'a', 'ref', 'ghost')],
      [relation({ targetEntityId: 'ghost', sourceFieldId: 'missing' })],
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      expect.stringContaining('non-existent entity'),
      expect.stringContaining('target entity'),
      expect.stringContaining('source field'),
    ]);
  });

  it('validates formula expression syntax and field references', () => {
    const issues = validateModuleSchema(
      [entity('e')],
      [
        field('name', 'e', 'name'),
        field('quantity', 'e', 'quantity'),
        field('price', 'e', 'price'),
        {
          id: 'total', entityId: 'e', name: 'total', label: 'Total', type: 'computed' as const, position: 0,
          options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, expression: 'quantity * price' },
        } satisfies FieldDefinition,
        {
          id: 'broken', entityId: 'e', name: 'broken', label: 'Broken', type: 'formula' as const, position: 0,
          options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, expression: 'quantity * ghost' },
        } satisfies FieldDefinition,
      ],
      [],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('broken');
    expect(issues[0].message).toMatch(/does not exist/);
  });

  it('rejects formula expressions with invalid syntax', () => {
    const issues = validateModuleSchema(
      [entity('e')],
      [
        {
          id: 'bad', entityId: 'e', name: 'bad', label: 'Bad', type: 'formula' as const, position: 0,
          options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, expression: 'eval(quantity)' },
        } satisfies FieldDefinition,
      ],
      [],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/Invalid expression/);
  });
});
