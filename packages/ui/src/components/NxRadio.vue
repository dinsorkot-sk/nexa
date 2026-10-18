<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui';
import { tv } from 'tailwind-variants';

export interface NxRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Single choice from a group, as the mockup's Radio section: 3 sizes and the 4 control states. */
export type RadioSize = 'sm' | 'md' | 'lg';

// Box and dot follow the mockup's CTRL table; the dot is rounded to 40% of the box (6 / 6 / 8 px).
const dot = tv({
  base: 'flex shrink-0 items-center justify-center rounded-full border bg-ui-bg outline-none transition-colors duration-ui-fast ease-ui-out focus-visible:ring-[3px] focus-visible:ring-ui-primary-outline data-[state=checked]:border-ui-primary data-[state=checked]:bg-ui-primary hover:data-[state=checked]:border-ui-primary hover:data-[state=checked]:bg-ui-primary-hover',
  variants: {
    size: { sm: 'size-3.5', md: 'size-4', lg: 'size-5' },
    checked: {
      true: 'border-ui-primary',
      false: 'border-ui-border-accented hover:border-ui-text-dimmed',
    },
  },
  defaultVariants: { size: 'md', checked: false },
});

const markSize: Record<RadioSize, string> = { sm: 'size-1.5', md: 'size-1.5', lg: 'size-2' };
const labelSize: Record<RadioSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
const gapSize: Record<RadioSize, string> = { sm: 'gap-2', md: 'gap-2', lg: 'gap-2.5' };

/** `label` is the accessible name of the group and is required. */
withDefaults(defineProps<{
  modelValue?: string;
  options: NxRadioOption[];
  label: string;
  name?: string;
  disabled?: boolean;
  size?: RadioSize;
}>(), { modelValue: undefined, name: undefined, disabled: false, size: 'md' });

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
      class="inline-flex cursor-pointer items-center text-ui-text-highlighted"
      :class="[labelSize[size], gapSize[size], (disabled || option.disabled) && 'cursor-not-allowed opacity-50']"
    >
      <RadioGroupItem
        :value="option.value"
        :disabled="disabled || option.disabled"
        :class="dot({ size, checked: modelValue === option.value })"
      >
        <RadioGroupIndicator class="flex items-center justify-center">
          <span
            class="animate-ui-pop rounded-full bg-ui-on-solid"
            :class="markSize[size]"
          />
        </RadioGroupIndicator>
      </RadioGroupItem>
      {{ option.label }}
    </label>
  </RadioGroupRoot>
</template>
