<template>
  <input
    v-bind="$attrs"
    :id="id"
    type="number"
    inputmode="decimal"
    :value="text"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    :class="cn('flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground tabular-nums placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', invalid && 'border-danger', props.class)"
    @input="onInput"
    @blur="onBlur"
  >
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cn } from '../cn';
import { formatDecimal, parseNumberInput, stepFor } from './number';

const props = withDefaults(defineProps<{
  modelValue?: number | null;
  min?: number;
  max?: number;
  /** Number of decimal places. 0 for integers. Leave unset for any precision. */
  precision?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  class?: string;
}>(), { modelValue: undefined, min: undefined, max: undefined, precision: undefined, disabled: false, invalid: false, id: undefined, describedBy: undefined, class: undefined });

defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ 'update:modelValue': [value: number | undefined] }>();

const step = computed(() => stepFor(props.precision));

/** What the box shows. While the user types it keeps their text, so a half-typed "-" or "1." is not wiped. */
const text = ref(formatDecimal(props.modelValue, props.precision));

// Follow outside changes (a reset, a reload) but never overwrite what the user is typing with an equal number.
watch(() => props.modelValue, (next) => {
  if (parseNumberInput(text.value, props.precision) !== (next ?? undefined)) text.value = formatDecimal(next, props.precision);
});

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  text.value = target.value;
  // An empty box, or one with only a partial entry such as "-", is "no value". It is never reported as 0 or NaN.
  emit('update:modelValue', parseNumberInput(target.value, props.precision));
}

function onBlur() {
  text.value = formatDecimal(parseNumberInput(text.value, props.precision), props.precision);
}
</script>
