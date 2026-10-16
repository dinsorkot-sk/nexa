<script setup lang="ts">
import type { Component } from 'vue';
import { tv } from 'tailwind-variants';

export type BadgeColor = 'neutral' | 'success' | 'info' | 'warning' | 'error';

const badge = tv({
  base: 'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ui-text-highlighted [&_svg]:size-3.5',
  variants: {
    color: {
      neutral: 'bg-ui-bg-accented',
      success: 'bg-ui-success/15',
      info: 'bg-ui-info/15',
      warning: 'bg-ui-warning/20',
      error: 'bg-ui-error/15',
    },
  },
  defaultVariants: { color: 'neutral' },
});

const dotColor: Record<BadgeColor, string> = {
  neutral: 'bg-ui-text-muted',
  success: 'bg-ui-success',
  info: 'bg-ui-info',
  warning: 'bg-ui-warning',
  error: 'bg-ui-error',
};

withDefaults(defineProps<{
  color?: BadgeColor;
  dot?: boolean;
  icon?: Component;
}>(), { color: 'neutral', dot: false, icon: undefined });
</script>

<template>
  <span :class="badge({ color })">
    <span
      v-if="dot"
      aria-hidden="true"
      :class="['size-1.5 rounded-full', dotColor[color]]"
    />
    <component
      :is="icon"
      v-else-if="icon"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>
