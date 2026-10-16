<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';

export interface NxSegmentItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/** A compact single-choice control, for switching between two to four views. `label` is required. */
withDefaults(defineProps<{
  modelValue: string;
  items: NxSegmentItem[];
  label: string;
}>(), {});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <ToggleGroupRoot
    type="single"
    :model-value="modelValue"
    :aria-label="label"
    class="inline-flex gap-0.5 rounded-ui border border-ui-border bg-ui-bg-muted p-0.5"
    @update:model-value="(value) => typeof value === 'string' && value && emit('update:modelValue', value)"
  >
    <ToggleGroupItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      class="h-7 rounded-ui-sm px-3 text-xs font-medium text-ui-text-muted outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary disabled:opacity-50 data-[state=on]:bg-ui-bg data-[state=on]:text-ui-text-highlighted data-[state=on]:shadow-sm"
    >
      {{ item.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
