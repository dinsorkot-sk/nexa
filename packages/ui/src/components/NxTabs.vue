<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui';

export interface NxTabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Tab triggers only. The caller renders the matching panel for the active value. */
withDefaults(defineProps<{
  modelValue: string;
  items: NxTabItem[];
  label: string;
}>(), {});

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
        class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ui-text-muted outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary disabled:opacity-50 data-[state=active]:border-ui-primary data-[state=active]:text-ui-text-highlighted"
      >
        {{ item.label }}
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
