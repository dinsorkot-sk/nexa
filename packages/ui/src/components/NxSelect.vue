<script setup lang="ts">
import type { Component } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { SelectContent, SelectIcon, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from 'reka-ui';
import { useId } from 'vue';
import { fieldBox, fieldStyles } from '../lib/input';

export interface NxSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

/** Dropdown select. Three Variants and three Sizes with an optional leading icon, as the mockup's Select section. Opens a styled list of options. */
withDefaults(defineProps<{
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
const generatedId = useId();
const selectId = (props.id ?? generatedId);

function onChange(value: string | undefined) {
  emit('update:modelValue', value === '' ? undefined : value);
}
</script>

<template>
  <div class="relative">
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
      class="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 text-ui-text-dimmed"
      :class="size === 'lg' ? 'ml-4' : size === 'sm' ? 'ml-2.5' : 'ml-3'"
    />
    <SelectRoot
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      @update:model-value="onChange"
    >
      <SelectTrigger
        :id="selectId"
        v-bind="$attrs"
        :aria-invalid="invalid || undefined"
        :class="[
          fieldStyles({ variant, size, invalid }),
          fieldBox[size],
          'flex w-full items-center justify-between gap-2',
          'appearance-none',
          icon ? (size === 'lg' ? 'pl-11' : size === 'sm' ? 'pl-8' : 'pl-9') : '',
          'pr-9',
          'text-left',
        ]"
      >
        <SelectValue :placeholder="placeholder" />
        <SelectIcon as-child>
          <ChevronDown
            aria-hidden="true"
            class="text-ui-text-dimmed"
            :class="size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4'"
          />
        </SelectIcon>
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          class="z-50 max-h-64 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg text-ui-text shadow-lg"
          position="popper"
          :side-offset="4"
        >
          <SelectViewport class="p-1">
            <SelectItem
              v-if="placeholder"
              value=""
              disabled
              class="relative flex cursor-default select-none items-center rounded-ui px-2 py-1.5 text-sm text-ui-text-muted outline-none data-[highlighted]:bg-ui-bg-elevated"
            >
              <SelectItemText>{{ placeholder }}</SelectItemText>
            </SelectItem>
            <SelectItem
              v-for="option in options"
              :key="option.value"
              :value="option.value"
              :disabled="option.disabled"
              class="relative flex cursor-default select-none items-center rounded-ui px-2 py-1.5 text-sm text-ui-text outline-none data-[highlighted]:bg-ui-bg-elevated data-[state=checked]:text-ui-text-highlighted"
            >
              <SelectItemText>{{ option.label }}</SelectItemText>
              <SelectItemIndicator class="ml-auto">
                <ChevronDown class="size-4 text-ui-primary" />
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>