<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { tv } from 'tailwind-variants';

/** On/off setting that applies immediately, as the mockup's Switch section: 3 sizes. */
export type SwitchSize = 'sm' | 'md' | 'lg';

// Track and knob are the mockup's SW table; the knob sits 2px in, so the checked offset is track - 4 - knob.
const track = tv({
  base: 'relative inline-flex shrink-0 items-center rounded-full bg-ui-border-accented p-0.5 outline-none transition-colors hover:bg-ui-text-dimmed focus-visible:ring-[3px] focus-visible:ring-ui-primary-outline data-[state=checked]:bg-ui-primary hover:data-[state=checked]:bg-ui-primary-hover',
  variants: {
    size: { sm: 'h-4 w-7', md: 'h-5 w-9', lg: 'h-6 w-11' },
  },
  defaultVariants: { size: 'md' },
});

const knobSize: Record<SwitchSize, string> = { sm: 'size-3', md: 'size-4', lg: 'size-5' };
const knobChecked: Record<SwitchSize, string> = {
  sm: 'data-[state=checked]:translate-x-3.5',
  md: 'data-[state=checked]:translate-x-[18px]',
  lg: 'data-[state=checked]:translate-x-[22px]',
};

withDefaults(defineProps<{
  modelValue?: boolean;
  disabled?: boolean;
  id?: string;
  size?: SwitchSize;
}>(), { modelValue: false, disabled: false, id: undefined, size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center gap-2 text-sm text-ui-text-highlighted"
    :class="disabled && 'cursor-not-allowed opacity-50'"
  >
    <SwitchRoot
      :id="id"
      :model-value="modelValue"
      :disabled="disabled"
      :class="track({ size })"
      @update:model-value="(value) => emit('update:modelValue', value)"
    >
      <SwitchThumb
        class="pointer-events-none block translate-x-0 rounded-full bg-ui-bg shadow transition-transform"
        :class="[knobSize[size], knobChecked[size]]"
      />
    </SwitchRoot>
    <slot />
  </label>
</template>
