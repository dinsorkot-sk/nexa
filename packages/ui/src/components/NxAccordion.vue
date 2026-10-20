<script setup lang="ts">
import { computed } from 'vue';
import UAccordion from '@nuxt/ui/components/Accordion.vue';

export interface NxAccordionItem {
  value: string;
  title: string;
  content?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
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

/** Nuxt UI's items take a `label`; this package calls it `title`. */
const items = computed(() => props.items.map((item) => ({
  value: item.value,
  label: item.title,
  content: item.content,
  disabled: item.disabled,
  // The slot for an item is named after the item's value.
  slot: item.value,
})));

const ui = computed(() => ({
  root: 'w-full',
  item: 'border-b border-ui-border',
  header: 'flex',
  trigger: 'group flex w-full items-center justify-between gap-2 py-3.5 text-left text-sm font-medium text-ui-text-highlighted outline-none hover:text-ui-primary-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50',
  trailingIcon: 'size-4 shrink-0 text-ui-text-muted transition-transform duration-ui ease-ui-out group-data-[state=open]:rotate-180',
  label: 'text-start break-words',
  content: 'overflow-hidden text-sm text-ui-text-muted data-[state=closed]:animate-ui-collapse-up data-[state=open]:animate-ui-collapse-down',
  body: 'pb-3.5',
}));
</script>

<template>
  <UAccordion
    :items="items"
    :model-value="modelValue"
    :type="type"
    :collapsible="type === 'single' ? collapsible : undefined"
    :ui="ui"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <template
      v-for="item in items"
      #[item.slot]
      :key="item.value"
    >
      <slot
        :name="item.value"
        :item="item"
      >
        {{ item.content }}
      </slot>
    </template>
  </UAccordion>
</template>
