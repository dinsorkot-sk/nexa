<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useNxLocale, useNxMessages } from '../lib/locale';
import NxCalendarDay, { type NxCalendarDayEvent } from './NxCalendarDay.vue';

export interface NxCalendarEventData extends NxCalendarDayEvent {
  date: string;
}

const props = withDefaults(defineProps<{
  modelValue?: string;
  month?: string;
  events?: NxCalendarEventData[];
  label: string;
  weekStartsOn?: number;
  weeks?: 5 | 6;
  weekdays?: string[];
}>(), {
  modelValue: undefined,
  month: undefined,
  events: () => [],
  weekStartsOn: 0,
  weeks: 6,
  weekdays: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [date: string];
  'update:month': [month: string];
}>();
const locale = useNxLocale();
const messages = useNxMessages();
const currentMonth = new Date().toISOString().slice(0, 7);
const visibleMonth = ref(props.month ?? props.modelValue?.slice(0, 7) ?? currentMonth);
watch(() => props.month, (value) => { if (value) visibleMonth.value = value; });
watch(() => props.modelValue, (value) => {
  if (!props.month && value) visibleMonth.value = value.slice(0, 7);
});

function parseMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

const monthTitle = computed(() => parseMonth(visibleMonth.value).toLocaleDateString(
  locale.value === 'th' ? 'th-TH' : 'en-US',
  { month: 'long', year: 'numeric', timeZone: 'UTC' },
));
const weekdayLabels = computed(() => props.weekdays ?? (
  locale.value === 'th'
    ? ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
));
const days = computed(() => {
  const first = parseMonth(visibleMonth.value);
  const offset = (first.getUTCDay() - props.weekStartsOn + 7) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);
  return Array.from({ length: props.weeks * 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.getUTCDate(),
      isoDate: toIso(date),
      outside: date.getUTCMonth() !== first.getUTCMonth(),
    };
  });
});

/** The days as the weeks a grid is made of. */
const weeksOfDays = computed(() => {
  const out = [];
  for (let index = 0; index < days.value.length; index += 7) out.push(days.value.slice(index, index + 7));
  return out;
});

function moveMonth(amount: number) {
  const month = parseMonth(visibleMonth.value);
  month.setUTCMonth(month.getUTCMonth() + amount);
  visibleMonth.value = toIso(month).slice(0, 7);
  emit('update:month', visibleMonth.value);
}

function eventsFor(date: string) {
  return props.events.filter((event) => event.date === date);
}
</script>

<template>
  <section
    :aria-label="label"
    class="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg"
  >
    <header class="flex items-center justify-between border-b border-ui-border px-3 py-2">
      <h2 class="text-sm font-semibold text-ui-text-highlighted">
        {{ monthTitle }}
      </h2>
      <div class="flex gap-1">
        <button
          type="button"
          :aria-label="messages.prevMonth"
          class="rounded p-1.5 text-ui-text-toned outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary"
          @click="moveMonth(-1)"
        >
          <ChevronLeft
            class="size-4"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          :aria-label="messages.nextMonth"
          class="rounded p-1.5 text-ui-text-toned outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary"
          @click="moveMonth(1)"
        >
          <ChevronRight
            class="size-4"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>
    <div
      role="grid"
      :aria-label="label"
      class="grid grid-cols-7"
    >
      <div
        role="row"
        class="contents"
      >
        <div
          v-for="(weekday, index) in weekdayLabels"
          :key="weekday"
          role="columnheader"
          class="border-b border-ui-border bg-ui-bg-muted px-1 py-2 text-center text-xs font-medium text-ui-text-muted"
        >
          {{ weekdayLabels[(index + weekStartsOn) % weekdayLabels.length] }}
        </div>
      </div>
      <div
        v-for="(week, weekIndex) in weeksOfDays"
        :key="weekIndex"
        role="row"
        class="contents"
      >
        <div
          v-for="day in week"
          :key="day.isoDate"
          role="gridcell"
          class="contents"
        >
          <NxCalendarDay
            :date="day.date"
            :iso-date="day.isoDate"
            :events="eventsFor(day.isoDate)"
            :outside="day.outside"
            :selected="day.isoDate === modelValue"
            :today="day.isoDate === new Date().toISOString().slice(0, 10)"
            :label="day.isoDate"
            @select="emit('update:modelValue', $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>
