<script setup lang="ts">
import type { Component } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { useId } from 'vue';
import { fieldBox, fieldStyles } from '../lib/input';

export interface NxSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

/** Native dropdown. Three Variants and three Sizes with an optional leading icon, as the mockup's Select section. */
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

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', value === '' ? undefined : value);
}
</script>

<template>
  <div class="relative">
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
      class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
      :class="size === 'lg' ? 'ml-4' : size === 'sm' ? 'ml-2.5' : 'ml-3'"
    />
    <select
      :id="id ?? generatedId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :class="[
        fieldStyles({ variant, size, invalid }),
        fieldBox[size],
        'appearance-none',
        icon ? (size === 'lg' ? 'pl-11' : size === 'sm' ? 'pl-8' : 'pl-9') : '',
        'pr-9',
      ]"
      @change="onChange"
    >
      <option
        v-if="placeholder"
        value=""
        disabled
      >
        {{ placeholder }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <ChevronDown
      aria-hidden="true"
      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
      :class="size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4'"
    />
  </div>
</template>
