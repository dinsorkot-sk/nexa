<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { Check, Minus } from 'lucide-vue-next';
import { useId } from 'vue';
import { tv } from 'tailwind-variants';

/** Binary or tri-state choice, as the mockup's Checkbox section: 3 sizes and an indeterminate state. */
export type CheckboxSize = 'sm' | 'md' | 'lg';

// Box and icon sizes are the mockup's CTRL table; the box radius is radius/sm (rounded-ui-sm).
const box = tv({
  base: 'flex shrink-0 items-center justify-center rounded-ui-sm border bg-ui-bg outline-none transition-colors duration-ui-fast ease-ui-out focus-visible:ring-[3px] focus-visible:ring-ui-primary-outline data-[state=checked]:border-ui-primary data-[state=checked]:bg-ui-primary hover:data-[state=checked]:border-ui-primary-hover hover:data-[state=checked]:bg-ui-primary-hover data-[state=indeterminate]:border-ui-primary data-[state=indeterminate]:bg-ui-primary',
  variants: {
    size: {
      sm: 'size-3.5',
      md: 'size-4',
      lg: 'size-5',
    },
    checked: {
      true: 'border-ui-primary',
      false: 'border-ui-border-accented hover:border-ui-text-dimmed',
    },
  },
  defaultVariants: { size: 'md', checked: false },
});

const iconSize: Record<CheckboxSize, string> = { sm: 'size-2.5', md: 'size-3', lg: 'size-3.5' };
const labelSize: Record<CheckboxSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
const gapSize: Record<CheckboxSize, string> = { sm: 'gap-2', md: 'gap-2', lg: 'gap-2.5' };

withDefaults(defineProps<{
  modelValue?: boolean | 'indeterminate';
  disabled?: boolean;
  id?: string;
  size?: CheckboxSize;
}>(), {
  modelValue: false,
  disabled: false,
  id: undefined,
  size: 'md',
});

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const generatedId = useId();
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center text-ui-text-highlighted"
    :class="[labelSize[size], gapSize[size], disabled && 'cursor-not-allowed opacity-50']"
  >
    <CheckboxRoot
      :id="id ?? generatedId"
      :model-value="modelValue"
      :disabled="disabled"
      :class="box({ size, checked: modelValue !== false })"
      @update:model-value="(value) => emit('update:modelValue', value === true)"
    >
      <CheckboxIndicator class="animate-ui-pop text-ui-on-solid">
        <Minus
          v-if="modelValue === 'indeterminate'"
          :class="iconSize[size]"
        />
        <Check
          v-else
          :class="iconSize[size]"
        />
      </CheckboxIndicator>
    </CheckboxRoot>
    <slot />
  </label>
</template>
