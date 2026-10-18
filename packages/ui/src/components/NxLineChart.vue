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

function niceMax(value: number): number {
  if (!(value > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

const maximum = computed(() => niceMax(Math.max(0, ...props.series.flatMap((item) => item.values).filter(Number.isFinite))));
const ticks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(maximum.value * fraction)));

/** Normalised 0-100 coordinates so the same markup scales with the container width. */
const lines = computed(() => props.series.map((item) => ({
  label: item.label,
  points: item.values.map((value, index) => ({
    x: props.labels.length <= 1 ? 50 : (index / (props.labels.length - 1)) * 100,
    y: maximum.value === 0 || !Number.isFinite(value) ? 100 : 100 - Math.max(0, (value / maximum.value) * 100),
  })),
})));

const strokes = ['text-ui-primary', 'text-ui-secondary', 'text-ui-warning', 'text-ui-success'];
const pointStrokes = ['border-ui-primary', 'border-ui-secondary', 'border-ui-warning', 'border-ui-success'];
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
      <div class="relative flex-1">
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
          class="relative"
          :style="{ height: `${props.height}px` }"
        >
          <svg
            class="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              v-for="(line, index) in lines"
              :key="line.label"
              :points="line.points.map((point) => `${point.x},${point.y}`).join(' ')"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              :class="strokes[index % strokes.length]"
            />
          </svg>
          <template
            v-for="(line, index) in lines"
            :key="line.label"
          >
            <span
              v-for="(point, pointIndex) in line.points"
              :key="pointIndex"
              aria-hidden="true"
              class="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-ui-bg"
              :class="pointStrokes[index % pointStrokes.length]"
              :style="{ left: `${point.x}%`, top: `${point.y}%` }"
            />
          </template>
        </div>
      </div>
    </div>
    <div class="mt-2 flex gap-2">
      <div class="w-6 shrink-0" />
      <div class="flex flex-1 justify-around gap-2">
        <span
          v-for="tick in labels"
          :key="tick"
          class="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-ui-text-muted"
        >{{ tick }}</span>
      </div>
    </div>
    <NxChartLegend
      v-if="series.length > 1"
      :items="series"
      :label="label"
      class="mt-3"
    />
  </div>
</template>
