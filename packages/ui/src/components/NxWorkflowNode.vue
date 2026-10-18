<script setup lang="ts">
import { computed } from 'vue';

/**
 * One state of a linear, forward-only workflow, as the mockup's WorkflowNode section: a colour-coded dot with the
 * kind, the state name and its record count.
 */
const props = withDefaults(defineProps<{
  title: string;
  kind?: 'start' | 'step' | 'end';
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
}>(), {
  kind: 'step',
  meta: undefined,
  selected: false,
  disabled: false,
});

const emit = defineEmits<{ click: [] }>();

const dots: Record<'start' | 'step' | 'end', string> = {
  start: 'bg-ui-text-dimmed',
  step: 'bg-ui-primary',
  end: 'bg-ui-success',
};
const dotClass = computed(() => dots[props.kind]);
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-pressed="selected"
    :class="[
      'flex w-45 flex-col gap-1.5 rounded-ui-lg border bg-ui-bg px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
      selected ? 'border-ui-primary ring-1 ring-ui-primary' : 'border-ui-border-accented',
    ]"
    @click="emit('click')"
  >
    <span class="flex items-center gap-1.5">
      <span
        class="size-2 shrink-0 rounded-full"
        :class="dotClass"
        aria-hidden="true"
      />
      <span class="text-[11px] font-medium uppercase tracking-wide text-ui-text-muted">{{ kind }}</span>
    </span>
    <span class="text-sm font-medium text-ui-text-highlighted">{{ title }}</span>
    <span
      v-if="meta"
      class="text-xs text-ui-text-muted"
    >{{ meta }}</span>
    <slot />
  </button>
</template>
