<script setup lang="ts">
import { computed } from 'vue';
import NxChartLegend, { type NxChartLegendItem } from './NxChartLegend.vue';

export interface NxDonutSegment extends NxChartLegendItem {
  value: number;
}

const props = withDefaults(defineProps<{
  segments: NxDonutSegment[];
  label: string;
  size?: number;
  thickness?: number;
}>(), {
  size: 180,
  thickness: 24,
});

const colors = ['text-ui-primary', 'text-ui-info', 'text-ui-warning', 'text-ui-success'];
const segments = computed(() => {
  const total = props.segments.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let offset = 0;
  return props.segments.map((item, index) => {
    const fraction = total > 0 ? Math.max(0, item.value) / total : 0;
    const start = offset;
    offset += fraction;
    return { ...item, fraction, start, color: colors[index % colors.length] };
  });
});
const radius = computed(() => (props.size - props.thickness) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <svg
      role="img"
      :aria-label="label"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="-rotate-90"
    >
      <circle
        class="stroke-ui-bg-accented"
        fill="none"
        stroke="currentColor"
        :stroke-width="thickness"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
      />
      <circle
        v-for="segment in segments"
        :key="segment.label"
        fill="none"
        stroke="currentColor"
        :stroke-width="thickness"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke-dasharray="`${segment.fraction * circumference} ${circumference}`"
        :stroke-dashoffset="`${-segment.start * circumference}`"
        :class="segment.color"
      />
    </svg>
    <NxChartLegend
      :items="segments"
      :label="label"
    />
  </div>
</template>
