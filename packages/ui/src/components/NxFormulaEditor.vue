<script setup lang="ts">
import { computed, useId } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxBadge from './NxBadge.vue';

/**
 * The mockup's FormulaEditor section: a bordered panel with a status badge, a mono editor with line numbers and a
 * footer for the validation message. Cycles are rejected at definition time, so the engine message is shown as-is.
 */
const props = withDefaults(defineProps<{
  modelValue: string;
  label: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}>(), {
  error: undefined,
  hint: undefined,
  placeholder: undefined,
  disabled: false,
  rows: 4,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const messages = useNxMessages();
const id = `nx-formula-${useId()}`;

const invalid = computed(() => Boolean(props.error));
const state = computed(() => (invalid.value ? 'error' : props.modelValue.trim() === '' ? 'empty' : 'valid'));
const badgeColor = computed(() => ({ error: 'error', empty: 'neutral', valid: 'success' }[state.value] as 'error' | 'neutral' | 'success'));
const badgeLabel = computed(() => ({ error: messages.value.statusError, empty: messages.value.statusEmpty, valid: messages.value.statusValid }[state.value]));
const footer = computed(() => props.error ?? props.hint);
const lineCount = computed(() => Math.max(props.rows, props.modelValue.split('\n').length));
</script>

<template>
  <div
    class="overflow-hidden rounded-ui-lg border bg-ui-bg"
    :class="invalid ? 'border-ui-error' : 'border-ui-border'"
  >
    <div class="flex items-center gap-2 border-b border-ui-border bg-ui-bg-muted px-4 py-2.5">
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-ui-text-highlighted">{{ label }}</span>
      <NxBadge
        :color="badgeColor"
        variant="soft"
        size="sm"
        dot
      >
        {{ badgeLabel }}
      </NxBadge>
    </div>
    <div class="flex gap-3 px-4 py-3">
      <div
        aria-hidden="true"
        class="flex select-none flex-col text-right font-mono text-xs leading-5 text-ui-text-dimmed"
      >
        <span
          v-for="n in lineCount"
          :key="n"
        >{{ n }}</span>
      </div>
      <textarea
        :id="id"
        :value="modelValue"
        :rows="rows"
        :disabled="disabled"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-describedby="footer ? `${id}-message` : undefined"
        spellcheck="false"
        class="w-full resize-none bg-transparent font-mono text-[13px] leading-5 text-ui-text-highlighted outline-none placeholder:text-ui-text-dimmed disabled:cursor-not-allowed"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
    <div
      v-if="footer"
      :id="`${id}-message`"
      :role="invalid ? 'alert' : undefined"
      class="border-t border-ui-border px-4 py-2 text-xs"
      :class="invalid ? 'text-ui-error-text' : 'text-ui-text-muted'"
    >
      {{ footer }}
    </div>
  </div>
</template>
