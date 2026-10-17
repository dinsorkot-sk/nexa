<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  color?: 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
}>(), { color: 'primary' });
</script>

<template>
  <span
    :class="[
      'block truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium',
      color === 'primary' && 'bg-ui-primary/10 text-ui-text-highlighted',
      color === 'success' && 'bg-ui-success/10 text-ui-text-highlighted',
      color === 'info' && 'bg-ui-info/10 text-ui-text-highlighted',
      color === 'warning' && 'bg-ui-warning/10 text-ui-text-highlighted',
      color === 'error' && 'bg-ui-error/10 text-ui-text-highlighted',
      color === 'neutral' && 'bg-ui-bg-accented text-ui-text-toned',
    ]"
  >{{ label }}</span>
</template>
