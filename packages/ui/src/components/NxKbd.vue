<script setup lang="ts">
import { tv } from 'tailwind-variants';

/** Keyboard shortcut hint, as the mockup's Kbd section: 3 variants x 3 sizes. */
export type KbdVariant = 'subtle' | 'outline' | 'solid';
export type KbdSize = 'sm' | 'md' | 'lg';

const kbd = tv({
  base: 'inline-flex items-center rounded-ui-sm font-mono',
  variants: {
    variant: {
      subtle: 'border border-ui-border bg-ui-bg-elevated text-ui-text-muted',
      outline: 'border border-ui-border-accented bg-ui-bg text-ui-text-toned',
      solid: 'bg-ui-bg-inverted text-ui-text-inverted',
    },
    size: {
      sm: 'px-1.5 py-px text-[11px]',
      md: 'px-1.5 py-0.5 text-xs',
      lg: 'px-2 py-0.5 text-sm',
    },
  },
  defaultVariants: { variant: 'subtle', size: 'md' },
});

withDefaults(defineProps<{
  variant?: KbdVariant;
  size?: KbdSize;
}>(), { variant: 'subtle', size: 'md' });
</script>

<template>
  <kbd :class="kbd({ variant, size })">
    <slot />
  </kbd>
</template>
