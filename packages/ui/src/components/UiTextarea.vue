<template>
  <textarea
    v-bind="$attrs"
    :value="modelValue"
    :class="cn('flex min-h-24 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<script setup lang="ts">
import { cn } from '../cn';

const props = defineProps<{ modelValue?: string; class?: string }>();
defineOptions({ inheritAttrs: false });
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
