<template>
  <select
    v-bind="$attrs"
    :value="modelValue"
    :class="cn('flex h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
import { cn } from '../index';

const props = defineProps<{ modelValue?: string | number; class?: string }>();
defineOptions({ inheritAttrs: false });
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
