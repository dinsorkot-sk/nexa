<script setup lang="ts">
import { computed } from 'vue';
import UProgress from '@nuxt/ui/components/Progress.vue';

const props = withDefaults(defineProps<{
  value: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
  showValue?: boolean;
}>(), {
  max: 100,
  size: 'md',
  showValue: false,
});

/** The mockup's Progress section: a 4px bar at sm and 8px at md. */
const trackSize: Record<'sm' | 'md', string> = { sm: 'h-1', md: 'h-2' };

const maxValue = computed(() => (Number.isFinite(props.max) && props.max > 0 ? props.max : 1));
const safeValue = computed(() => (Number.isFinite(props.value) ? Math.min(Math.max(props.value, 0), maxValue.value) : 0));
const percentage = computed(() => {
  if (!Number.isFinite(props.value) || !Number.isFinite(props.max) || props.max <= 0) return 0;
  return (safeValue.value / maxValue.value) * 100;
});

const ui = computed(() => ({
  root: 'gap-2',
  base: `relative overflow-hidden rounded-full bg-ui-bg-accented ${trackSize[props.size]}`,
  // The bar grows by a transform, so the duration comes from the motion tokens like the rest of the library.
  indicator: 'rounded-full size-full bg-ui-primary transition-transform duration-ui-slow ease-ui-out',
  status: () => '',
}));
</script>

<template>
  <UProgress
    :model-value="safeValue"
    :max="maxValue"
    :get-value-label="() => label"
    :ui="ui"
  >
    <template
      v-if="showValue"
      #status
    >
      <div class="mb-1 flex justify-between gap-2 text-xs text-ui-text-muted">
        <span>{{ label }}</span>
        <span>{{ Math.round(percentage) }}%</span>
      </div>
    </template>
  </UProgress>
</template>
