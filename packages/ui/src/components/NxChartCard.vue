<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="rounded-ui border border-ui-border bg-ui-bg p-4">
    <header class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-ui-text-highlighted">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="mt-1 text-xs text-ui-text-muted"
        >
          {{ description }}
        </p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
    <div
      v-if="$slots.footer"
      class="mt-4 border-t border-ui-border pt-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
