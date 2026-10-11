<template>
  <UiCheckbox
    v-if="kind === 'boolean'"
    :id="id"
    :model-value="modelValue === true"
    :disabled="!editable"
    :aria-label="field.label"
    :aria-describedby="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiTextarea
    v-else-if="kind === 'longText'"
    :id="id"
    :model-value="asString"
    :disabled="!editable"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    rows="3"
    @update:model-value="emitText"
  />
  <div
    v-else-if="kind === 'json'"
    class="grid gap-1.5"
  >
    <UiTextarea
      :id="id"
      :model-value="jsonText"
      :disabled="!editable"
      :aria-invalid="jsonError || invalid || undefined"
      :aria-describedby="describedBy"
      class="font-mono"
      rows="5"
      spellcheck="false"
      @update:model-value="onJson"
    />
    <p
      v-if="jsonError"
      role="alert"
      class="text-xs text-danger-soft-foreground"
    >
      {{ t('json.invalid') }}
    </p>
  </div>
  <UiNumberInput
    v-else-if="isNumeric"
    :id="id"
    :model-value="asNumber"
    :min="field.options.min"
    :max="field.options.max"
    :precision="precision"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiDatePicker
    v-else-if="kind === 'date'"
    :model-value="asString || undefined"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiDateTimeInput
    v-else-if="kind === 'datetime'"
    :id="id"
    :model-value="asString || undefined"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiTimeInput
    v-else-if="kind === 'time'"
    :id="id"
    :model-value="asString || undefined"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiSelect
    v-else-if="kind === 'select'"
    :id="id"
    :model-value="asString"
    :disabled="!editable"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    @update:model-value="emit('update:modelValue', $event === '' ? undefined : $event)"
  >
    <option value="" />
    <option
      v-for="choice in field.options.choices ?? []"
      :key="choice.value"
      :value="choice.value"
    >
      {{ choice.label }}
    </option>
  </UiSelect>
  <UiCombobox
    v-else-if="kind === 'multiSelect'"
    :id="id"
    multiple
    :model-value="asStringArray"
    :selected="staticChoices"
    :load-options="searchChoices"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiCombobox
    v-else-if="kind === 'reference'"
    :id="id"
    :model-value="asString || undefined"
    :selected="referenceSelected ?? []"
    :load-options="loadReferenceOptions ?? noOptions"
    :disabled="!editable || !loadReferenceOptions"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <UiLinkField
    v-else-if="kind === 'link'"
    :id="id"
    :kind="field.type === 'image' ? 'image' : 'file'"
    :model-value="asString || undefined"
    :disabled="!editable"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <p
    v-else-if="kind === 'readonly'"
    :id="id"
    class="flex h-10 items-center rounded-md border border-border bg-surface-muted px-3 text-sm text-foreground-muted"
  >
    {{ t('field.computed') }}
  </p>
  <UiInput
    v-else
    :id="id"
    :type="textInputType"
    :inputmode="textInputMode"
    :model-value="asString"
    :disabled="!editable"
    :maxlength="field.options.regex ? undefined : 2000"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    @update:model-value="emitText"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldDefinition } from '@nexa/meta';
import { isEditableField } from '../render/format';
import { inputKindOf } from '../render/field-kinds';
import type { ComboboxOption, LoadOptions } from './combobox';
import UiCheckbox from './UiCheckbox.vue';
import UiCombobox from './UiCombobox.vue';
import UiDatePicker from './UiDatePicker.vue';
import UiDateTimeInput from './UiDateTimeInput.vue';
import UiInput from './UiInput.vue';
import UiLinkField from './UiLinkField.vue';
import UiNumberInput from './UiNumberInput.vue';
import UiSelect from './UiSelect.vue';
import UiTextarea from './UiTextarea.vue';
import UiTimeInput from './UiTimeInput.vue';

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  /** Server-side search for `reference` fields. The app supplies it; this package never calls an API. */
  loadReferenceOptions?: LoadOptions;
  /** Labels for the reference ids already stored, so they show as names before any search. */
  referenceSelected?: ComboboxOption[];
  /** Set when the server rejected this field's value. */
  invalid?: boolean;
  /** Id of the element describing this field, usually the help or error text. */
  describedBy?: string;
  id?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();
const { t } = useI18n();

const kind = computed(() => inputKindOf(props.field.type));
const editable = computed(() => isEditableField(props.field));
const isNumeric = computed(() => ['number', 'integer', 'decimal', 'currency', 'percentage'].includes(kind.value));
/** integer has no decimals, currency defaults to 2, the rest follow the field's own precision. */
const precision = computed(() => {
  if (kind.value === 'integer') return 0;
  if (kind.value === 'currency') return props.field.options.precision ?? 2;
  return props.field.options.precision;
});

const asString = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''));
const asNumber = computed(() => (typeof props.modelValue === 'number' && Number.isFinite(props.modelValue) ? props.modelValue : undefined));
const asStringArray = computed(() => (Array.isArray(props.modelValue) ? props.modelValue.filter((v): v is string => typeof v === 'string') : []));

/** An empty box means "no value", which is how an optional field is cleared. It is never sent as an empty string. */
function emitText(value: string | number) {
  const text = String(value);
  emit('update:modelValue', text === '' ? undefined : text);
}

const textInputType = computed(() => ({ email: 'email', phone: 'tel', url: 'url' } as Record<string, string>)[kind.value] ?? 'text');
const textInputMode = computed(() => ({ email: 'email', phone: 'tel', url: 'url' } as Record<string, string>)[kind.value]);

// multiSelect: the choices are fixed in the field definition, so the "server" is the definition itself.
const staticChoices = computed<ComboboxOption[]>(() => props.field.options.choices ?? []);
const searchChoices: LoadOptions = async (search) => {
  const term = search.trim().toLowerCase();
  return staticChoices.value.filter((choice) => choice.label.toLowerCase().includes(term));
};
const noOptions: LoadOptions = async () => [];

// json: keep the user's text, report a parse error, and only emit a value that parses.
const jsonText = ref(props.modelValue === undefined || props.modelValue === null ? '' : JSON.stringify(props.modelValue, null, 2));
const jsonError = ref(false);
watch(() => props.modelValue, (next) => {
  const parsed = safeParse(jsonText.value);
  if (JSON.stringify(parsed.ok ? parsed.value : undefined) !== JSON.stringify(next)) {
    jsonText.value = next === undefined || next === null ? '' : JSON.stringify(next, null, 2);
    jsonError.value = false;
  }
});

function safeParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
}

function onJson(text: string) {
  jsonText.value = text;
  if (text.trim() === '') {
    jsonError.value = false;
    emit('update:modelValue', undefined);
    return;
  }
  const parsed = safeParse(text);
  // The engine accepts an object or an array for json fields, so a bare string or number is refused here too.
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
    jsonError.value = true;
    return;
  }
  jsonError.value = false;
  emit('update:modelValue', parsed.value);
}
</script>
