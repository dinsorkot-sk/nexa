<script setup lang="ts">
withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}>(), { orientation: 'horizontal', decorative: true });
</script>

<template>
  <div
    :role="decorative ? 'none' : 'separator'"
    :aria-orientation="decorative ? undefined : orientation"
    :class="orientation === 'horizontal' ? 'h-px w-full bg-ui-border' : 'h-full w-px bg-ui-border'"
  />
</template>
