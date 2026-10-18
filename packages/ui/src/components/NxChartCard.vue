<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="flex flex-col gap-4 rounded-ui-xl border border-ui-border bg-ui-bg p-4">
    <header class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-base font-semibold text-ui-text-highlighted">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="mt-0.5 text-sm text-ui-text-muted"
        >
          {{ description }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="legend" />
        <slot name="actions" />
      </div>
    </header>
    <slot />
    <div
      v-if="$slots.footer"
      class="border-t border-ui-border pt-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
