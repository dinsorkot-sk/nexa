<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { computed, ref, watch } from 'vue';
import { inputKindOf } from '../lib/field-kinds';
import { parseNumberInput, stepFor } from '../lib/number';
import { datetimeLocalToIso, isoToDatetimeLocal } from '../lib/date';
import type { ComboboxOption, LoadOptions } from '../lib/combobox';
import { useNxMessages } from '../lib/locale';
import { isEditableField } from '../lib/format';
import NxCombobox from './NxCombobox.vue';
import NxDatePicker from './NxDatePicker.vue';
import NxFieldValue from './NxFieldValue.vue';
import NxFieldWrapper from './NxFieldWrapper.vue';
import NxInput from './NxInput.vue';
import NxSkeleton from './NxSkeleton.vue';
import NxSwitch from './NxSwitch.vue';
import NxTextarea from './NxTextarea.vue';

/**
 * Editor for one field, chosen by its type (see lib/field-kinds). It emits values the engine validator accepts:
 * an empty box emits `undefined`, a number is parsed to a number, a date is an ISO string, and a reference or a
 * multi-select emits ids. `reference` fields take `loadOptions` for server-side search; the component never calls an API.
 */
const props = withDefaults(defineProps<{
  field: FieldDefinition;
  modelValue?: unknown;
  id?: string;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  loadOptions?: LoadOptions;
  /** Labels for chosen references, so they show before a search has run. */
  selected?: ComboboxOption[];
}>(), {
  modelValue: undefined,
  id: undefined,
  error: undefined,
  disabled: false,
  loading: false,
  loadOptions: undefined,
  selected: () => [],
});

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();
const messages = useNxMessages();

const kind = computed(() => inputKindOf(props.field.type));
const fieldId = computed(() => props.id ?? `nx-field-${props.field.id}`);
const readOnly = computed(() => props.disabled || !isEditableField(props.field));
/** System-generated or hidden fields have no editor: the value is shown as text. */
const systemValue = computed(() => kind.value === 'readonly' || !isEditableField(props.field));
const hint = computed(() => props.field.options.helpText);
const precision = computed(() => (props.field.type === 'integer' ? 0 : props.field.options.precision));
const choices = computed<ComboboxOption[]>(() => props.field.options.choices ?? []);
const numericValue = computed(() => (typeof props.modelValue === 'number' ? String(props.modelValue) : ''));
const stringValue = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''));

// The JSON box keeps its own text so a half-typed document is not lost on each keystroke.
const jsonText = ref('');
const jsonError = ref(false);
watch(() => props.modelValue, (value) => {
  if (kind.value !== 'json') return;
  const next = value === undefined ? '' : JSON.stringify(value, null, 2);
  if (!jsonError.value) jsonText.value = next;
}, { immediate: true });

function emitString(raw: string) {
  emit('update:modelValue', raw === '' ? undefined : raw);
}

function onNumber(raw: string) {
  emit('update:modelValue', parseNumberInput(raw, precision.value));
}

function onDatetime(raw: string) {
  emit('update:modelValue', datetimeLocalToIso(raw));
}

function onJson(raw: string) {
  jsonText.value = raw;
  if (raw.trim() === '') {
    jsonError.value = false;
    emit('update:modelValue', undefined);
    return;
  }
  try {
    emit('update:modelValue', JSON.parse(raw));
    jsonError.value = false;
  } catch {
    jsonError.value = true;
  }
}

const jsonErrorText = computed(() => props.error ?? (jsonError.value ? messages.value.invalidJson : undefined));
const errorText = computed(() => props.error);
const linkNotice = computed(() => (props.field.type === 'file' || props.field.type === 'image' ? messages.value.urlOnly : undefined));
const inputType = computed(() => {
  switch (props.field.type) {
    case 'email': return 'email';
    case 'phone': return 'tel';
    case 'url':
    case 'file':
    case 'image': return 'url';
    case 'time': return 'time';
    case 'datetime': return 'datetime-local';
    default: return 'text';
  }
});
</script>

