<script setup lang="ts">
/**
 * Nexa mark, and the wordmark next to it. The two leaf shapes are the brand asset from the mockup's Logo
 * component, drawn at a 28px viewBox and scaled to the requested size; do not recolour them.
 */
export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoType = 'mark' | 'full';

const marks: Record<LogoSize, string> = { sm: 'size-6', md: 'size-8', lg: 'size-12' };
const wordmarks: Record<LogoSize, string> = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl' };

withDefaults(defineProps<{
  type?: LogoType;
  size?: LogoSize;
  /** Accessible name of the mark. Set it when the wordmark is not rendered next to it. */
  label?: string;
}>(), {
  type: 'mark',
  size: 'md',
  label: 'Nexa',
});
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg
      :class="marks[size]"
      viewBox="0 0 28 28"
      role="img"
      :aria-label="label"
      fill="none"
    >
      <rect
        class="fill-ui-brand-a"
        width="11"
        height="25"
        rx="5.5"
        transform="matrix(0.70711 -0.70711 0.70711 0.70711 1.27208 9.05025)"
      />
      <rect
        class="fill-ui-brand-b"
        width="11"
        height="25"
        rx="5.5"
        transform="matrix(0.70711 0.70711 -0.70711 0.70711 18.94975 1.27208)"
      />
    </svg>
    <span
      v-if="type === 'full'"
      :class="['font-semibold text-ui-text-highlighted', wordmarks[size]]"
      aria-hidden="true"
    >Nexa</span>
  </span>
</template>
