<template>
  <CheckboxRoot
    :checked="modelValue"
    :disabled="disabled"
    :class="cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary', props.class)"
    v-bind="$attrs"
    @update:checked="(value: boolean | 'indeterminate') => $emit('update:modelValue', value === true)"
  >
    <CheckboxIndicator class="text-sm leading-none">
      <span
        v-if="modelValue === 'indeterminate'"
        aria-hidden="true"
      >−</span>
      <span
        v-else
        aria-hidden="true"
      >✓</span>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>

<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'radix-vue';
import { cn } from '../cn';

const props = defineProps<{ modelValue?: boolean | 'indeterminate'; disabled?: boolean; class?: string }>();
defineOptions({ inheritAttrs: false });
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>
