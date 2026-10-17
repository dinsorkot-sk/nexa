<script setup lang="ts">
import { computed } from 'vue';
import NxChartLegend, { type NxChartLegendItem } from './NxChartLegend.vue';

export interface NxLineSeries extends NxChartLegendItem {
  values: number[];
}

const props = withDefaults(defineProps<{
  labels: string[];
  series: NxLineSeries[];
  label: string;
  height?: number;
}>(), { height: 200 });

const width = 600;
const graphHeight = computed(() => Math.max(80, props.height - 24));
const paths = computed(() => {
  const values = props.series.flatMap((item) => item.values).filter(Number.isFinite);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  return props.series.map((item) => ({
    name: item.label,
    points: item.values.map((value, index) => {
      const x = props.labels.length <= 1 ? width / 2 : (index / (props.labels.length - 1)) * width;
      const y = graphHeight.value - ((value - min) / range) * (graphHeight.value - 8) - 4;
      return `${x},${y}`;
    }).join(' '),
  }));
});
</script>

<template>
  <div>
    <svg
      role="img"
      :aria-label="label"
      :viewBox="`0 0 ${width} ${graphHeight}`"
      :style="{ height: `${height}px` }"
      class="w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        :y1="graphHeight - 1"
        :x2="width"
        :y2="graphHeight - 1"
        class="stroke-ui-border"
        stroke="currentColor"
      />
      <polyline
        v-for="(path, index) in paths"
        :key="path.name"
        :points="path.points"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
        :class="[
          index % 4 === 0 && 'text-ui-primary',
          index % 4 === 1 && 'text-ui-info',
          index % 4 === 2 && 'text-ui-warning',
          index % 4 === 3 && 'text-ui-success',
        ]"
      />
    </svg>
    <div class="flex justify-between gap-2">
      <span
        v-for="tick in labels"
        :key="tick"
        class="truncate text-[10px] text-ui-text-muted"
      >{{ tick }}</span>
    </div>
    <NxChartLegend
      v-if="series.length > 1"
      :items="series"
      :label="label"
      class="mt-3"
    />
  </div>
</template>
