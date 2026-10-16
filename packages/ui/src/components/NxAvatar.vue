<script setup lang="ts">
import { computed } from 'vue';
import { tv } from 'tailwind-variants';

const avatar = tv({
  base: 'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-ui-bg-accented font-medium text-ui-text-toned',
  variants: {
    size: {
      sm: 'size-6 text-[10px]',
      md: 'size-8 text-xs',
    },
  },
  defaultVariants: { size: 'md' },
});

const props = withDefaults(defineProps<{
  /** Image URL. The caller is responsible for it being a safe http(s) URL (see lib/safe-url). */
  src?: string;
  /** Text for the image, or the name the initials are taken from when there is no image. */
  name?: string;
  size?: 'sm' | 'md';
}>(), { src: undefined, name: '', size: 'md' });

const initials = computed(() => props.name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word.charAt(0).toUpperCase())
  .join(''));
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    :class="avatar({ size })"
  >
  <span
    v-else
    role="img"
    :aria-label="name || undefined"
    :class="avatar({ size })"
  >{{ initials }}</span>
</template>
