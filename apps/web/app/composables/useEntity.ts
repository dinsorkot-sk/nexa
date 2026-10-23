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

/**
 * Server-side search for a reference field.
 *
 * The list endpoint takes `?search=` but answers 400 unless the target entity has a searchable,
 * non-hidden field, so the loader reads the target's fields once (cached per loader) and sends the
 * search and the limit only when one exists. Without one it stays on the fallback: fetch one page
 * and narrow it by the label here. The context's signal rides along, so a superseded search aborts
 * the request the browser has already forgotten about.
 */
export function referenceLoader(moduleId: string, field: FieldDefinition) {
  let targetFields: Promise<FieldDefinition[]> | undefined;
  const searchTarget = async (target: string): Promise<boolean> => {
    try {
      targetFields ??= api<FieldDefinition[]>(`/modules/${moduleId}/fields?entityId=${target}`);
      const fields = await targetFields;
      return fields.some((candidate) => candidate.options.searchable && !candidate.options.hidden);
    } catch {
      // Without the target's fields there is no safe `?search=`: the fallback keeps working.
      targetFields = Promise.resolve([]);
      return false;
    }
  };
  return async (search: string, context: { limit: number; signal: AbortSignal }): Promise<Option[]> => {
    const target = field.options.referenceEntityId;
    if (!target) return [];
    const query = new URLSearchParams({ limit: String(context.limit) });
    if (await searchTarget(target)) query.set('search', search);
    const result = await api<{ items: RecordRow[] }>(`/modules/${moduleId}/entities/${target}/records?${query}`, { signal: context.signal });
    const needle = search.trim().toLowerCase();
    return result.items
      .map((record) => ({ value: record.id, label: recordLabel(record) }))
      .filter((option) => !needle || option.label.toLowerCase().includes(needle));
  };
}
