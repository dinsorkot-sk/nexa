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
  /** Centred above the total inside the ring. */
  centerValue?: string;
  /** Centred label under the value. */
  centerLabel?: string;
}>(), {
  size: 180,
  thickness: 24,
  centerValue: undefined,
  centerLabel: undefined,
});

// The mockup's donut palette: primary, secondary then warning.
const colors = ['text-ui-primary', 'text-ui-secondary', 'text-ui-warning', 'text-ui-success'];
const parts = computed(() => {
  const total = props.segments.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let offset = 0;
  return props.segments.map((item, index) => {
    const fraction = total > 0 ? Math.max(0, item.value) / total : 0;
    const start = offset;
    offset += fraction;
    return { ...item, fraction, start, color: colors[index % colors.length], share: `${Math.round(fraction * 100)}%` };
  });
});
const legendItems = computed<NxChartLegendItem[]>(() => parts.value.map((part) => ({ label: part.label, value: part.share })));
const radius = computed(() => (props.size - props.thickness) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div
      class="relative"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
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
          v-for="part in parts"
          :key="part.label"
          fill="none"
          stroke="currentColor"
          :stroke-width="thickness"
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          :stroke-dasharray="`${part.fraction * circumference} ${circumference}`"
          :stroke-dashoffset="`${-part.start * circumference}`"
          :class="part.color"
        />
      </svg>
      <div
        v-if="centerValue !== undefined || centerLabel !== undefined"
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span
          v-if="centerValue !== undefined"
          class="text-xl font-semibold text-ui-text-highlighted"
        >{{ centerValue }}</span>
        <span
          v-if="centerLabel !== undefined"
          class="text-xs text-ui-text-muted"
        >{{ centerLabel }}</span>
      </div>
    </div>
    <NxChartLegend
      :items="legendItems"
      :label="label"
    />
  </div>
</template>
