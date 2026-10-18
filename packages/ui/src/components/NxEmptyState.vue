<script setup lang="ts">
import type { Component } from 'vue';

/**
 * Shown when a list, table or search has no content, as the mockup's EmptyState section. Always offer the next
 * step: put one or two actions in the default slot.
 */
withDefaults(defineProps<{
  title: string;
  description?: string;
  icon?: Component;
}>(), {
  description: undefined,
  icon: undefined,
});
</script>

<template>
  <section class="flex max-w-md flex-col items-center gap-2.5 px-8 py-8 text-center">
    <span
      v-if="icon"
      aria-hidden="true"
      class="flex size-14 items-center justify-center rounded-full bg-ui-bg-elevated text-ui-text-muted"
    >
      <component
        :is="icon"
        class="size-7"
      />
    </span>
    <h2 class="text-base font-semibold text-ui-text-highlighted">
      {{ title }}
    </h2>
    <p
      v-if="description"
      class="text-sm text-ui-text-muted"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-1.5 flex items-center gap-2"
    >
      <slot />
    </div>
  </section>
</template>
