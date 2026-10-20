<script setup lang="ts">
import { computed } from 'vue';
import USwitch from '@nuxt/ui/components/Switch.vue';

/** On/off setting that applies immediately, as the mockup's Switch section: 3 sizes. */
export type SwitchSize = 'sm' | 'md' | 'lg';

// Track and knob are the mockup's SW table; the knob sits 2px in, so the checked offset is track - 4 - knob.
const trackSizes: Record<SwitchSize, string> = { sm: 'h-4 w-7', md: 'h-5 w-9', lg: 'h-6 w-11' };

const knobSize: Record<SwitchSize, string> = { sm: 'size-3', md: 'size-4', lg: 'size-5' };
const knobChecked: Record<SwitchSize, string> = {
  sm: 'data-[state=checked]:translate-x-3.5',
  md: 'data-[state=checked]:translate-x-[18px]',
  lg: 'data-[state=checked]:translate-x-[22px]',
};

const props = withDefaults(defineProps<{
  modelValue?: boolean;
  disabled?: boolean;
  id?: string;
  size?: SwitchSize;
}>(), { modelValue: false, disabled: false, id: undefined, size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const ui = computed(() => ({
  root: 'inline-flex cursor-pointer items-center gap-2 text-sm text-ui-text-highlighted',
  container: 'flex items-center',
  base: `relative inline-flex shrink-0 items-center rounded-full border-0 bg-ui-border-accented p-0.5 outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-text-dimmed focus-visible:ring-[3px] focus-visible:ring-ui-primary-outline focus-visible:outline-0 data-[state=checked]:bg-ui-primary hover:data-[state=checked]:bg-ui-primary-hover ${trackSizes[props.size]}`,
  thumb: `pointer-events-none block translate-x-0 rounded-full bg-ui-bg shadow transition-transform duration-ui ease-ui-out ${knobSize[props.size]} ${knobChecked[props.size]}`,
  wrapper: 'ms-0',
  label: 'font-medium text-ui-text-highlighted',
}));
</script>

<template>
  <USwitch
    :id="id"
    :model-value="modelValue"
    :disabled="disabled"
    :ui="ui"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <template #label>
      <slot />
    </template>
  </USwitch>
</template>
