<script setup lang="ts">
import type { FieldDefinition, ViewDefinition } from '@nexa/meta';
import { computed } from 'vue';
import { formatFieldDisplay } from '../lib/display';
import { useNxLocale, useNxMessages } from '../lib/locale';
import NxCalendarView, { type NxCalendarEventData } from './NxCalendarView.vue';

/**
 * The records on a month, with the records of the selected day listed underneath.
 *
 * The view says which field carries the date and which field is the title of an event. The month and the selected
 * day are the caller's, so the renderer emits what it wants to move to and draws what it was given.
 */
const props = withDefaults(defineProps<{
  /** The view being rendered. Its date field says where a record sits on the month. */
  view: ViewDefinition;
  /** The fields of the entity the view belongs to. */
  fields: FieldDefinition[];
  /** The records to place on the month. */
  records?: Array<{ id: string; data: Record<string, unknown> }>;
  /** The month being shown, as `YYYY-MM`. */
  month?: string;
  /** The selected day, as `YYYY-MM-DD`. */
  selectedDate?: string;
  /** The currency the money fields are shown in. */
  currency?: string;
}>(), {
  records: () => [],
  month: undefined,
  selectedDate: undefined,
  currency: undefined,
});

const emit = defineEmits<{
  'update:month': [month: string];
  'update:selectedDate': [date: string];
  open: [recordId: string];
}>();

const locale = useNxLocale();
const messages = useNxMessages();

/** The field the records carry their date in: the view's date field, or the first date field of the entity. */
const dateField = computed(() => {
  const named = props.view.dateField ? props.fields.find((field) => field.id === props.view.dateField) : undefined;
  if (named) return named;
  return props.fields.find((field) => field.type === 'date' || field.type === 'datetime');
});

/** The field an event shows as its title: the view's title field, or its first visible column. */
const titleField = computed(() => {
  const named = props.view.titleField ? props.fields.find((field) => field.id === props.view.titleField) : undefined;
  if (named) return named;
  const first = props.view.columns.find((column) => column.visible !== false);
  return first ? props.fields.find((field) => field.id === first.fieldId) : undefined;
});

function display(field: FieldDefinition, value: unknown): string {
  return formatFieldDisplay(field, value, {
    locale: locale.value,
    currency: props.currency,
    empty: messages.value.empty,
    yes: messages.value.yes,
    no: messages.value.no,
  });
}

/** The day a record sits on, as `YYYY-MM-DD`. */
function dateOf(record: { data: Record<string, unknown> }): string {
  const field = dateField.value;
  if (!field) return '';
  const value = record.data[field.id];
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function titleOf(record: { data: Record<string, unknown> }): string {
  const field = titleField.value;
  return field ? display(field, record.data[field.id]) : '';
}

/** The events of the month, one per record. */
const events = computed<NxCalendarEventData[]>(() => props.records
  .map((record) => ({ id: record.id, date: dateOf(record), label: titleOf(record) }))
  .filter((event) => event.date !== ''));

/** The records of the selected day. */
const dayRecords = computed(() => props.records.filter((record) => dateOf(record) === props.selectedDate));
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <NxCalendarView
      :model-value="props.selectedDate"
      :month="props.month"
      :events="events"
      :label="props.view.name"
      @update:model-value="(date) => emit('update:selectedDate', date)"
      @update:month="(month) => emit('update:month', month)"
    />
    <div
      v-if="props.selectedDate"
      class="flex flex-col gap-2"
    >
      <h3 class="text-sm font-semibold text-ui-text-highlighted">
        {{ messages.recordsOn }}
        <span class="font-normal text-ui-text-muted">{{ props.selectedDate }}</span>
      </h3>
      <ul
        v-if="dayRecords.length"
        class="flex flex-col gap-1"
      >
        <li
          v-for="record in dayRecords"
          :key="record.id"
        >
          <button
            type="button"
            class="rounded text-sm text-ui-text underline-offset-2 outline-none hover:text-ui-primary hover:underline focus-visible:ring-2 focus-visible:ring-ui-primary"
            @click="emit('open', record.id)"
          >
            {{ titleOf(record) }}
          </button>
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-ui-text-muted"
      >
        {{ messages.noResults }}
      </p>
    </div>
  </div>
</template>
