<template>
  <span :class="cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', toneClass, props.class)">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

const props = withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger'; class?: string }>(), { tone: 'neutral', class: undefined });
const toneClass = computed(() => ({
  'bg-neutral-soft text-neutral-soft-foreground': props.tone === 'neutral',
  'bg-success-soft text-success-soft-foreground': props.tone === 'success',
  'bg-warning-soft text-warning-soft-foreground': props.tone === 'warning',
  'bg-danger-soft text-danger-soft-foreground': props.tone === 'danger',
}));
</script>
