<script setup lang="ts">
import { Lock } from 'lucide-vue-next';

/**
 * Cell of the permission matrix, as the mockup's PermissionCell section: allowed is a check, a cell that can be
 * switched off is a checkbox, and a locked cell is default-deny and cannot be changed by the role.
 */
withDefaults(defineProps<{
  modelValue: boolean;
  label: string;
  locked?: boolean;
  disabled?: boolean;
}>(), { locked: false, disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <label class="inline-flex items-center justify-center">
    <template v-if="locked">
      <span class="inline-flex size-4 items-center justify-center">
        <Lock
          class="size-4 text-ui-text-muted"
          aria-hidden="true"
        />
      </span>
      <span class="sr-only">{{ label }}</span>
    </template>
    <input
      v-else
      type="checkbox"
      :checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      class="size-4 rounded-ui-sm border-ui-border-accented accent-ui-primary outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
  </label>
</template>
