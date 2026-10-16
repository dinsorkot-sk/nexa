<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { Check, Minus } from 'lucide-vue-next';
import { useId } from 'vue';

withDefaults(defineProps<{
  modelValue?: boolean | 'indeterminate';
  disabled?: boolean;
  id?: string;
}>(), { modelValue: false, disabled: false, id: undefined });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const generatedId = useId();
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center gap-2 text-sm text-ui-text-highlighted data-[disabled]:cursor-not-allowed"
    :class="disabled && 'opacity-50'"
  >
    <CheckboxRoot
      :id="id ?? generatedId"
      :model-value="modelValue"
      :disabled="disabled"
      class="flex size-4 shrink-0 items-center justify-center rounded border border-ui-border-accented bg-ui-bg outline-none focus-visible:ring-2 focus-visible:ring-ui-primary data-[state=checked]:border-ui-primary data-[state=checked]:bg-ui-primary data-[state=indeterminate]:border-ui-primary data-[state=indeterminate]:bg-ui-primary"
      @update:model-value="(value) => emit('update:modelValue', value === true)"
    >
      <CheckboxIndicator class="text-ui-on-solid">
        <Minus
          v-if="modelValue === 'indeterminate'"
          class="size-3"
        />
        <Check
          v-else
          class="size-3"
        />
      </CheckboxIndicator>
    </CheckboxRoot>
    <slot />
  </label>
</template>
