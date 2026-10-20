<script setup lang="ts">
import { computed, useId } from 'vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { fieldArea, fieldStyles } from '../lib/input';

/** Multi-line text field. Three Variants and three Sizes, as the mockup's Textarea section. */
const props = withDefaults(defineProps<{
  modelValue?: string | null;
  id?: string;
  rows?: number;
  variant?: 'outline' | 'soft' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
}>(), {
  modelValue: undefined,
  id: undefined,
  rows: 3,
  variant: 'outline',
  size: 'md',
  invalid: false,
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const generatedId = useId();

const ui = computed(() => ({
  root: 'relative flex w-full items-center',
  base: `${fieldStyles({ variant: props.variant, size: props.size, invalid: props.invalid })} ${fieldArea[props.size]}`,
}));
</script>

<template>
  <UTextarea
    :id="id ?? generatedId"
    :rows="rows"
    :model-value="modelValue ?? ''"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :ui="ui"
    @update:model-value="(value) => emit('update:modelValue', value)"
  />
</template>
