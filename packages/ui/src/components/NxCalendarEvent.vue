<script setup lang="ts">
import { computed } from 'vue';

/** Record shown on its date in the calendar view, as the mockup's CalendarEvent section: a dot plus its title. */
const props = withDefaults(defineProps<{
  label: string;
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
}>(), { color: 'primary' });

// Literal classes per tone: Tailwind only generates what it can read in the source.
const bars: Record<NonNullable<typeof props.color>, string> = {
  primary: 'bg-ui-primary-soft-hover',
  secondary: 'bg-ui-secondary-soft-hover',
  success: 'bg-ui-success-soft-hover',
  info: 'bg-ui-info-soft-hover',
  warning: 'bg-ui-warning-soft-hover',
  error: 'bg-ui-error-soft-hover',
  neutral: 'bg-ui-bg-accented',
};
const dots: Record<NonNullable<typeof props.color>, string> = {
  primary: 'bg-ui-primary',
  secondary: 'bg-ui-secondary',
  success: 'bg-ui-success',
  info: 'bg-ui-info',
  warning: 'bg-ui-warning',
  error: 'bg-ui-error',
  neutral: 'bg-ui-text-muted',
};
const barClass = computed(() => bars[props.color]);
const dotClass = computed(() => dots[props.color]);
</script>

<template>
  <span
    class="flex w-full min-w-0 items-center gap-1 truncate rounded-ui-sm px-1.5 py-0.5 text-xs font-medium text-ui-text-highlighted"
    :class="barClass"
  >
    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="dotClass"
      aria-hidden="true"
    />
    <span class="truncate">{{ label }}</span>
  </span>
</template>
