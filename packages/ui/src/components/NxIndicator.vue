<script setup lang="ts">
import { computed } from 'vue';
import { dotColor, indicatorTone, type NxColor, type NxSize } from '../lib/tone';

/**
 * Notification dot or count that sits on the corner of a host (button, avatar, icon): the mockup's Indicator
 * section. Place it with absolute positioning over the host. Give it a `label` when the count alone would not
 * be understood out of context.
 */
export type IndicatorContent = 'dot' | 'count';

const dots: Record<NxSize, string> = { sm: 'size-2', md: 'size-2.5', lg: 'size-3' };
const counts: Record<NxSize, string> = {
  sm: 'h-3.5 min-w-3.5 px-1 text-[11px]',
  md: 'h-4 min-w-4 px-1 text-[11px]',
  lg: 'h-5 min-w-5 px-1 text-xs',
};

const props = withDefaults(defineProps<{
  color?: NxColor;
  size?: NxSize;
  /** `dot` is a plain marker, `count` shows the number. */
  content?: IndicatorContent;
  count?: number;
  /** Largest number shown; anything above becomes `${max}+`, as a notification badge usually does. */
  max?: number;
  /** Accessible name. Defaults to the count. */
  label?: string;
}>(), {
  color: 'primary',
  size: 'md',
  content: 'dot',
  count: 0,
  max: 99,
  label: undefined,
});

const text = computed(() => (props.count > props.max ? `${props.max}+` : String(props.count)));
const fill = computed(() => (props.content === 'count' ? indicatorTone(props.color).fill : dotColor(props.color, 'solid')));
const labelColor = computed(() => indicatorTone(props.color).label);
</script>

<template>
  <span
    :aria-label="label ?? (content === 'count' ? text : undefined)"
    :role="content === 'count' ? 'status' : undefined"
    :class="[
      'inline-flex items-center justify-center rounded-full font-medium ring-2 ring-ui-bg',
      content === 'count' ? counts[size] : dots[size],
      fill,
      content === 'count' ? labelColor : '',
    ]"
  >
    <template v-if="content === 'count'">
      {{ text }}
    </template>
  </span>
</template>
