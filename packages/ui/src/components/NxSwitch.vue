<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';

withDefaults(defineProps<{
  modelValue?: boolean;
  disabled?: boolean;
  id?: string;
}>(), { modelValue: false, disabled: false, id: undefined });

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
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-ui-bg-accented outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-primary data-[state=checked]:bg-ui-primary"
      @update:model-value="(value) => emit('update:modelValue', value)"
    >
      <SwitchThumb class="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-ui-bg shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchRoot>
    <slot />
  </label>
</template>
