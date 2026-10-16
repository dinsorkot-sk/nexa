<script setup lang="ts">
import type { DateValue } from '@internationalized/date';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import {
  DatePickerCalendar, DatePickerCell, DatePickerCellTrigger, DatePickerContent, DatePickerField, DatePickerGrid, DatePickerGridBody,
  DatePickerGridHead, DatePickerGridRow, DatePickerHeadCell, DatePickerHeader, DatePickerHeading, DatePickerInput, DatePickerNext,
  DatePickerPrev, DatePickerRoot, DatePickerTrigger,
} from 'reka-ui';
import { computed, ref } from 'vue';
import { calendarDateToIso, isoToCalendarDate } from '../lib/date';
import { useNxLocale, useNxMessages } from '../lib/locale';

/**
 * Date picker. The value in and out is an ISO `YYYY-MM-DD` string in the Gregorian calendar. The display follows the
 * app locale: Thai shows the Buddhist Era year. Choosing a day closes the calendar, and keyboard use works in the
 * segments and in the open calendar.
 */
const props = withDefaults(defineProps<{
  modelValue?: string | null;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  id?: string;
  describedBy?: string;
}>(), {
  modelValue: undefined,
  min: undefined,
  max: undefined,
  disabled: false,
  invalid: false,
  id: undefined,
  describedBy: undefined,
});

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const locale = useNxLocale();
const messages = useNxMessages();

const calendarLocale = computed(() => (locale.value === 'th' ? 'th-TH' : 'en-US'));
const calendarValue = computed(() => isoToCalendarDate(props.modelValue));
const minDate = computed(() => isoToCalendarDate(props.min));
const maxDate = computed(() => isoToCalendarDate(props.max));

/**
 * Month and year for the calendar heading, in the display language. Reka formats it from the value's own calendar,
 * which is always Gregorian here. Formatting it in the field's locale keeps the two consistent. Only the text changes.
 */
function headingText(month: DateValue | undefined): string {
  if (!month) return '';
  return new Intl.DateTimeFormat(calendarLocale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month.toDate('UTC'));
}

const open = ref(false);

function onPick(value: DateValue | undefined) {
  emit('update:modelValue', calendarDateToIso(value));
  // A chosen day closes the calendar, and focus returns to the trigger whether the pick was by mouse or keyboard.
  if (value) open.value = false;
}
</script>

<template>
  <DatePickerRoot
    v-model:open="open"
    :model-value="calendarValue"
    :locale="calendarLocale"
    :disabled="disabled"
    :min-value="minDate"
    :max-value="maxDate"
    granularity="day"
    @update:model-value="onPick"
  >
    <DatePickerField
      v-slot="{ segments }"
      :class="[
        'flex h-9 w-full items-center gap-1 rounded-ui border bg-ui-bg px-3 text-sm text-ui-text-highlighted focus-within:ring-2 focus-within:ring-ui-primary/50',
        invalid ? 'border-ui-error' : 'border-ui-border-accented',
        disabled && 'cursor-not-allowed opacity-50',
      ]"
    >
      <template
        v-for="item in segments"
        :key="item.part"
      >
        <DatePickerInput
          v-if="item.part === 'literal'"
          :part="item.part"
          class="text-ui-text-muted"
        >
          {{ item.value }}
        </DatePickerInput>
        <DatePickerInput
          v-else
          :id="item.part === 'day' ? id : undefined"
          :part="item.part"
          :aria-label="item.part"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          class="rounded px-0.5 outline-none focus:bg-ui-primary focus:text-ui-on-solid data-[placeholder]:text-ui-text-muted"
        >
          {{ item.value }}
        </DatePickerInput>
      </template>
      <DatePickerTrigger
        :aria-label="messages.openCalendar"
        :disabled="disabled"
        class="ml-auto rounded px-1 text-ui-text-muted outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
      >
        <CalendarDays
          class="size-4"
          aria-hidden="true"
        />
      </DatePickerTrigger>
    </DatePickerField>
    <DatePickerContent
      :side-offset="4"
      class="z-50 rounded-ui border border-ui-border bg-ui-bg p-3 text-ui-text shadow-lg"
    >
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="mb-2 flex items-center justify-between">
          <DatePickerPrev
            :aria-label="messages.prevMonth"
            class="rounded p-1 text-ui-text-muted outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary"
          >
            <ChevronLeft
              class="size-4"
              aria-hidden="true"
            />
          </DatePickerPrev>
          <DatePickerHeading class="text-sm font-medium text-ui-text-highlighted">
            {{ headingText(grid[0]?.value) }}
          </DatePickerHeading>
          <DatePickerNext
            :aria-label="messages.nextMonth"
            class="rounded p-1 text-ui-text-muted outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary"
          >
            <ChevronRight
              class="size-4"
              aria-hidden="true"
            />
          </DatePickerNext>
        </DatePickerHeader>
        <DatePickerGrid
          v-for="month in grid"
          :key="month.value.toString()"
          class="w-full border-collapse"
        >
          <DatePickerGridHead>
            <DatePickerGridRow class="flex">
              <DatePickerHeadCell
                v-for="day in weekDays"
                :key="day"
                class="w-9 text-center text-xs text-ui-text-muted"
              >
                {{ day }}
              </DatePickerHeadCell>
            </DatePickerGridRow>
          </DatePickerGridHead>
          <DatePickerGridBody>
            <DatePickerGridRow
              v-for="(weekDates, index) in month.rows"
              :key="`week-${index}`"
              class="flex"
            >
              <DatePickerCell
                v-for="weekDate in weekDates"
                :key="weekDate.toString()"
                :date="weekDate"
                class="p-0.5"
              >
                <DatePickerCellTrigger
                  :day="weekDate"
                  :month="month.value"
                  class="flex h-8 w-8 items-center justify-center rounded-ui-sm text-sm text-ui-text outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary data-[outside-view]:text-ui-text-muted data-[disabled]:opacity-40 data-[selected]:bg-ui-primary data-[selected]:text-ui-on-solid data-[today]:font-semibold"
                />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>
