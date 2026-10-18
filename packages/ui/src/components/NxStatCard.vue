<script setup lang="ts">
import { TrendingDown, TrendingUp } from 'lucide-vue-next';
import { computed } from 'vue';
import type { Component } from 'vue';

/** The mockup's StatCard section: an icon well, the value, its label and an optional trend badge. */
const props = withDefaults(defineProps<{
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: Component;
}>(), {
  change: undefined,
  trend: 'neutral',
  icon: undefined,
});

const trendClass = computed(() => ({
  up: 'bg-ui-success-soft text-ui-success-text',
  down: 'bg-ui-error-soft text-ui-error-text',
  neutral: 'bg-ui-bg-muted text-ui-text-muted',
}[props.trend]));
const TrendIcon: Record<'up' | 'down', Component> = { up: TrendingUp, down: TrendingDown };
</script>

<template>
  <section class="flex flex-col gap-3 rounded-ui-xl border border-ui-border bg-ui-bg p-4">
    <div class="flex items-center justify-between gap-3">
      <span
        v-if="icon"
        class="flex size-9 items-center justify-center rounded-ui-lg bg-ui-primary-soft text-ui-primary-text"
      >
        <component
          :is="icon"
          class="size-4.5"
          aria-hidden="true"
        />
      </span>
      <span
        v-if="change"
        class="ml-auto inline-flex items-center gap-1 rounded-ui-xs px-1.5 py-0.5 text-[11px] font-medium"
        :class="trendClass"
      >
        <component
          :is="TrendIcon[trend as 'up' | 'down']"
          v-if="trend !== 'neutral'"
          class="size-3"
          aria-hidden="true"
        />
        {{ change }}
      </span>
    </div>
    <div class="flex flex-col gap-0.5">
      <p class="text-[32px] font-semibold leading-10 tabular-nums text-ui-text-highlighted">
        {{ value }}
      </p>
      <p class="text-sm text-ui-text-muted">
        {{ label }}
      </p>
    </div>
    <div
      v-if="$slots.default"
      class="text-xs text-ui-text-muted"
    >
      <slot />
    </div>
  </section>
</template>
