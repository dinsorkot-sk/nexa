<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { computed } from 'vue';
import NxBadge from './NxBadge.vue';

/**
 * Forward transition between two states, as the mockup's WorkflowEdge section: a line and an arrow, with the role
 * badge when the transition is guarded.
 */
const props = withDefaults(defineProps<{
  label?: string;
  /** Role guard: shown as a badge, meaning only that role may run the transition. */
  guard?: string;
  direction?: 'vertical' | 'horizontal';
}>(), {
  label: undefined,
  guard: undefined,
  direction: 'horizontal',
});

const vertical = computed(() => props.direction === 'vertical');
</script>

<template>
  <div
    :class="[
      'flex items-center justify-center gap-1.5 text-xs text-ui-text-muted',
      vertical ? 'h-12 flex-col' : 'w-35 flex-row',
    ]"
    role="img"
    :aria-label="label ?? guard ?? 'Workflow transition'"
  >
    <div
      aria-hidden="true"
      :class="vertical ? 'h-full w-0.5 bg-ui-border-accented' : 'h-0.5 w-full bg-ui-border-accented'"
    />
    <ArrowRight
      class="size-4 shrink-0 text-ui-text-muted"
      :class="vertical && 'rotate-90'"
      aria-hidden="true"
    />
    <NxBadge
      v-if="guard"
      color="neutral"
      variant="outline"
      size="sm"
    >
      {{ guard }}
    </NxBadge>
    <span
      v-else-if="label"
      class="shrink-0 rounded-ui-xs bg-ui-bg px-1"
    >{{ label }}</span>
  </div>
</template>
