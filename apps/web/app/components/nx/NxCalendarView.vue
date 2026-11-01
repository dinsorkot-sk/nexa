<script setup lang="ts">
interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  color?: 'primary' | 'secondary' | 'warning' | 'error';
}

const props = withDefaults(defineProps<{
  events: CalendarEvent[];
}>(), {});

const { t } = useI18n();
const cursor = ref(() => new Date());

const year = computed(() => cursor.value.getFullYear());
const month = computed(() => cursor.value.getMonth());

const days = computed(() => {
  const first = new Date(year.value, month.value, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(year.value, month.value, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return cells;
});

const todayKey = computed(() => new Date().toDateString());

const colorMap: Record<string, string> = {
  primary: 'bg-[--ui-primary-soft] text-[--ui-primary-text] border-[--ui-primary]/30',
  secondary: 'bg-[--ui-secondary-soft] text-[--ui-secondary-text] border-[--ui-secondary]/30',
  warning: 'bg-[--ui-warning-soft] text-[--ui-warning-text] border-[--ui-warning]/30',
  error: 'bg-[--ui-error-soft] text-[--ui-error-text] border-[--ui-error]/30',
};

function eventsFor(day: Date): CalendarEvent[] {
  const key = day.toDateString();
  return props.events.filter((e) => new Date(e.start).toDateString() === key);
}

function move(delta: number) {
  cursor.value = new Date(year.value, month.value + delta, 1);
}

const weekdays = computed(() => {
  const base = new Date(2026, 9, 12); // Monday
  return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(useI18n().locale.value === 'en' ? 'en-US' : 'th-TH', { weekday: 'short' }).format(new Date(base.getTime() + i * 86400000)));
});
</script>

<template>
  <div class="flex flex-col gap-3 rounded-xl border border-default bg-default p-4">
    <div class="flex items-center justify-between">
      <p class="text-nexa-subheading text-highlighted">
        {{ new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(cursor) }}
        <span class="text-nexa-caption text-dimmed">{{ `(${year + 543})` }}</span>
      </p>
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" variant="ghost" size="sm" square :aria-label="t('common.previous')" @click="move(-1)" />
        <UButton icon="i-lucide-chevron-right" variant="ghost" size="sm" square :aria-label="t('common.next')" @click="move(1)" />
      </div>
    </div>
    <div class="grid grid-cols-7 gap-1">
      <p v-for="d in weekdays" :key="d" class="pb-1 text-center text-nexa-caption text-dimmed">{{ d }}</p>
      <div
        v-for="(day, i) in days" :key="i"
        class="min-h-[72px] rounded-md border p-1"
        :class="[
          day.getMonth() !== month ? 'border-default bg-[--ui-bg-muted] text-dimmed' : 'border-default bg-default',
          day.toDateString() === todayKey ? 'ring-1 ring-[--ui-primary]' : '',
        ]"
      >
        <p class="px-1 text-nexa-caption" :class="day.toDateString() === todayKey ? 'font-semibold text-[--ui-primary-text]' : 'text-muted'">{{ day.getDate() }}</p>
        <div class="flex flex-col gap-0.5">
          <span
            v-for="ev in eventsFor(day).slice(0, 2)"
            :key="ev.id"
            class="truncate rounded border px-1 text-nexa-caption"
            :class="colorMap[ev.color ?? 'primary']"
          >
            {{ ev.title }}
          </span>
          <span v-if="eventsFor(day).length > 2" class="px-1 text-nexa-caption text-dimmed">+{{ eventsFor(day).length - 2 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
