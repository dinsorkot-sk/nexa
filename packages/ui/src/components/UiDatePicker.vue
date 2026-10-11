<template>
  <DatePickerRoot
    :model-value="calendarValue"
    :locale="calendarLocale"
    :disabled="disabled"
    :min-value="minDate"
    :max-value="maxDate"
    granularity="day"
    :is-date-unavailable="undefined"
    @update:model-value="onPick"
  >
    <DatePickerField
      v-slot="{ segments }"
      :class="cn('flex h-10 w-full items-center gap-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring', disabled && 'cursor-not-allowed opacity-50', invalid && 'border-danger', props.class)"
    >
      <template
        v-for="item in segments"
        :key="item.part"
      >
        <DatePickerInput
          v-if="item.part === 'literal'"
          :part="item.part"
          class="text-foreground-subtle"
        >
          {{ item.value }}
        </DatePickerInput>
        <DatePickerInput
          v-else
          :part="item.part"
          class="rounded px-0.5 focus:bg-primary focus:text-primary-foreground focus:outline-none data-[placeholder]:text-placeholder"
          :aria-describedby="describedBy"
        >
          {{ item.value }}
        </DatePickerInput>
      </template>
      <DatePickerTrigger
        class="ml-auto rounded px-1 text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('datepicker.open')"
        :disabled="disabled"
      >
        ▾
      </DatePickerTrigger>
    </DatePickerField>
    <DatePickerContent
      :side-offset="4"
      class="z-50 rounded-lg border border-border bg-surface p-3 text-foreground shadow-lg"
    >
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="mb-2 flex items-center justify-between">
          <DatePickerPrev
            class="rounded px-2 py-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('datepicker.prev')"
          >
            ‹
          </DatePickerPrev>
          <DatePickerHeading class="text-sm font-medium" />
          <DatePickerNext
            class="rounded px-2 py-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('datepicker.next')"
          >
            ›
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
                class="w-9 text-center text-xs text-foreground-muted"
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
                  class="flex h-8 w-8 items-center justify-center rounded text-sm outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring data-[outside-view]:text-foreground-subtle data-[disabled]:opacity-40 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[today]:font-semibold"
                />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DatePickerCalendar, DatePickerCell, DatePickerCellTrigger, DatePickerContent, DatePickerField, DatePickerGrid, DatePickerGridBody,
  DatePickerGridHead, DatePickerGridRow, DatePickerHeadCell, DatePickerHeader, DatePickerHeading, DatePickerInput, DatePickerNext,
  DatePickerPrev, DatePickerRoot, DatePickerTrigger,
} from 'radix-vue';
import type { DateValue } from '@internationalized/date';
import { cn } from '../cn';
import { calendarDateToIso, isoToCalendarDate } from './date';

const props = withDefaults(defineProps<{
  /** ISO `YYYY-MM-DD`, Gregorian, regardless of display language. */
  modelValue?: string | null;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  class?: string;
}>(), { modelValue: undefined, min: undefined, max: undefined, disabled: false, invalid: false, describedBy: undefined, class: undefined });

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const { t, locale } = useI18n();

/**
 * Thai uses the Buddhist Era by default (2569 for 2026), English uses the Gregorian year. This only changes what is
 * displayed. The value in and out is always the Gregorian ISO string, converted in date.ts.
 */
const calendarLocale = computed(() => (locale.value === 'th' ? 'th-TH' : 'en-US'));
const calendarValue = computed(() => isoToCalendarDate(props.modelValue));
const minDate = computed(() => isoToCalendarDate(props.min));
const maxDate = computed(() => isoToCalendarDate(props.max));

function onPick(value: DateValue | undefined) {
  emit('update:modelValue', calendarDateToIso(value));
}
</script>