<template>
  <NxSkeleton
    v-if="loading"
    class="h-9 w-full"
  />

  <!-- Boolean: the switch carries its own label, so the wrapper label is not repeated. -->
  <div
    v-else-if="kind === 'boolean'"
    class="flex flex-col gap-1.5"
  >
    <NxSwitch
      :id="fieldId"
      :model-value="modelValue === true"
      :disabled="readOnly"
      @update:model-value="(value) => emit('update:modelValue', value)"
    >
      {{ field.label }}<span
        v-if="field.options.required"
        aria-hidden="true"
        class="ml-0.5 text-ui-error-text"
      >*</span>
    </NxSwitch>
    <p
      v-if="hint"
      class="text-xs text-ui-text-muted"
    >
      {{ hint }}
    </p>
    <p
      v-if="errorText"
      role="alert"
      class="text-xs text-ui-error-text"
    >
      {{ errorText }}
    </p>
  </div>

  <!-- Read-only system fields and file/image links that the viewer cannot edit. -->
  <NxFieldWrapper
    v-else-if="systemValue"
    :id="fieldId"
    :label="field.label"
    :hint="hint"
    :error="errorText"
  >
    <template #default>
      <div
        :id="fieldId"
        class="flex min-h-9 items-center rounded-ui border border-ui-border bg-ui-bg-muted px-3 text-sm text-ui-text-toned"
      >
        <NxFieldValue
          :field="field"
          :value="modelValue"
          display="detail"
        />
      </div>
    </template>
  </NxFieldWrapper>

  <NxFieldWrapper
    v-else
    :id="fieldId"
    :label="field.label"
    :required="field.options.required"
    :hint="linkNotice ?? hint"
    :error="kind === 'json' ? jsonErrorText : errorText"
  >
    <template #default="{ describedBy, invalid }">
      <NxTextarea
        v-if="kind === 'longText'"
        :id="fieldId"
        :model-value="stringValue"
        :disabled="readOnly"
        :invalid="invalid"
        :aria-describedby="describedBy"
        @update:model-value="emitString"
      />

      <NxTextarea
        v-else-if="kind === 'json'"
        :id="fieldId"
        :model-value="jsonText"
        :disabled="readOnly"
        :invalid="invalid || jsonError"
        class="font-mono text-xs"
        :aria-describedby="describedBy"
        @update:model-value="onJson"
      />

      <NxInput
        v-else-if="kind === 'number' || kind === 'integer' || kind === 'decimal' || kind === 'currency' || kind === 'percentage'"
        :id="fieldId"
        type="number"
        inputmode="decimal"
        :model-value="numericValue"
        :step="stepFor(precision)"
        :min="field.options.min"
        :max="field.options.max"
        :disabled="readOnly"
        :invalid="invalid"
        :aria-describedby="describedBy"
        @update:model-value="onNumber"
      />

      <NxInput
        v-else-if="kind === 'datetime'"
        :id="fieldId"
        type="datetime-local"
        :model-value="isoToDatetimeLocal(modelValue)"
        :disabled="readOnly"
        :invalid="invalid"
        :aria-describedby="describedBy"
        @update:model-value="onDatetime"
      />

      <NxDatePicker
        v-else-if="kind === 'date'"
        :id="fieldId"
        :label="field.label"
        :model-value="typeof modelValue === 'string' ? modelValue : undefined"
        :disabled="readOnly"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="(value) => emit('update:modelValue', value)"
      />

      <NxCombobox
        v-else-if="kind === 'select'"
        :id="fieldId"
        :label="field.label"
        :model-value="typeof modelValue === 'string' ? modelValue : undefined"
        :options="choices"
        :placeholder="messages.empty"
        :disabled="readOnly"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="(value) => emit('update:modelValue', value)"
      />

      <NxCombobox
        v-else-if="kind === 'multiSelect'"
        :id="fieldId"
        multiple
        :label="field.label"
        :model-value="Array.isArray(modelValue) ? modelValue as string[] : []"
        :options="choices"
        :disabled="readOnly"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="(value) => emit('update:modelValue', value)"
      />

      <NxCombobox
        v-else-if="kind === 'reference'"
        :id="fieldId"
        :label="field.label"
        :model-value="typeof modelValue === 'string' ? modelValue : undefined"
        :load-options="loadOptions"
        :selected="selected"
        :disabled="readOnly"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="(value) => emit('update:modelValue', value)"
      />

      <NxInput
        v-else
        :id="fieldId"
        :type="inputType"
        :model-value="stringValue"
        :disabled="readOnly"
        :invalid="invalid"
        :aria-describedby="describedBy"
        @update:model-value="emitString"
      />
    </template>
  </NxFieldWrapper>
</template>
