<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
  direction?: 'vertical' | 'horizontal';
}>(), {
  label: undefined,
  direction: 'vertical',
});
</script>

<template>
  <div
    :class="[
      'flex items-center justify-center gap-2 text-xs text-ui-text-muted',
      direction === 'vertical' ? 'h-12 flex-col' : 'w-12 flex-row',
    ]"
    role="img"
    :aria-label="label ?? 'Workflow connection'"
  >
    <div
      aria-hidden="true"
      :class="direction === 'vertical' ? 'h-full w-px bg-ui-border-accented' : 'h-px w-full bg-ui-border-accented'"
    />
    <span
      v-if="label"
      class="shrink-0 rounded bg-ui-bg px-1"
    >{{ label }}</span>
  </div>
</template>
