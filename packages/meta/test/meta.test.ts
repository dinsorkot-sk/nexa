import { describe, expect, it } from 'vitest';
import {
  canTransitionModuleStatus,
  RecordCreateInputSchema,
  RecordQuerySchema,
  RecordUpdateInputSchema,
  EntityCreateInputSchema,
  EntityUpdateInputSchema,
  FieldCreateInputSchema,
  FieldUpdateInputSchema,
  RelationCreateInputSchema,
  RelationUpdateInputSchema,
  RelationDefinitionSchema,
  FieldDefinitionSchema,
  HealthCheckSchema,
  ModuleDefinitionSchema,
  ModuleCreateInputSchema,
  ModuleUpdateInputSchema,
  ModuleTransitionInputSchema,
  ModulePackageSchema,
  transitionModuleStatus,
  WorkflowDefinitionSchema,
} from '../src/index';

describe('@nexa/meta schemas', () => {
  it('validates a health check payload', () => {
    expect(HealthCheckSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    }).status).toBe('ok');
  });

  it('validates a tenant-scoped module definition and defaults metadata', () => {
    const module = ModuleDefinitionSchema.parse({
      id: 'inventory',
      tenantId: 'tenant-1',
      owner: { id: 'user-1', type: 'user' },
      name: 'Inventory',
      version: '1.0.0',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(module.description).toBe('');
    expect(module.settings).toEqual({});
    expect(module.dependencies).toEqual([]);
  });

  it('rejects invalid field types and malformed semantic versions', () => {
    expect(() => FieldDefinitionSchema.parse({
      id: 'field-1', entityId: 'vehicle', name: 'make', label: 'Make', type: 'madeUp', position: 0,
    })).toThrow();

    expect(() => ModuleDefinitionSchema.parse({
      id: 'inventory', tenantId: 'tenant-1', owner: { id: 'user-1', type: 'user' },
      name: 'Inventory', version: '1.0', status: 'draft',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })).toThrow();
  });

  it('validates module registry inputs and rejects immutable properties', () => {
    const create = ModuleCreateInputSchema.parse({
      id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0',
    });
    expect('status' in create).toBe(false);
    expect(ModuleCreateInputSchema.safeParse({
      id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0',
      dependencies: [{ moduleId: 'fleet', version: '1.0.0' }],
    }).success).toBe(false);
    expect(ModuleCreateInputSchema.safeParse({
      id: 'fleet', tenantId: 'spoofed', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0',
    }).success).toBe(false);
    expect(ModuleUpdateInputSchema.safeParse({ status: 'enabled' }).success).toBe(false);
    expect(ModuleUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(ModuleTransitionInputSchema.safeParse({ to: 'enabled' }).success).toBe(true);
    expect(ModuleTransitionInputSchema.safeParse({ to: 'enabled', status: 'draft' }).success).toBe(false);
  });

  it('enforces structural rules per field type', () => {
    const field = (type: string, options: Record<string, unknown> = {}) => FieldDefinitionSchema.safeParse({
      id: 'f', entityId: 'e', name: 'f', label: 'F', type, options, position: 0,
    }).success;
    expect(field('text')).toBe(true);
    expect(field('select')).toBe(false);
    expect(field('select', { choices: [] })).toBe(false);
    expect(field('select', { choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toBe(false);
    expect(field('select', { choices: [{ value: 'a', label: 'A' }] })).toBe(true);
    expect(field('multiSelect', { choices: [{ value: 'a', label: 'A' }] })).toBe(true);
    expect(field('reference')).toBe(false);
    expect(field('reference', { referenceEntityId: 'other' })).toBe(true);
    expect(field('formula')).toBe(false);
    expect(field('computed', { expression: 'a + b' })).toBe(true);
    expect(field('number', { min: 5, max: 1 })).toBe(false);
    expect(field('number', { min: 1, max: 5 })).toBe(true);
    expect(field('text', { regex: '(' })).toBe(false);
    expect(field('text', { regex: '^[A-Z]+$' })).toBe(true);
  });

  it('validates entity, field, and relation input schemas', () => {
    expect(EntityCreateInputSchema.safeParse({ id: 'v', name: 'v', label: 'V', pluralLabel: 'Vs' }).success).toBe(true);
    expect(EntityCreateInputSchema.safeParse({ id: 'v', moduleId: 'm', name: 'v', label: 'V', pluralLabel: 'Vs' }).success).toBe(false);
    expect(EntityUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(EntityUpdateInputSchema.safeParse({ id: 'other' }).success).toBe(false);
    expect(FieldCreateInputSchema.safeParse({ id: 'f', name: 'f', label: 'F', type: 'text' }).success).toBe(true);
    expect(FieldCreateInputSchema.safeParse({ id: 'f', entityId: 'e', name: 'f', label: 'F', type: 'text' }).success).toBe(false);
    expect(FieldUpdateInputSchema.safeParse({ type: 'number' }).success).toBe(false);
    expect(RelationCreateInputSchema.safeParse({
      id: 'r', name: 'r', sourceEntityId: 'a', targetEntityId: 'a', type: 'manyToMany',
    }).success).toBe(false);
    expect(RelationUpdateInputSchema.safeParse({ sourceEntityId: 'x' }).success).toBe(false);
    expect(RelationUpdateInputSchema.safeParse({ onDelete: 'cascade' }).success).toBe(true);
  });

  it('validates bounded record input and query defaults', () => {
    expect(RecordCreateInputSchema.safeParse({ data: { name: 'Vehicle' } }).success).toBe(true);
    expect(RecordUpdateInputSchema.safeParse({ data: {}, version: 1 }).success).toBe(true);
    expect(RecordQuerySchema.parse({}).limit).toBe(25);
    expect(RecordQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('enforces module lifecycle transitions and terminal archive', () => {
    expect(canTransitionModuleStatus('draft', 'review')).toBe(true);
    expect(canTransitionModuleStatus('draft', 'enabled')).toBe(false);
    expect(transitionModuleStatus('review', 'published')).toBe('published');
    expect(() => transitionModuleStatus('archived', 'draft')).toThrow(/Invalid module status transition/);
  });

  it('rejects unsupported self-referential many-to-many relations', () => {
    expect(RelationDefinitionSchema.safeParse({
      id: 'related-items', name: 'Related items', sourceEntityId: 'item', targetEntityId: 'item', type: 'manyToMany',
    }).success).toBe(false);
  });

  it('validates workflow state references and exactly one initial state', () => {
    const valid = {
      id: 'workflow-1', moduleId: 'fleet', entityId: 'vehicle', name: 'Availability',
      states: [
        { id: 'available', name: 'available', label: 'Available', initial: true },
        { id: 'rented', name: 'rented', label: 'Rented' },
      ],
      transitions: [{ id: 'rent', from: 'available', to: 'rented', label: 'Rent' }],
    };
    expect(WorkflowDefinitionSchema.safeParse(valid).success).toBe(true);
    expect(WorkflowDefinitionSchema.safeParse({
      ...valid,
      transitions: [{ id: 'broken', from: 'missing', to: 'rented', label: 'Broken' }],
    }).success).toBe(false);
  });

  it('requires module packages to align manifest and module identity/version', () => {
    const module = {
      id: 'crm', tenantId: 'tenant-1', owner: { id: 'system', type: 'system' as const },
      name: 'CRM', version: '1.2.0', status: 'published' as const,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const pkg = {
      manifest: { formatVersion: 1 as const, moduleId: 'crm', version: '1.2.0', exportedAt: new Date().toISOString() },
      module,
    };
    expect(ModulePackageSchema.safeParse(pkg).success).toBe(true);
    expect(ModulePackageSchema.safeParse({ ...pkg, manifest: { ...pkg.manifest, version: '2.0.0' } }).success).toBe(false);
  });
});
