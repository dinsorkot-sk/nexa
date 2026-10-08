<template>
  <span :class="cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', toneClass, props.class)">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../index';

const props = withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger'; class?: string }>(), { tone: 'neutral' });
const toneClass = computed(() => ({
  'bg-slate-800 text-slate-300': props.tone === 'neutral',
  'bg-emerald-950 text-emerald-300': props.tone === 'success',
  'bg-amber-950 text-amber-300': props.tone === 'warning',
  'bg-rose-950 text-rose-300': props.tone === 'danger',
}));
</script>
