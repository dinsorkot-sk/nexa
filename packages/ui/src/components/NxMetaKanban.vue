<script setup lang="ts">
import type { FieldDefinition, ViewDefinition } from '@nexa/meta';
import { computed, ref } from 'vue';
import { formatFieldDisplay } from '../lib/display';
import { useNxLocale, useNxMessages } from '../lib/locale';
import NxKanbanCard from './NxKanbanCard.vue';

/**
 * The records as a board of columns.
 *
 * The view says which field groups them, which field a card shows as its title, and which fields the rest of the
 * card carries. The columns are the choices of the grouping field when it is a select, and the values the records
 * carry otherwise. Moving a card is an emit: the renderer does not move anything itself.
 */
const props = withDefaults(defineProps<{
  /** The view being rendered. Its group by and its title say how the board is laid out. */
  view: ViewDefinition;
  /** The fields of the entity the view belongs to. */
  fields: FieldDefinition[];
  /** The records to place on the board. */
  records?: Array<{ id: string; data: Record<string, unknown> }>;
  /** The currency the money fields are shown in. */
  currency?: string;
}>(), {
  records: () => [],
  currency: undefined,
});

const emit = defineEmits<{
  open: [recordId: string];
  move: [recordId: string, group: string];
}>();

const locale = useNxLocale();
const messages = useNxMessages();

/** The field the view groups the records by. */
const groupField = computed(() => props.fields.find((field) => field.id === props.view.groupBy));

/** The field a card shows as its title: the view's title field, or its first visible column. */
const titleField = computed(() => {
  const named = props.view.titleField ? props.fields.find((field) => field.id === props.view.titleField) : undefined;
  if (named) return named;
  const first = props.view.columns.find((column) => column.visible !== false);
  return first ? props.fields.find((field) => field.id === first.fieldId) : undefined;
});

/** The other fields a card carries: the view's visible columns, without the title. */
const cardFields = computed(() => props.view.columns
  .filter((column) => column.visible !== false)
  .map((column) => props.fields.find((field) => field.id === column.fieldId))
  .filter((field): field is FieldDefinition => field !== undefined)
  .filter((field) => field.id !== titleField.value?.id));

/** The columns of the board. */
const groups = computed(() => {
  const choices = groupField.value?.options.choices ?? [];
  if (choices.length) return choices.map((choice) => ({ value: choice.value, label: choice.label }));
  const seen = new Map<string, string>();
  for (const record of props.records) {
    const value = String(record.data[groupField.value?.id ?? ''] ?? '');
    if (value && !seen.has(value)) seen.set(value, value);
  }
  return [...seen].map(([value, label]) => ({ value, label }));
});

/** The records of each column, in the order the columns were declared. */
const columns = computed(() => groups.value.map((group) => ({
  ...group,
  records: props.records.filter((record) => String(record.data[groupField.value?.id ?? ''] ?? '') === group.value),
})));

function display(field: FieldDefinition, value: unknown): string {
  return formatFieldDisplay(field, value, {
    locale: locale.value,
    currency: props.currency,
    empty: messages.value.empty,
    yes: messages.value.yes,
    no: messages.value.no,
  });
}

function titleOf(record: { data: Record<string, unknown> }): string {
  const field = titleField.value;
  return field ? display(field, record.data[field.id]) : '';
}

/** The card being dragged, so it can be lifted while it is held. */
const dragging = ref<string | undefined>();

function onDragStart(recordId: string, event: DragEvent) {
  dragging.value = recordId;
  event.dataTransfer?.setData('text/plain', recordId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDrop(group: string, event: DragEvent) {
  const recordId = event.dataTransfer?.getData('text/plain') || dragging.value;
  dragging.value = undefined;
  if (recordId) emit('move', recordId, group);
}
</script>

<template>
  <div class="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
    <section
      v-for="column in columns"
      :key="column.value"
      class="flex min-w-0 flex-col gap-2 rounded-ui-lg bg-ui-bg-muted p-2"
      :aria-label="column.label"
      @dragover.prevent
      @drop="onDrop(column.value, $event)"
    >
      <h3 class="px-1 text-xs font-semibold text-ui-text-muted">
        {{ column.label }}
        <span class="tabular-nums text-ui-text-dimmed">({{ column.records.length }})</span>
      </h3>
      <div class="flex flex-col gap-2">
        <NxKanbanCard
          v-for="record in column.records"
          :key="record.id"
          :title="titleOf(record)"
          :status="column.label"
          :description="cardFields[0] ? display(cardFields[0], record.data[cardFields[0].id]) : undefined"
          :meta="cardFields[1] ? display(cardFields[1], record.data[cardFields[1].id]) : undefined"
          :state="dragging === record.id ? 'dragging' : 'default'"
          draggable="true"
          @click="emit('open', record.id)"
          @dragstart="onDragStart(record.id, $event)"
          @dragend="dragging = undefined"
        />
      </div>
    </section>
  </div>
</template>
