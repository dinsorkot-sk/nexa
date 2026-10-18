<script setup lang="ts">
export interface NxChartLegendItem {
  label: string;
  value?: string | number;
}

withDefaults(defineProps<{
  items: NxChartLegendItem[];
  label: string;
}>(), {});

/**
 * The mockup's ChartLegend section: an 8px dot and the series name. The dot follows the chart palette, so the
 * first series is primary, the second secondary, then the status colours.
 */
const dots = ['bg-ui-primary', 'bg-ui-secondary', 'bg-ui-warning', 'bg-ui-success'];
</script>

<template>
  <ul
    :aria-label="label"
    class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ui-text-muted"
  >
    <li
      v-for="(item, index) in items"
      :key="item.label"
      class="inline-flex items-center gap-1.5"
    >
      <span
        aria-hidden="true"
        :class="['size-2 shrink-0 rounded-full', dots[index % dots.length]]"
      />
      <span>{{ item.label }}</span>
      <span
        v-if="item.value !== undefined"
        class="tabular-nums font-medium text-ui-text-highlighted"
      >{{ item.value }}</span>
    </li>
  </ul>
</template>
