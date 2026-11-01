<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  description?: string;
  updatedAt?: string;
}>(), { description: '', updatedAt: undefined });
</script>

<template>
  <UCard class="flex h-full flex-col" :ui="{ body: { padding: 'p-4' }, root: 'rounded-xl' }">
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="truncate text-nexa-subheading text-highlighted">{{ title }}</h3>
        <p v-if="description" class="truncate text-nexa-small text-muted">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div class="min-h-0 flex-1">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="border-t border-default pt-2">
      <slot name="footer" />
    </footer>
  </UCard>
</template>
