<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import { dotColor, tone, type NxColor, type NxSize, type NxVariant } from '../lib/tone';

/** Short status or count label: 7 colours x 4 variants x 3 sizes, as the mockup's Badge section. */
export type BadgeColor = NxColor;
export type BadgeVariant = Extract<NxVariant, 'solid' | 'outline' | 'soft' | 'subtle'>;

/** Padding, gap, icon and dot sizes are the mockup's BADGE table. */
const sizes: Record<NxSize, string> = {
  sm: 'gap-1 px-1.5 py-0.5 text-[11px] [&_svg]:size-2.5',
  md: 'gap-1 px-2 py-1 text-xs [&_svg]:size-3',
  lg: 'gap-1.5 px-2.5 py-1 text-sm [&_svg]:size-3.5',
};

const dotSizes: Record<NxSize, string> = {
  sm: 'size-1.5',
  md: 'size-2',
  lg: 'size-2.5',
};

const props = withDefaults(defineProps<{
  color?: BadgeColor;
  variant?: BadgeVariant;
  size?: NxSize;
  /** Shows a leading dot instead of an icon. */
  dot?: boolean;
  icon?: Component;
}>(), {
  color: 'neutral',
  variant: 'solid',
  size: 'md',
  dot: false,
  icon: undefined,
});

const t = () => tone(props.color, props.variant);
const ui = computed(() => ({
  base: `inline-flex items-center rounded-full font-medium ${sizes[props.size]} ${t().surface} ${t().border} ${t().label}`,
}));
</script>

<template>
  <UBadge
    :color="color"
    :variant="variant"
    :size="size"
    :ui="ui"
  >
    <span
      v-if="dot"
      aria-hidden="true"
      :class="['rounded-full', dotSizes[size], dotColor(color, variant)]"
    />
    <component
      :is="icon"
      v-else-if="icon"
      aria-hidden="true"
      :class="t().icon"
    />
    <slot />
  </UBadge>
</template>
