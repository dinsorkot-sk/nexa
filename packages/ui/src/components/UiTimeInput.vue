<template>
  <input
    v-bind="$attrs"
    :id="id"
    type="time"
    :value="modelValue ?? ''"
    :step="withSeconds ? 1 : 60"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    :class="cn('flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', invalid && 'border-danger', props.class)"
    @input="onInput"
  >
</template>

<script setup lang="ts">
import { cn } from '../cn';
import { timeOfDay } from './date';

const props = withDefaults(defineProps<{
  /** A time of day, `HH:mm` or `HH:mm:ss`. It has no date and no timezone. */
  modelValue?: string | null;
  withSeconds?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  class?: string;
}>(), { modelValue: undefined, withSeconds: false, disabled: false, invalid: false, id: undefined, describedBy: undefined, class: undefined });

defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', timeOfDay.test(value) ? value : undefined);
}
</script>
