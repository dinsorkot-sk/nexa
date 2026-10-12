import type { FormDefinition, FieldDefinition } from '@nexa/meta';
import type { MetaReferenceLabel } from './table';
import type { ComboboxOption } from './combobox';

/**
 * One validation error the API reported for a field, keyed by field id, as the caller derives it
 * from the API's 400 response. The form shows it under that field.
 */
export type MetaFormFieldErrors = Record<string, string>;

/**
 * Props shared by MetaForm and MetaDetail so both render the same field subset in the same order.
 */
export interface MetaSectionView {
  id: string;
  label: string;
  /** Authored section column count (1–4), from the FormDefinition. */
  columns: number;
  /** Fields of this section, in order, already filtered to what this user may see. */
  fields: Array<{ field: FieldDefinition }>;
}

/**
 * Derives the section view from a FormDefinition and the entity's fields. Fields that no longer
 * exist are skipped (a form can outlive a field); hidden fields are skipped because the server
 * redacts them anyway. Formulas, computed and autoNumber fields render read-only.
 */
export function formSections(form: FormDefinition, fields: FieldDefinition[]): MetaSectionView[] {
  const byId = new Map(fields.map((field) => [field.id, field]));
  return form.sections.map((section) => ({
    id: section.id,
    label: section.label,
    columns: section.columns,
    fields: section.fieldIds
      .map((fieldId) => byId.get(fieldId))
      .filter((field): field is FieldDefinition => Boolean(field) && !field!.options.hidden)
      .map((field) => ({ field })),
  }));
}

/** Stored reference ids to labels for one reference field, keyed by field id in the prop. */
export type ReferenceSelectedResolver = (fieldRecordId: string) => ComboboxOption[] | undefined;

/** Opens a related record. The caller decides what opening means. */
export type RelationOpen = (targetRecordId: string) => void;

/** Re-export so apps/web imports one shape for both props. */
export type { MetaReferenceLabel };
