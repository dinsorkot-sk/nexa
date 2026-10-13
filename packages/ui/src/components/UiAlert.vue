<template>
  <div
    :role="status === 'danger' ? 'alert' : 'status'"
    :class="cn('rounded-md px-3 py-2 text-sm', toneVariant, props.class)"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

/**
 * Alert uses the same `variant` vocabulary as UiBadge (solid/outline/soft/subtle), defaulting to `soft` so existing
 * alerts look unchanged. `tone` is kept as an alias of `color`; `danger` is the name for the error status. A
 * `danger` alert announces itself as role="alert"; every other status uses role="status".
 */
const props = withDefaults(defineProps<{
  variant?: 'solid' | 'outline' | 'soft' | 'subtle';
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'error';
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  class?: string;
}>(), { variant: 'soft', color: undefined, tone: undefined, class: undefined });

const status = computed<'primary' | 'neutral' | 'success' | 'warning' | 'danger'>(() => {
  const c = props.color ?? props.tone ?? 'neutral';
  return c === 'error' ? 'danger' : c;
});

const toneVariant = computed(() => {
  const s = status.value;
  const solid = {
    primary: 'border border-primary bg-primary text-primary-foreground',
    neutral: 'border border-foreground bg-foreground text-background',
    success: 'border border-success-soft-foreground bg-success-soft text-success-soft-foreground',
    warning: 'border border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground',
    danger: 'border border-danger bg-danger text-danger-foreground',
  }[s];
  const soft = {
    primary: 'border border-border bg-surface-muted text-primary',
    neutral: 'border border-border bg-neutral-soft text-neutral-soft-foreground',
    success: 'border border-success-soft-foreground bg-success-soft text-success-soft-foreground',
    warning: 'border border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground',
    danger: 'border border-danger-soft-foreground bg-danger-soft text-danger-soft-foreground',
  }[s];
  const outline = {
    primary: 'border border-primary bg-surface text-primary',
    neutral: 'border border-border-strong bg-surface text-foreground',
    success: 'border border-success-soft-foreground bg-surface text-success-soft-foreground',
    warning: 'border border-warning-soft-foreground bg-surface text-warning-soft-foreground',
    danger: 'border border-danger bg-surface text-danger',
  }[s];
  const subtle = {
    primary: 'border border-border bg-surface-muted text-foreground',
    neutral: 'border border-border bg-surface-muted text-foreground',
    success: 'border border-success-soft-foreground/40 bg-surface-muted text-foreground',
    warning: 'border border-warning-soft-foreground/40 bg-surface-muted text-foreground',
    danger: 'border border-danger/40 bg-surface-muted text-foreground',
  }[s];
  return { solid, soft, outline, subtle }[props.variant];
});
</script>
