<template>
  <input
    v-bind="$attrs"
    :id="id"
    type="datetime-local"
    :value="local"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    :class="cn('flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', invalid && 'border-danger', props.class)"
    @input="onInput"
  >
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';
import { datetimeLocalToIso, isoToDatetimeLocal } from './date';

const props = withDefaults(defineProps<{
  /** An instant as an ISO string. It is shown in the user's local time and stored as UTC. */
  modelValue?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  class?: string;
}>(), { modelValue: undefined, disabled: false, invalid: false, id: undefined, describedBy: undefined, class: undefined });

defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();

const local = computed(() => isoToDatetimeLocal(props.modelValue));

function onInput(event: Event) {
  emit('update:modelValue', datetimeLocalToIso((event.target as HTMLInputElement).value));
}
</script>
