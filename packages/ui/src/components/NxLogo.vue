<script setup lang="ts">
/**
 * Placeholder wordmark: the mockup's Logo component is not exported as an asset, so this is a text mark. Replace the
 * mark with the official logo when it is supplied.
 */
withDefaults(defineProps<{ label?: string }>(), { label: 'Nexa' });
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold text-ui-text-highlighted">
    <span
      aria-hidden="true"
      class="flex size-7 items-center justify-center rounded-ui bg-ui-primary text-sm font-bold text-ui-on-solid"
    >N</span>
    <span>{{ label }}</span>
  </span>
</template>
