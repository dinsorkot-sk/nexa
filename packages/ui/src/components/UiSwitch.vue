<template>
  <SwitchRoot
    :checked="modelValue"
    :disabled="disabled"
    :class="cn('inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-strong bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary', props.class)"
    v-bind="$attrs"
    @update:checked="(value: boolean) => $emit('update:modelValue', value)"
  >
    <SwitchThumb class="block h-4 w-4 translate-x-1 rounded-full bg-foreground transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary-foreground" />
  </SwitchRoot>
</template>

<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'radix-vue';
import { cn } from '../cn';

const props = defineProps<{ modelValue?: boolean; disabled?: boolean; class?: string }>();
defineOptions({ inheritAttrs: false });
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>
