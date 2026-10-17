<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: boolean;
  label: string;
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <label class="inline-flex items-center justify-center">
    <input
      type="checkbox"
      :checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      class="size-4 rounded border-ui-border-accented accent-ui-primary focus-visible:ring-2 focus-visible:ring-ui-primary disabled:opacity-50"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
  </label>
</template>
