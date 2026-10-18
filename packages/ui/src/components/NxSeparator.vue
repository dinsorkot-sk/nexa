<script setup lang="ts">
/**
 * Thin divider, optionally with a label in the middle (`label` prop or the default slot), as the mockup's
 * Separator section.
 */
withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
  label?: string;
}>(), {
  orientation: 'horizontal',
  decorative: true,
  label: undefined,
});
</script>

<template>
  <div
    v-if="orientation === 'horizontal' && (label || $slots.default)"
    role="separator"
    aria-orientation="horizontal"
    class="flex w-full items-center gap-3"
  >
    <span class="h-px flex-1 bg-ui-border" />
    <span class="text-xs text-ui-text-muted">
      <slot>{{ label }}</slot>
    </span>
    <span class="h-px flex-1 bg-ui-border" />
  </div>
  <div
    v-else-if="orientation === 'vertical' && (label || $slots.default)"
    role="separator"
    aria-orientation="vertical"
    class="flex h-full flex-col items-center gap-2"
  >
    <span class="w-px flex-1 bg-ui-border" />
    <span class="text-xs text-ui-text-muted">
      <slot>{{ label }}</slot>
    </span>
    <span class="w-px flex-1 bg-ui-border" />
  </div>
  <div
    v-else
    :role="decorative ? 'none' : 'separator'"
    :aria-orientation="decorative ? undefined : orientation"
    :class="orientation === 'horizontal' ? 'h-px w-full bg-ui-border' : 'h-full w-px bg-ui-border'"
  />
</template>
