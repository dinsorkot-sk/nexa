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

/** Round the axis up to a readable step, so the bars are not drawn against a ragged maximum. */
function niceMax(value: number): number {
  if (!(value > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

const maximum = computed(() => niceMax(Math.max(0, ...props.series.flatMap((item) => item.values).filter(Number.isFinite))));
const ticks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(maximum.value * fraction)));

function heightOf(value: number) {
  if (!Number.isFinite(value) || maximum.value === 0) return 0;
  return Math.max(0, (value / maximum.value) * 100);
}

// The mockup's bar palette: primary then secondary, then the status colours.
const bars = ['bg-ui-primary', 'bg-ui-secondary', 'bg-ui-warning', 'bg-ui-success'];
</script>

<template>
  <div>
    <div class="flex gap-2">
      <div
        aria-hidden="true"
        class="flex w-6 shrink-0 flex-col justify-between py-px text-right text-[11px] font-medium text-ui-text-dimmed"
        :style="{ height: `${props.height}px` }"
      >
        <span
          v-for="tick in ticks"
          :key="tick"
        >{{ tick }}</span>
      </div>
      <div
        class="relative flex-1 border-b border-ui-border"
        :style="{ height: `${props.height}px` }"
      >
        <div
          aria-hidden="true"
          class="absolute inset-0 flex flex-col justify-between"
        >
          <span
            v-for="tick in ticks"
            :key="tick"
            class="border-t border-ui-border"
          />
        </div>
        <div
          role="img"
          :aria-label="props.label"
          class="relative flex h-full items-end justify-around gap-2"
        >
          <div
            v-for="(tick, index) in props.labels"
            :key="tick"
            class="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
          >
            <div
              v-for="(item, seriesIndex) in props.series"
              :key="`${tick}-${item.label}`"
              class="w-3.5 origin-bottom animate-ui-grow rounded-t-[3px]"
              :class="bars[seriesIndex % bars.length]"
              :style="{
                height: `${heightOf(item.values[index] ?? 0)}%`,
                animationDelay: `${Math.min(index, 10) * 40 + seriesIndex * 25}ms`,
              }"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="mt-2 flex gap-2">
      <div class="w-6 shrink-0" />
      <div class="flex flex-1 justify-around gap-2">
        <span
          v-for="tick in props.labels"
          :key="tick"
          class="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-ui-text-muted"
        >{{ tick }}</span>
      </div>
    </div>
    <NxChartLegend
      v-if="props.series.length > 1"
      :items="props.series"
      :label="props.label"
      class="mt-3"
    />
  </div>
</template>
