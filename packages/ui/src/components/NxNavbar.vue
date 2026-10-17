<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  description?: string;
}>(), {
  title: undefined,
  description: undefined,
});
</script>

<template>
  <header class="flex min-h-14 items-center justify-between gap-4 border-b border-ui-border bg-ui-bg px-4">
    <div class="flex min-w-0 items-center gap-3">
      <slot name="leading" />
      <div class="min-w-0">
        <p
          v-if="title"
          class="truncate text-sm font-semibold text-ui-text-highlighted"
        >
          {{ title }}
        </p>
        <p
          v-if="description"
          class="truncate text-xs text-ui-text-muted"
        >
          {{ description }}
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot />
    </div>
  </header>
</template>
