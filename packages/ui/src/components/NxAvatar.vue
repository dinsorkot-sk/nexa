<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';
import { tv } from 'tailwind-variants';

/** User or entity avatar, as the mockup's Avatar section: 5 sizes x 2 colours, with image, initials or icon. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const avatar = tv({
  base: 'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium',
  variants: {
    size: {
      xs: 'size-5 text-[11px] [&_svg]:size-2.5',
      sm: 'size-6 text-[11px] [&_svg]:size-3',
      md: 'size-8 text-xs [&_svg]:size-4',
      lg: 'size-10 text-sm [&_svg]:size-5',
      xl: 'size-12 text-base [&_svg]:size-6',
    },
    color: {
      neutral: 'bg-ui-bg-accented text-ui-text-toned',
      primary: 'bg-ui-primary-soft-hover text-ui-text-highlighted',
    },
  },
  defaultVariants: { size: 'md', color: 'neutral' },
});

const props = withDefaults(defineProps<{
  /** Image URL. The caller is responsible for it being a safe http(s) URL (see lib/safe-url). */
  src?: string;
  /** Text for the image, or the name the initials are taken from when there is no image. */
  name?: string;
  size?: AvatarSize;
  color?: 'neutral' | 'primary';
  /** Shown instead of the initials, for an entity avatar that stands for a type rather than a person. */
  icon?: Component;
}>(), {
  src: undefined,
  name: '',
  size: 'md',
  color: 'neutral',
  icon: undefined,
});

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
    :class="avatar({ size, color })"
  >
  <span
    v-else
    role="img"
    :aria-label="name || undefined"
    :class="avatar({ size, color })"
  >
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
    />
    <template v-else>{{ initials }}</template>
  </span>
</template>
