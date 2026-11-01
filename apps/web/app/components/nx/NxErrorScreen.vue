<script setup lang="ts">
withDefaults(defineProps<{
  status: string | number;
  title: string;
  description?: string;
  requestId?: string | null;
}>(), { description: '', requestId: null });
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <p class="text-nexa-display font-semibold text-highlighted">{{ status }}</p>
    <p class="text-nexa-title text-highlighted">{{ title }}</p>
    <p v-if="description" class="max-w-md text-nexa-body text-muted">{{ description }}</p>
    <p v-if="requestId" class="font-mono text-nexa-mono-small text-dimmed">{{ requestId }}</p>
    <div class="mt-2 flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
