<script setup lang="ts">
import NxCalendarEvent from './NxCalendarEvent.vue';

export interface NxCalendarDayEvent {
  id: string;
  label: string;
  color?: 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
}

defineProps<{
  date: number;
  isoDate: string;
  events?: NxCalendarDayEvent[];
  outside?: boolean;
  selected?: boolean;
  today?: boolean;
  label: string;
}>();

const emit = defineEmits<{ select: [date: string] }>();
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :aria-pressed="selected || undefined"
    :class="[
      'flex h-26 min-w-0 flex-col items-stretch gap-1 border-r border-b border-ui-border p-1.5 text-left outline-none hover:bg-ui-bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ui-primary',
      outside && 'bg-ui-bg-muted',
    ]"
    @click="emit('select', isoDate)"
  >
    <span
      :class="[
        'ml-auto inline-flex size-[22px] items-center justify-center rounded-full text-xs font-medium tabular-nums',
        (selected || today) && 'bg-ui-primary text-ui-on-solid',
        !selected && !today && (outside ? 'text-ui-text-dimmed' : 'text-ui-text'),
      ]"
    >{{ date }}</span>
    <NxCalendarEvent
      v-for="event in (events ?? []).slice(0, 2)"
      :key="event.id"
      :label="event.label"
      :color="event.color"
    />
    <span
      v-if="(events?.length ?? 0) > 2"
      class="px-1 text-[10px] text-ui-text-muted"
    >+{{ events!.length - 2 }}</span>
  </button>
</template>
