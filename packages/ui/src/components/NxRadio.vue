<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui';

export interface NxRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** `label` is the accessible name of the group and is required. */
withDefaults(defineProps<{
  modelValue?: string;
  options: NxRadioOption[];
  label: string;
  name?: string;
  disabled?: boolean;
}>(), { modelValue: undefined, name: undefined, disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <RadioGroupRoot
    :model-value="modelValue"
    :name="name"
    :disabled="disabled"
    :aria-label="label"
    class="flex flex-col gap-2"
    @update:model-value="(value) => typeof value === 'string' && emit('update:modelValue', value)"
  >
    <label
      v-for="option in options"
      :key="option.value"
      class="inline-flex cursor-pointer items-center gap-2 text-sm text-ui-text-highlighted"
      :class="(disabled || option.disabled) && 'opacity-50'"
    >
      <RadioGroupItem
        :value="option.value"
        :disabled="disabled || option.disabled"
        class="flex size-4 shrink-0 items-center justify-center rounded-full border border-ui-border-accented bg-ui-bg outline-none focus-visible:ring-2 focus-visible:ring-ui-primary data-[state=checked]:border-ui-primary"
      >
        <RadioGroupIndicator class="flex items-center justify-center">
          <span class="size-2 rounded-full bg-ui-primary" />
        </RadioGroupIndicator>
      </RadioGroupItem>
      {{ option.label }}
    </label>
  </RadioGroupRoot>
</template>
