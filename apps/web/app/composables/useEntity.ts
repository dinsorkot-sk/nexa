import type { EntityDefinition, FieldDefinition, FormDefinition } from '@nexa/meta';

import { api } from '~/composables/useApi';

export interface RecordRow {
  id: string;
  version: number;
  data: Record<string, unknown>;
}

export interface Option {
  value: string;
  label: string;
}

/** The label a record is shown by when it is the target of a reference or a relation. */
export function recordLabel(record: { id: string; data: Record<string, unknown> }): string {
  const text = Object.values(record.data).find((value): value is string => typeof value === 'string' && value !== '');
  return text ?? record.id;
}

/** Loads an entity's definition and fields, and builds the form its records are edited with. */
export async function loadEntity(moduleId: string, entityId: string) {
  const [entities, allFields, forms] = await Promise.all([
    api<EntityDefinition[]>(`/modules/${moduleId}/entities`),
    api<FieldDefinition[]>(`/modules/${moduleId}/fields`),
    api<FormDefinition[]>(`/modules/${moduleId}/forms`),
  ]);
  const fields = allFields.filter((field) => field.entityId === entityId);
  const stored = forms.find((form) => form.entityId === entityId);
  const form = stored ?? ({
    id: 'default',
    moduleId,
    entityId,
    name: 'default',
    sections: [{ id: 'main', label: 'ข้อมูล', fieldIds: fields.filter((field) => !field.options.hidden).map((field) => field.id), columns: 1, visibility: {} }],
    settings: {},
  } as FormDefinition);
  return { entity: entities.find((candidate) => candidate.id === entityId), fields, form };
}

/** Server-side search for a reference field: the list endpoint's page, narrowed by the label here. */
export function referenceLoader(moduleId: string, field: FieldDefinition) {
  return async (search: string, context: { limit: number; signal: AbortSignal }): Promise<Option[]> => {
    const target = field.options.referenceEntityId;
    if (!target) return [];
    const result = await api<{ items: RecordRow[] }>(`/modules/${moduleId}/entities/${target}/records?limit=${context.limit}`);
    const needle = search.trim().toLowerCase();
    return result.items
      .map((record) => ({ value: record.id, label: recordLabel(record) }))
      .filter((option) => !needle || option.label.toLowerCase().includes(needle));
  };
}
