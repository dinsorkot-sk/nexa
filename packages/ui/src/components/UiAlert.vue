<template>
  <div
    :role="tone === 'danger' ? 'alert' : 'status'"
    :class="cn('rounded-md border px-3 py-2 text-sm', toneClass, props.class)"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

const props = withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger'; class?: string }>(), { tone: 'neutral', class: undefined });
const toneClass = computed(() => ({
  'border-border bg-neutral-soft text-neutral-soft-foreground': props.tone === 'neutral',
  'border-success-soft-foreground bg-success-soft text-success-soft-foreground': props.tone === 'success',
  'border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground': props.tone === 'warning',
  'border-danger-soft-foreground bg-danger-soft text-danger-soft-foreground': props.tone === 'danger',
}));
</script>
