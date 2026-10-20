<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';
import UTabs from '@nuxt/ui/components/Tabs.vue';
import { tv } from 'tailwind-variants';

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

const props = withDefaults(defineProps<{
  modelValue: string;
  items: NxTabItem[];
  label: string;
  size?: TabSize;
}>(), { size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/**
 * The mockup's tabs sit on a plain rule and mark the active tab with a border, so Nuxt UI's sliding indicator is
 * hidden rather than removed: its presence is what switches off the `in-[[data-slot=list]:not(:has(...))]` variants
 * Nuxt UI uses to paint the active tab.
 */
const ui = computed(() => ({
  root: 'flex flex-col',
  list: 'flex gap-1 border-b border-ui-border bg-transparent p-0 rounded-none',
  indicator: 'hidden',
  label: () => '',
  trigger: [
    tab({ size: props.size }),
    'justify-start rounded-none focus-visible:outline-0',
  ].join(' '),
}));
</script>

<template>
  <UTabs
    :model-value="modelValue"
    :items="items"
    :content="false"
    :aria-label="label"
    :ui="ui"
    @update:model-value="(value) => typeof value === 'string' && value && emit('update:modelValue', value)"
  >
    <template #leading="{ item }">
      <component
        :is="item.icon"
        v-if="item.icon"
        class="shrink-0 group-data-[state=active]:text-ui-primary-text"
        aria-hidden="true"
      />
    </template>
  </UTabs>
</template>
