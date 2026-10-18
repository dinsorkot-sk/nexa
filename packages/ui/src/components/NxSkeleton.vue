<script setup lang="ts">
import { tv } from 'tailwind-variants';

/** Placeholder while content loads, as the mockup's Skeleton section: line, circle or block. */
export type SkeletonShape = 'line' | 'circle' | 'block';

const skeleton = tv({
  base: 'animate-pulse bg-ui-bg-elevated',
  variants: {
    shape: {
      line: 'h-4 rounded-ui',
      circle: 'size-10 rounded-full',
      block: 'h-24 rounded-ui-lg',
    },
  },
  defaultVariants: { shape: 'line' },
});

withDefaults(defineProps<{
  shape?: SkeletonShape;
}>(), { shape: 'line' });
</script>

<template>
  <div
    aria-hidden="true"
    :class="skeleton({ shape })"
  />
</template>
