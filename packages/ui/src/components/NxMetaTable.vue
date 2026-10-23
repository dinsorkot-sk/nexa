<script setup lang="ts">
import type { FieldDefinition, RecordSort, ViewDefinition } from '@nexa/meta';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxButton from './NxButton.vue';
import NxEmptyState from './NxEmptyState.vue';
import NxFieldValue from './NxFieldValue.vue';
import NxPagination from './NxPagination.vue';
import NxSkeleton from './NxSkeleton.vue';
import NxTable, { type NxTableSort } from './NxTable.vue';

/**
 * Renders a view's columns over a page of records.
 *
 * The view says which fields to show, in what order and how wide; the fields say how a value is formatted; the
 * records are the caller's page. The component never fetches: it emits the sort and the page it wants, in the
 * shape the records API takes.
 */
const props = withDefaults(defineProps<{
  /** The view being rendered. Its columns and its sort decide what is shown and in what order. */
  view?: ViewDefinition;
  /** The fields of the entity the view belongs to. */
  fields: FieldDefinition[];
  /** The records of the current page. */
  records?: Array<{ id: string; data: Record<string, unknown> }>;
  /** The total number of records, for the paging. */
  total?: number;
  /** The number of records per page. */
  limit?: number;
  /** The current page, counting from one. */
  page?: number;
  loading?: boolean;
  /** The error to show instead of the table. */
  error?: string;
  /** The caption the table is announced by. The view's name is used without one. */
  caption?: string;
}>(), {
  view: undefined,
  records: () => [],
  total: 0,
  limit: 25,
  page: 1,
  loading: false,
  error: undefined,
  caption: undefined,
});

const emit = defineEmits<{
  'update:sort': [sort: RecordSort[]];
  'update:page': [page: number];
  retry: [];
}>();

const messages = useNxMessages();

/** The view's visible columns, in the view's order, paired with the field that formats them. */
const columns = computed(() => (props.view?.columns ?? [])
  .filter((column) => column.visible !== false)
  .map((column) => {
    const field = props.fields.find((candidate) => candidate.id === column.fieldId);
    return field ? { key: field.id, label: field.label, field, sortable: field.options.sortable !== false } : undefined;
  })
  .filter((column): column is { key: string; label: string; field: FieldDefinition; sortable: boolean } => column !== undefined));

/** The view's sort, as the table takes it. */
const sort = computed<NxTableSort | undefined>(() => {
  const first = props.view?.sort?.[0];
  return first ? { key: first.fieldId, direction: first.direction } : undefined;
});

/** The records, flattened so the table reads a field's value by the column key. */
const rows = computed(() => props.records.map((record) => ({ ...record.data, id: record.id })));

function onSort(next: NxTableSort) {
  emit('update:sort', [{ fieldId: next.key, direction: next.direction }]);
}
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <div
      v-if="props.error"
      role="alert"
      class="flex items-center justify-between gap-3 rounded-ui-lg border border-ui-error bg-ui-error-soft px-4 py-3"
    >
      <p class="text-sm text-ui-error-text">
        {{ props.error }}
      </p>
      <NxButton
        size="sm"
        variant="outline"
        color="error"
        @click="emit('retry')"
      >
        {{ messages.retry }}
      </NxButton>
    </div>

    <NxTable
      :columns="columns"
      :rows="rows"
      :sort="sort"
      :loading="props.loading"
      :caption="props.caption ?? props.view?.name"
      :actions="$slots.actions !== undefined"
      :actions-label="messages.actions"
      @update:sort="onSort"
    >
      <template
        v-for="column in columns"
        :key="column.key"
        #[`cell-${column.key}`]="{ value }"
      >
        <NxFieldValue
          :field="column.field"
          :value="value"
          display="table"
        />
      </template>

      <template #loading>
        <div class="flex flex-col gap-2">
          <NxSkeleton
            v-for="row in 4"
            :key="row"
            class="h-4 w-full"
          />
        </div>
      </template>

      <template
        v-if="$slots.actions"
        #actions="{ row }"
      >
        <slot
          name="actions"
          :record-id="String(row.id)"
        />
      </template>

      <template #empty>
        <NxEmptyState :title="messages.noResults" />
      </template>
    </NxTable>

    <NxPagination
      v-if="props.total > 0"
      :model-value="props.page"
      :total="props.total"
      :page-size="props.limit"
      @update:model-value="(page) => emit('update:page', page)"
    />
  </div>
</template>
