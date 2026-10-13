<template>
  <span :class="cn('inline-flex items-center gap-1 font-medium', sizeClass, toneVariant, props.class)">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

/**
 * Badge follows the Nuxt UI vocabulary: `variant` (solid/outline/soft/subtle) and `size` (xs–xl).
 * `color` is the Nexa name for the status (primary/neutral/success/warning/danger/error); `tone` remains an alias
 * of the same status for existing callers and uses `danger` as its name. Nexa has no solid success or warning
 * token, so those solids fall back to the status soft pair. Only semantic tokens from theme.css are used.
 */
const props = withDefaults(defineProps<{
  variant?: 'solid' | 'outline' | 'soft' | 'subtle';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'error';
  /** Alias of `color` kept for existing callers. `error` is accepted as a synonym of `danger`. */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  class?: string;
}>(), { variant: 'soft', size: 'md', color: undefined, tone: undefined, class: undefined });

const status = computed<'primary' | 'neutral' | 'success' | 'warning' | 'danger'>(() => {
  const c = props.color ?? props.tone ?? 'neutral';
  return c === 'error' ? 'danger' : c;
});

const toneVariant = computed(() => {
  const s = status.value;
  const v = props.variant;
  const solid = {
    primary: 'bg-primary text-primary-foreground',
    neutral: 'bg-foreground text-background',
    danger: 'bg-danger text-danger-foreground',
    success: 'bg-success-soft text-success-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
  }[s];
  const soft = {
    primary: 'bg-surface-muted text-primary',
    neutral: 'bg-neutral-soft text-neutral-soft-foreground',
    danger: 'bg-danger-soft text-danger-soft-foreground',
    success: 'bg-success-soft text-success-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
  }[s];
  const outline = {
    primary: 'text-primary ring-1 ring-inset ring-primary',
    neutral: 'text-foreground ring-1 ring-inset ring-border-strong',
    danger: 'text-danger ring-1 ring-inset ring-danger',
    success: 'text-success-soft-foreground ring-1 ring-inset ring-success-soft-foreground',
    warning: 'text-warning-soft-foreground ring-1 ring-inset ring-warning-soft-foreground',
  }[s];
  const subtle = `${soft} ring-1 ring-inset ring-border`;
  const pick = { solid, soft, outline, subtle }[v];
  return cn('rounded-full', pick);
});

const sizeClass = computed(() => ({
  xs: 'px-1.5 py-0 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
  xl: 'px-3.5 py-1 text-base',
}[props.size]));
</script>
