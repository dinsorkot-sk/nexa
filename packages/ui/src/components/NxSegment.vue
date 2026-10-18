<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';
import { tv } from 'tailwind-variants';

export interface NxSegmentItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/** The mockup's Segment section: two sizes; the active segment lifts onto the page surface with a shadow. */
export type SegmentSize = 'sm' | 'md';

const segment = tv({
  base: 'inline-flex items-center justify-center rounded-ui font-medium text-ui-text-muted outline-none transition-[background-color,box-shadow,color] duration-ui-fast ease-ui-out hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-ui-bg data-[state=on]:text-ui-text-highlighted data-[state=on]:shadow-sm',
  variants: {
    size: {
      sm: 'px-2 py-1 text-xs',
      md: 'px-2.5 py-1.5 text-sm',
    },
  },
  defaultVariants: { size: 'md' },
});

/** A compact single-choice control, for switching between two to four views. `label` is required. */
withDefaults(defineProps<{
  modelValue: string;
  items: NxSegmentItem[];
  label: string;
  size?: SegmentSize;
}>(), { size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <ToggleGroupRoot
    type="single"
    :model-value="modelValue"
    :aria-label="label"
    class="inline-flex gap-0.5 rounded-ui-lg bg-ui-bg-elevated p-[3px]"
    @update:model-value="(value) => typeof value === 'string' && value && emit('update:modelValue', value)"
  >
    <ToggleGroupItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      :class="segment({ size })"
    >
      {{ item.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
