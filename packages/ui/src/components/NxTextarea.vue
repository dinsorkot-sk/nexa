<script setup lang="ts">
import { useId } from 'vue';
import { inputStyles } from '../lib/input';

withDefaults(defineProps<{
  modelValue?: string | null;
  id?: string;
  rows?: number;
  invalid?: boolean;
}>(), { modelValue: undefined, id: undefined, rows: 3, invalid: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const generatedId = useId();
</script>

<template>
  <textarea
    :id="id ?? generatedId"
    :rows="rows"
    :value="modelValue ?? ''"
    :aria-invalid="invalid || undefined"
    :class="inputStyles({ invalid }) + ' min-h-20 py-2'"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
