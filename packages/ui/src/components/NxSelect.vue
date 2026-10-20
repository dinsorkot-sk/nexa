<script setup lang="ts">
import type { Component } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { computed } from 'vue';
import USelect from '@nuxt/ui/components/Select.vue';
import { fieldBox, fieldStyles } from '../lib/input';

export interface NxSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Dropdown select. Three Variants and three Sizes with an optional leading icon, as the mockup's Select section. Opens a styled list of options. */
const props = withDefaults(defineProps<{
  modelValue?: string | null;
  options: NxSelectOption[];
  /** Shown as a disabled first option while nothing is selected. */
  placeholder?: string;
  id?: string;
  variant?: 'outline' | 'soft' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
  /** Leading icon, for example a folder icon. */
  icon?: Component;
}>(), {
  modelValue: undefined,
  placeholder: undefined,
  id: undefined,
  variant: 'outline',
  size: 'md',
  invalid: false,
  disabled: false,
  icon: undefined,
});

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();

const ui = computed(() => ({
  root: 'relative flex w-full items-center',
  base: [
    fieldStyles({ variant: props.variant, size: props.size, invalid: props.invalid }),
    fieldBox[props.size],
    'flex w-full items-center justify-between gap-2 pr-9 text-left',
    props.icon ? (props.size === 'lg' ? 'pl-11' : props.size === 'sm' ? 'pl-8' : 'pl-9') : '',
  ].join(' '),
  leading: 'absolute inset-y-0 start-0 flex items-center ps-0',
  trailing: 'absolute inset-y-0 end-0 flex items-center pe-0',
  content: 'z-50 max-h-64 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg text-ui-text shadow-lg',
  viewport: 'p-1',
  item: 'relative flex cursor-default select-none items-center rounded-ui px-2 py-1.5 text-sm text-ui-text outline-none data-[highlighted]:bg-ui-bg-elevated data-[state=checked]:text-ui-text-highlighted',
  itemLabel: 'flex-1 truncate',
  itemTrailing: 'ml-auto',
}));

function onChange(value: unknown) {
  emit('update:modelValue', typeof value === 'string' && value !== '' ? value : undefined);
}
</script>

<template>
  <USelect
    :id="id"
    :items="options"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :ui="ui"
    @update:model-value="onChange"
  >
    <template
      v-if="icon"
      #leading
    >
      <component
        :is="icon"
        aria-hidden="true"
        class="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 text-ui-text-dimmed"
        :class="size === 'lg' ? 'ml-4' : size === 'sm' ? 'ml-2.5' : 'ml-3'"
      />
    </template>
    <template #trailing>
      <ChevronDown
        aria-hidden="true"
        class="text-ui-text-dimmed"
        :class="size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4'"
      />
    </template>
    <template #item-trailing="{ item }">
      <ChevronDown
        v-if="item.value === modelValue"
        class="size-4 text-ui-primary"
      />
    </template>
  </USelect>
</template>
