<script setup lang="ts">
import { useId } from 'vue';
import { inputStyles } from '../lib/input';

withDefaults(defineProps<{
  modelValue?: string | number | null;
  id?: string;
  type?: string;
  size?: 'sm' | 'md';
  invalid?: boolean;
}>(), { modelValue: undefined, id: undefined, type: 'text', size: 'md', invalid: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const generatedId = useId();
</script>

<template>
  <input
    :id="id ?? generatedId"
    :type="type"
    :value="modelValue ?? ''"
    :aria-invalid="invalid || undefined"
    :class="inputStyles({ size, invalid })"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  >
</template>
