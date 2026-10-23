<script setup lang="ts">
import type { FieldDefinition, ViewDefinition } from '@nexa/meta';
import { GripVertical } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { formatFieldDisplay } from '../lib/display';
import { useNxLocale, useNxMessages } from '../lib/locale';
import NxKanbanCard from './NxKanbanCard.vue';
import NxMenu from './NxMenu.vue';

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

/** The columns a card can move to: every column but the one it is in. */
function moveItems(current: string) {
  return groups.value
    .filter((group) => group.value !== current)
    .map((group) => ({ value: group.value, label: group.label }));
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

const rootRef = ref<HTMLElement | null>(null);
/** The card the keyboard is on; the board is one tab stop and the arrow keys move between its cards. */
const activeRecord = ref<string | undefined>();

const recordIds = computed(() => columns.value.flatMap((column) => column.records.map((record) => record.id)));
const tabStop = computed(() => (
  activeRecord.value && recordIds.value.includes(activeRecord.value)
    ? activeRecord.value
    : recordIds.value[0]
));

function focusRecord(recordId: string) {
  activeRecord.value = recordId;
  const cards = rootRef.value?.querySelectorAll<HTMLElement>('[data-record-id]') ?? [];
  for (const card of cards) {
    if (card.dataset.recordId === recordId) {
      card.focus();
      return;
    }
  }
}

/** The nearest non-empty column in a direction, so a board with an empty column still moves. */
function neighbour(columnIndex: number, step: number, recordIndex: number): string | undefined {
  for (let index = columnIndex + step; index >= 0 && index < columns.value.length; index += step) {
    const records = columns.value[index]?.records ?? [];
    if (records.length) return records[Math.min(recordIndex, records.length - 1)]?.id;
  }
  return undefined;
}

function onCardKeydown(columnIndex: number, recordIndex: number, event: KeyboardEvent) {
  // A key pressed on the title button or the move menu belongs to it, not to the board.
  if (event.target !== event.currentTarget) return;
  const column = columns.value[columnIndex];
  const record = column?.records[recordIndex];
  if (!column || !record) return;
  let target: string | undefined;
  switch (event.key) {
    case 'ArrowDown': target = column.records[Math.min(recordIndex + 1, column.records.length - 1)]?.id; break;
    case 'ArrowUp': target = column.records[Math.max(recordIndex - 1, 0)]?.id; break;
    case 'Home': target = column.records[0]?.id; break;
    case 'End': target = column.records[column.records.length - 1]?.id; break;
    case 'ArrowRight': target = neighbour(columnIndex, 1, recordIndex); break;
    case 'ArrowLeft': target = neighbour(columnIndex, -1, recordIndex); break;
    case 'Enter':
    case ' ': event.preventDefault(); emit('open', record.id); return;
    default: return;
  }
  if (!target) return;
  event.preventDefault();
  focusRecord(target);
}
</script>

<template>
  <div
    ref="rootRef"
    class="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4"
  >
    <section
      v-for="(column, columnIndex) in columns"
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
          v-for="(record, recordIndex) in column.records"
          :key="record.id"
          :title="titleOf(record)"
          :title-tabindex="-1"
          :status="column.label"
          :description="cardFields[0] ? display(cardFields[0], record.data[cardFields[0].id]) : undefined"
          :meta="cardFields[1] ? display(cardFields[1], record.data[cardFields[1].id]) : undefined"
          :state="dragging === record.id ? 'dragging' : 'default'"
          :tabindex="tabStop === record.id ? 0 : -1"
          :data-record-id="record.id"
          draggable="true"
          @click="emit('open', record.id)"
          @focus="activeRecord = record.id"
          @keydown="onCardKeydown(columnIndex, recordIndex, $event)"
          @dragstart="onDragStart(record.id, $event)"
          @dragend="dragging = undefined"
        >
          <template
            v-if="moveItems(column.value).length"
            #actions
          >
            <NxMenu
              compact
              align="end"
              :label="messages.move(titleOf(record))"
              :items="moveItems(column.value)"
              @select="emit('move', record.id, $event)"
            >
              <template #trigger>
                <GripVertical
                  class="size-3.5"
                  aria-hidden="true"
                />
              </template>
            </NxMenu>
          </template>
        </NxKanbanCard>
      </div>
    </section>
  </div>
</template>
