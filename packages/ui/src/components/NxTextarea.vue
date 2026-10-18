<script setup lang="ts">
import { useId } from 'vue';
import { fieldArea, fieldStyles } from '../lib/input';

/** Multi-line text field. Three Variants and three Sizes, as the mockup's Textarea section. */
withDefaults(defineProps<{
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
</script>

<template>
  <textarea
    :id="id ?? generatedId"
    :rows="rows"
    :value="modelValue ?? ''"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :class="[fieldStyles({ variant, size, invalid }), fieldArea[size]]"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
