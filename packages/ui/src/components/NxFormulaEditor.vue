<script setup lang="ts">
import { useId } from 'vue';

withDefaults(defineProps<{
  modelValue: string;
  label: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  rows?: number;
}>(), {
  error: undefined,
  hint: undefined,
  disabled: false,
  rows: 6,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const id = `nx-formula-${useId()}`;
</script>

<template>
  <div class="space-y-1.5">
    <label
      :for="id"
      class="block text-sm font-medium text-ui-text-highlighted"
    >{{ label }}</label>
    <textarea
      :id="id"
      :value="modelValue"
      :rows="rows"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
      class="w-full rounded-ui border bg-ui-bg px-3 py-2 font-mono text-sm text-ui-text outline-none placeholder:text-ui-text-muted focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:bg-ui-bg-muted"
      :class="error ? 'border-ui-error' : 'border-ui-border-accented'"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p
      v-if="error"
      :id="`${id}-error`"
      role="alert"
      class="text-xs text-ui-error-text"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="`${id}-hint`"
      class="text-xs text-ui-text-muted"
    >
      {{ hint }}
    </p>
  </div>
</template>
