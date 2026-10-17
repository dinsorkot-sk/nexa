<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  color?: 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md';
}>(), { color: 'primary', size: 'md' });
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm text-ui-text">
    <span
      aria-hidden="true"
      :class="[
        'shrink-0 rounded-full',
        size === 'sm' ? 'size-1.5' : 'size-2',
        color === 'primary' && 'bg-ui-primary',
        color === 'success' && 'bg-ui-success',
        color === 'info' && 'bg-ui-info',
        color === 'warning' && 'bg-ui-warning',
        color === 'error' && 'bg-ui-error',
        color === 'neutral' && 'bg-ui-text-muted',
      ]"
    />
    {{ label }}
  </span>
</template>
