<script setup lang="ts">
withDefaults(defineProps<{
  icon: string;
  title: string;
  description?: string;
}>(), { description: '' });
</script>

<template>
  <header class="flex items-start gap-4">
    <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[--ui-primary-soft] text-[--ui-primary-text]">
      <UIcon :name="icon" class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <h1 class="text-nexa-title text-highlighted">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-nexa-body text-muted">{{ description }}</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
