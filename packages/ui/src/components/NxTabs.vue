<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { tv } from 'tailwind-variants';
import type { Component } from 'vue';

export interface NxTabItem {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: Component;
}

/** The mockup's Tab section: two sizes, an optional leading icon and a 2px indicator under the active tab. */
export type TabSize = 'sm' | 'md';

const tab = tv({
  base: 'group -mb-px inline-flex items-center border-b-2 border-transparent font-medium text-ui-text-muted outline-none transition-colors duration-ui-fast ease-ui-out hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-ui-primary data-[state=active]:text-ui-text-highlighted',
  variants: {
    size: {
      sm: 'gap-1.5 px-2.5 py-1.5 text-xs [&_svg]:size-3.5',
      md: 'gap-1.5 px-3 py-2 text-sm [&_svg]:size-4',
    },
  },
  defaultVariants: { size: 'md' },
});

/** Tab triggers only. The caller renders the matching panel for the active value. */
withDefaults(defineProps<{
  modelValue: string;
  items: NxTabItem[];
  label: string;
  size?: TabSize;
}>(), { size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    @update:model-value="(value) => typeof value === 'string' && value && emit('update:modelValue', value)"
  >
    <TabsList
      :aria-label="label"
      class="flex gap-1 border-b border-ui-border"
    >
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        :disabled="item.disabled"
        :class="tab({ size })"
      >
        <component
          :is="item.icon"
          v-if="item.icon"
          class="shrink-0 group-data-[state=active]:text-ui-primary-text"
          aria-hidden="true"
        />
        {{ item.label }}
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
