<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
}>(), {
  max: 100,
  showValue: false,
});

const maxValue = computed(() => (Number.isFinite(props.max) && props.max > 0 ? props.max : 1));
const safeValue = computed(() => (Number.isFinite(props.value) ? Math.min(Math.max(props.value, 0), maxValue.value) : 0));
const percentage = computed(() => {
  if (!Number.isFinite(props.value) || !Number.isFinite(props.max) || props.max <= 0) return 0;
  return (safeValue.value / maxValue.value) * 100;
});
</script>

<template>
  <div>
    <div
      v-if="showValue"
      class="mb-1 flex justify-between gap-2 text-xs text-ui-text-muted"
    >
      <span>{{ label }}</span>
      <span>{{ Math.round(percentage) }}%</span>
    </div>
    <div
      role="progressbar"
      :aria-label="label"
      :aria-valuemin="0"
      :aria-valuemax="maxValue"
      :aria-valuenow="safeValue"
      class="h-2 overflow-hidden rounded-full bg-ui-bg-accented"
    >
      <div
        class="h-full rounded-full bg-ui-primary transition-[width]"
        :style="{ width: `${percentage}%` }"
      />
    </div>
  </div>
</template>
