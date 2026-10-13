<template>
  <section :class="cn(variantClass, 'rounded-xl p-5 text-foreground', props.class)">
    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

/**
 * `card` is the elevated container for a distinct, selectable, or summary group. `flat` groups related content
 * without a shadow, for sections on a page where design.md §3.3 says a box would add noise (for example a
 * section inside a detail page). Both use semantic surface and border tokens only.
 */
const props = withDefaults(defineProps<{ variant?: 'card' | 'flat'; class?: string }>(), { variant: 'card', class: undefined });

const variantClass = computed(() => (props.variant === 'flat'
  ? 'border border-border bg-surface-muted'
  : 'border border-border bg-surface shadow-sm'));
</script>
