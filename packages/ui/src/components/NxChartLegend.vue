<script setup lang="ts">
export interface NxChartLegendItem {
  label: string;
  value?: string | number;
}

withDefaults(defineProps<{
  items: NxChartLegendItem[];
  label: string;
}>(), {});
</script>

<template>
  <ul
    :aria-label="label"
    class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ui-text-toned"
  >
    <li
      v-for="(item, index) in items"
      :key="item.label"
      class="inline-flex items-center gap-2"
    >
      <span
        aria-hidden="true"
        :class="[
          'size-2 rounded-full',
          index % 4 === 0 && 'bg-ui-primary',
          index % 4 === 1 && 'bg-ui-info',
          index % 4 === 2 && 'bg-ui-warning',
          index % 4 === 3 && 'bg-ui-success',
        ]"
      />
      <span>{{ item.label }}</span>
      <span
        v-if="item.value !== undefined"
        class="tabular-nums text-ui-text-muted"
      >{{ item.value }}</span>
    </li>
  </ul>
</template>
