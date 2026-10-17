<script setup lang="ts">
import NxSelect, { type NxSelectOption } from './NxSelect.vue';

defineProps<{
  modelValue: string;
  organizations: NxSelectOption[];
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [organizationId: string | undefined] }>();
</script>

<template>
  <label class="block min-w-0">
    <span class="sr-only">{{ label }}</span>
    <NxSelect
      :model-value="modelValue"
      :options="organizations"
      :disabled="disabled"
      :aria-label="label"
      class="max-w-64"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </label>
</template>
