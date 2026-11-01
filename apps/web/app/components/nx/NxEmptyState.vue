<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string;
  title: string;
  description?: string;
}>(), { icon: 'i-lucide-inbox', description: '' });
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <span class="inline-flex size-12 items-center justify-center rounded-xl bg-[--ui-bg-accented] text-muted">
      <UIcon :name="icon" class="size-6" />
    </span>
    <p class="text-nexa-subheading text-highlighted">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-nexa-body text-muted">{{ description }}</p>
    <div class="mt-2 flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
