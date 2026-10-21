<script setup lang="ts">
import type { FieldDefinition, FormDefinition } from '@nexa/meta';
import { computed, ref, watch } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxButton from './NxButton.vue';
import NxFieldInput from './NxFieldInput.vue';

/**
 * Renders a form's sections over the fields of an entity.
 *
 * The form says which fields sit in which section and how many columns a section has; the fields say how a value
 * is edited. The component never fetches: it emits the values as they change and the values on submit.
 */
const props = withDefaults(defineProps<{
  /** The form being rendered. Its sections decide the order and the layout. */
  form?: FormDefinition;
  /** The fields of the entity the form belongs to. */
  fields: FieldDefinition[];
  /** The values, keyed by field id. */
  values?: Record<string, unknown>;
  /** Whether the form creates a record or edits one. */
  mode?: 'create' | 'edit';
  submitting?: boolean;
  /** The error to show above the form. */
  error?: string;
  /** The label of the submit button. */
  submitLabel?: string;
  /** The label of the cancel button. The button is not shown without one. */
  cancelLabel?: string;
  /** The fields that cannot be edited, by field id. */
  readonlyFieldIds?: string[];
}>(), {
  form: undefined,
  values: () => ({}),
  mode: 'create',
  submitting: false,
  error: undefined,
  submitLabel: undefined,
  cancelLabel: undefined,
  readonlyFieldIds: () => [],
});

const emit = defineEmits<{
  'update:values': [values: Record<string, unknown>];
  submit: [values: Record<string, unknown>];
  cancel: [];
}>();

const messages = useNxMessages();
const current = ref<Record<string, unknown>>({ ...props.values });

watch(() => props.values, (values) => {
  current.value = { ...values };
}, { deep: true });

/** The form's sections, in order, each with the fields it names. */
const sections = computed(() => (props.form?.sections ?? []).map((section) => ({
  ...section,
  fields: section.fieldIds
    .map((fieldId) => props.fields.find((field) => field.id === fieldId))
    .filter((field): field is FieldDefinition => field !== undefined),
})));

const formId = computed(() => props.form?.id ?? 'form');

function setValue(fieldId: string, value: unknown) {
  current.value = { ...current.value, [fieldId]: value };
  emit('update:values', current.value);
}

function onSubmit() {
  emit('submit', current.value);
}
</script>

<template>
  <form
    class="flex w-full flex-col gap-6"
    @submit.prevent="onSubmit"
  >
    <p
      v-if="props.error"
      role="alert"
      class="rounded-ui-lg border border-ui-error bg-ui-error-soft px-4 py-3 text-sm text-ui-error-text"
    >
      {{ props.error }}
    </p>

    <section
      v-for="section in sections"
      :key="section.id"
      class="flex flex-col gap-3"
    >
      <h3
        v-if="section.label"
        class="text-sm font-semibold text-ui-text-highlighted"
      >
        {{ section.label }}
      </h3>
      <div
        class="grid gap-4"
        :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }"
      >
        <NxFieldInput
          v-for="field in section.fields"
          :id="`${formId}-${field.id}`"
          :key="field.id"
          :field="field"
          :model-value="current[field.id]"
          :disabled="props.submitting || props.readonlyFieldIds.includes(field.id)"
          @update:model-value="(value) => setValue(field.id, value)"
        />
      </div>
    </section>

    <div class="flex items-center justify-end gap-2 border-t border-ui-border pt-4">
      <NxButton
        v-if="props.cancelLabel"
        variant="ghost"
        :disabled="props.submitting"
        @click="emit('cancel')"
      >
        {{ props.cancelLabel }}
      </NxButton>
      <NxButton
        type="submit"
        :loading="props.submitting"
      >
        {{ props.submitLabel ?? messages.save }}
      </NxButton>
    </div>
  </form>
</template>
