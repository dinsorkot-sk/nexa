<template>
  <form
    :class="cn('grid gap-6', props.class)"
    :aria-busy="submitting || undefined"
    novalidate
    @submit.prevent="onSubmit"
  >
    <section
      v-for="section in sections"
      :key="section.id"
      class="grid gap-4"
    >
      <h3 class="text-sm font-semibold text-foreground">
        {{ section.label }}
      </h3>
      <div
        class="grid gap-4"
        :style="{ gridTemplateColumns: `repeat(${sectionColumnCount(section)}, minmax(0, 1fr))` }"
      >
        <UiFieldWrapper
          v-for="entry in section.fields"
          :id="`${formId}-${entry.field.id}`"
          :key="entry.field.id"
          :label="entry.field.label"
          :required="isRequirement(entry.field)"
          :help-text="helpText(entry.field)"
          :error="fieldError(entry.field.id)"
        >
          <template #default="{ id, describedBy, invalid }">
            <MetaFieldInput
              :id="id"
              :field="entry.field"
              :model-value="draft[entry.field.id]"
              :load-reference-options="loadReferenceOptions"
              :reference-selected="referenceSelected?.(entry.field.id)"
              :invalid="invalid || Boolean(fieldError(entry.field.id))"
              :described-by="describedBy"
              @update:model-value="setDraft(entry.field.id, $event)"
            />
          </template>
        </UiFieldWrapper>
      </div>
    </section>

    <p
      v-if="formError"
      role="alert"
      class="text-sm font-medium text-danger-soft-foreground"
    >
      {{ formError }}
    </p>

    <div
      v-if="!readonly"
      class="flex items-center gap-2"
    >
      <UiButton
        type="submit"
        :loading="submitting"
        :disabled="submitting"
      >
        {{ submitLabel }}
      </UiButton>
      <UiButton
        v-if="cancel"
        type="button"
        variant="secondary"
        :disabled="submitting"
        @click="cancel"
      >
        {{ t('form.cancel') }}
      </UiButton>
    </div>
    <p
      v-else
      class="text-sm text-foreground-muted"
    >
      {{ t('form.readonly') }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldDefinition, FormDefinition } from '@nexa/meta';
import { cn } from '../cn';
import MetaFieldInput from './MetaFieldInput.vue';
import UiButton from './UiButton.vue';
import UiFieldWrapper from './UiFieldWrapper.vue';
import { formSections, type MetaFormFieldErrors, type MetaReferenceLabel, type ReferenceSelectedResolver } from './form';
import type { LoadOptions } from './combobox';

/**
 * Metadata-driven form. Renders the FormDefinition's sections and fields; the draft lives here,
 * but every write goes through the caller: `submit` receives the data payload for the records API
 * (`{ data, version? }` minus version — the caller attaches it) and decides success or failure.
 * Field errors and the form error come back in via props, so the server stays the sole validator.
 */
const props = withDefaults(defineProps<{
  form: FormDefinition;
  /** The entity's full field list; sections reference fields by id. */
  fields: FieldDefinition[];
  /** Existing record values for update, or the create defaults. */
  initialData?: Record<string, unknown>;
  /** Current record version; the caller includes it in the update request for optimistic concurrency. */
  version?: number;
  /** Server-reported errors keyed by field id. */
  fieldErrors?: MetaFormFieldErrors;
  /** Form-level error text (conflict, unique violation, anything not one field's fault). */
  formError?: string | null;
  /** False renders every input disabled and hides the submit button (viewer role). */
  readonly?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancel?: () => void;
  loadReferenceOptions?: LoadOptions;
  /** Stored reference ids to labels, keyed by field id. */
  referenceSelected?: ReferenceSelectedResolver;
  referenceLabel?: MetaReferenceLabel;
  currency?: string;
  class?: string;
}>(), {
  fieldErrors: () => ({}),
  formError: null,
  readonly: false,
  submitting: false,
});

const emit = defineEmits<{
  /** The caller posts this to the records API and reports the outcome through props. */
  submit: [payload: { data: Record<string, unknown>; version?: number }];
}>();

const { t } = useI18n();
const formId = useId();

const sections = computed(() => formSections(props.form, props.fields));

/** The draft starts from the caller's data; fields removed from the form keep their stored value out of the payload. */
const draft = ref<Record<string, unknown>>({ ...(props.initialData ?? {}) });
const touched = ref<Set<string>>(new Set());

function setDraft(fieldId: string, value: unknown): void {
  draft.value[fieldId] = value;
  touched.value.add(fieldId);
}

function isRequirement(field: FieldDefinition): boolean {
  return Boolean(field.options.required) && !field.options.readonly;
}

function helpText(field: FieldDefinition): string | undefined {
  if (['formula', 'computed'].includes(field.type)) return t('field.computed');
  return undefined;
}

function fieldError(fieldId: string): string | undefined {
  return props.fieldErrors[fieldId];
}

function sectionColumnCount(section: { fields: unknown[] } & { columns?: number }): number {
  return Math.min(Math.max(section.fields.length, 1), 4);
}

const submitLabel = computed(() => props.submitLabel ?? t('form.save'));

function onSubmit(): void {
  if (props.readonly || props.submitting) return;
  // Only fields on the form are submitted; untouched values pass through so an update
  // does not silently clear data that the form did not show.
  const data: Record<string, unknown> = {};
  for (const section of sections.value) {
    for (const { field } of section.fields) {
      const value = draft.value[field.id];
      data[field.id] = value === undefined ? null : value;
    }
  }
  const payload: { data: Record<string, unknown>; version?: number } = { data };
  if (props.version !== undefined) payload.version = props.version;
  emit('submit', payload);
}
</script>
