<script setup lang="ts">
import { computed } from 'vue';
import type { FieldDefinition } from '@nexa/meta';
import { isEditableField } from '../render/format';
import UiInput from './UiInput.vue';
import UiSelect from './UiSelect.vue';
import UiTextarea from './UiTextarea.vue';

const NUMERIC_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  /** Options for reference fields: record id → display label, supplied by the caller. */
  referenceOptions?: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();

const editable = computed(() => isEditableField(props.field));
const isLongText = computed(() => props.field.type === 'longText' || props.field.type === 'json');
const isBoolean = computed(() => props.field.type === 'boolean');
const isChoice = computed(() => props.field.type === 'select' || props.field.type === 'reference');
const choices = computed(() => {
  if (props.field.type === 'select') return props.field.options.choices ?? [];
  if (props.field.type === 'reference') return props.referenceOptions ?? [];
  return [];
});
const inputType = computed(() => {
  if (props.field.type === 'date') return 'date';
  if (props.field.type === 'datetime') return 'datetime-local';
  if (props.field.type === 'time') return 'time';
  return NUMERIC_TYPES.has(props.field.type) ? 'number' : 'text';
});

function emitValue(raw: string) {
  if (NUMERIC_TYPES.has(props.field.type)) emit('update:modelValue', raw === '' ? undefined : Number(raw));
  else emit('update:modelValue', raw);
}

function onCheckbox(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <input
    v-if="isBoolean"
    type="checkbox"
    class="h-4 w-4 rounded border-slate-700 bg-slate-900"
    :checked="modelValue === true || modelValue === 'true'"
    :disabled="!editable"
    :aria-label="field.label || field.name || field.id"
    @change="onCheckbox"
  >
  <UiTextarea
    v-else-if="isLongText"
    :model-value="String(modelValue ?? '')"
    :disabled="!editable"
    rows="3"
    @update:model-value="emitValue"
  />
  <UiSelect
    v-else-if="isChoice && editable"
    :model-value="String(modelValue ?? '')"
    @update:model-value="emitValue"
  >
    <option value="" />
    <option v-for="choice in choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
  </UiSelect>
  <UiInput
    v-else
    :model-value="String(modelValue ?? '')"
    :type="inputType"
    :disabled="!editable"
    @update:model-value="emitValue"
  />
</template>
