<script setup lang="ts">
import { computed } from 'vue';

/**
 * Label, hint and error around a control. The slot receives `describedBy` (ids of the hint and error, for
 * aria-describedby) and `invalid` (for aria-invalid) so the control is linked to both.
 */
const props = withDefaults(defineProps<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
}>(), { required: false, hint: undefined, error: undefined });

const describedBy = computed(() => {
  const ids = [props.hint ? `${props.id}-hint` : '', props.error ? `${props.id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-sm font-medium text-ui-text-highlighted"
    >
      {{ label }}<span
        v-if="required"
        aria-hidden="true"
        class="ml-0.5 text-ui-error-text"
      >*</span>
    </label>
    <slot
      :described-by="describedBy"
      :invalid="!!error"
    />
    <p
      v-if="hint"
      :id="`${id}-hint`"
      class="text-xs text-ui-text-muted"
    >
      {{ hint }}
    </p>
    <p
      v-if="error"
      :id="`${id}-error`"
      role="alert"
      class="text-xs text-ui-error-text"
    >
      {{ error }}
    </p>
  </div>
</template>
