<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}>(), {
  change: undefined,
  trend: 'neutral',
});
</script>

<template>
  <section class="rounded-ui border border-ui-border bg-ui-bg p-4">
    <h3 class="text-sm font-medium text-ui-text-muted">
      {{ label }}
    </h3>
    <div class="mt-2 flex items-baseline justify-between gap-3">
      <p class="text-2xl font-semibold tabular-nums text-ui-text-highlighted">
        {{ value }}
      </p>
      <span
        v-if="change"
        :class="[
          'text-xs font-medium',
          trend === 'up' && 'text-ui-success-text',
          trend === 'down' && 'text-ui-error-text',
          trend === 'neutral' && 'text-ui-text-muted',
        ]"
      >{{ change }}</span>
    </div>
    <div
      v-if="$slots.default"
      class="mt-3 text-xs text-ui-text-muted"
    >
      <slot />
    </div>
  </section>
</template>
