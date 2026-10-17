<script setup lang="ts">
import type { Component } from 'vue';

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
  <section class="flex min-h-48 flex-col items-center justify-center rounded-ui border border-dashed border-ui-border-accented bg-ui-bg px-6 py-10 text-center">
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
      class="size-8 text-ui-text-muted"
    />
    <h2 class="mt-3 text-base font-semibold text-ui-text-highlighted">
      {{ title }}
    </h2>
    <p
      v-if="description"
      class="mt-1 max-w-md text-sm text-ui-text-muted"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-4"
    >
      <slot />
    </div>
  </section>
</template>
