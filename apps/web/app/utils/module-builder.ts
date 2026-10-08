import {
  EntityCreateInputSchema,
  FieldCreateInputSchema,
  ModuleCreateInputSchema,
  ModuleUpdateInputSchema,
  RelationCreateInputSchema,
  canTransitionModuleStatus,
} from '@nexa/meta';
import type { EntityDefinition, FieldDefinition, ModuleDefinition, ModuleStatus, RelationDefinition } from '@nexa/meta';
import type { z } from 'zod';

export interface ModuleSchema {
  entities: EntityDefinition[];
  fields: FieldDefinition[];
  relations: RelationDefinition[];
}

export function availableModuleTransitions(status: ModuleStatus): ModuleStatus[] {
  const statuses: ModuleStatus[] = ['draft', 'review', 'published', 'enabled', 'disabled', 'archived'];
  return statuses.filter((next) => canTransitionModuleStatus(status, next));
}

export function parseForm<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}

export function moduleCreateInput(input: unknown, ownerId: string) {
  return parseForm(ModuleCreateInputSchema, { ...(input as object), owner: { id: ownerId, type: 'user' } });
}

export function moduleUpdateInput(input: unknown) {
  return parseForm(ModuleUpdateInputSchema, input);
}

export function entityCreateInput(input: unknown) {
  return parseForm(EntityCreateInputSchema, input);
}

export function fieldCreateInput(input: unknown) {
  return parseForm(FieldCreateInputSchema, input);
}

export function relationCreateInput(input: unknown) {
  return parseForm(RelationCreateInputSchema, input);
}

export function entityFields(schema: ModuleSchema, entityId: string): FieldDefinition[] {
  return schema.fields.filter((field) => field.entityId === entityId).sort((left, right) => left.position - right.position);
}

export function moduleStatusTone(status: ModuleDefinition['status']): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'enabled') return 'success';
  if (status === 'review' || status === 'published') return 'warning';
  if (status === 'archived') return 'danger';
  return 'neutral';
}
