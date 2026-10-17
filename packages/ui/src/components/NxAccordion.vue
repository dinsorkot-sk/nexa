<script setup lang="ts">
import { AccordionContent, AccordionHeader, AccordionItem, AccordionRoot, AccordionTrigger } from 'reka-ui';
import { ChevronDown } from 'lucide-vue-next';

export interface NxAccordionItem {
  value: string;
  title: string;
  content?: string;
  disabled?: boolean;
}

withDefaults(defineProps<{
  items: NxAccordionItem[];
  modelValue?: string | string[];
  type?: 'single' | 'multiple';
  collapsible?: boolean;
}>(), {
  modelValue: undefined,
  type: 'single',
  collapsible: true,
});

const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | undefined] }>();
</script>

<template>
  <AccordionRoot
    :type="type"
    :model-value="modelValue"
    :collapsible="type === 'single' ? collapsible : undefined"
    class="divide-y divide-ui-border rounded-ui border border-ui-border"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <AccordionItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
    >
      <AccordionHeader>
        <AccordionTrigger class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-ui-text-highlighted outline-none hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-primary disabled:opacity-50">
          {{ item.title }}
          <ChevronDown
            class="size-4 shrink-0 text-ui-text-muted transition-transform data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent class="px-4 pb-4 text-sm text-ui-text-toned">
        <slot
          :name="item.value"
          :item="item"
        >
          {{ item.content }}
        </slot>
      </AccordionContent>
    </AccordionItem>
  </AccordionRoot>
</template>
