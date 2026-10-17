<script setup lang="ts">
import { computed } from 'vue';
import NxChartLegend, { type NxChartLegendItem } from './NxChartLegend.vue';

export interface NxBarSeries extends NxChartLegendItem {
  values: number[];
}

const props = withDefaults(defineProps<{
  labels: string[];
  series: NxBarSeries[];
  label: string;
  height?: number;
}>(), { height: 200 });

const maximum = computed(() => Math.max(0, ...props.series.flatMap((item) => item.values).filter(Number.isFinite)));
function heightOf(value: number) {
  if (!Number.isFinite(value) || maximum.value === 0) return 0;
  return Math.max(0, (value / maximum.value) * 100);
}
</script>

<template>
  <div>
    <div
      role="img"
      :aria-label="props.label"
      class="flex items-end justify-around gap-2 border-b border-ui-border px-2 pt-3"
      :style="{ height: `${props.height}px` }"
    >
      <div
        v-for="(tick, index) in props.labels"
        :key="tick"
        class="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
      >
        <div
          v-for="(item, seriesIndex) in props.series"
          :key="`${tick}-${item.label}`"
          :class="[
            'w-full max-w-8 rounded-t-sm',
            seriesIndex % 4 === 0 && 'bg-ui-primary',
            seriesIndex % 4 === 1 && 'bg-ui-info',
            seriesIndex % 4 === 2 && 'bg-ui-warning',
            seriesIndex % 4 === 3 && 'bg-ui-success',
          ]"
          :style="{ height: `${heightOf(item.values[index] ?? 0)}%` }"
        />
      </div>
    </div>
    <div class="mt-2 flex justify-around gap-2">
      <span
        v-for="tick in props.labels"
        :key="tick"
        class="min-w-0 flex-1 truncate text-center text-[10px] text-ui-text-muted"
      >{{ tick }}</span>
    </div>
    <NxChartLegend
      v-if="props.series.length > 1"
      :items="props.series"
      :label="props.label"
      class="mt-3"
    />
  </div>
</template>
