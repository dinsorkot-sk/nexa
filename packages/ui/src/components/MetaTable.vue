<template>
  <div class="w-full">
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="border-b border-border">
          <th
            v-for="column in columns"
            :key="column.field.id"
            :style="{ width: column.width ? `${column.width}px` : undefined }"
            :class="['px-3 text-left font-medium text-foreground-muted', cellPadding]"
            :aria-sort="sortable && isSortable(column.field) ? ariaSort(column.field.id) : undefined"
          >
            <button
              v-if="sortable && isSortable(column.field)"
              type="button"
              class="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="sortLabel(column)"
              @click="toggleSort(column.field.id)"
            >
              <span>{{ column.field.label }}</span>
              <span
                aria-hidden="true"
                class="inline-block w-3"
              >{{ sortIcon(column.field.id) }}</span>
            </button>
            <template v-else>
              <span :id="`${tableId}-col-${column.field.id}`">{{ column.field.label }}</span>
            </template>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr
            v-for="row in skeletonRows"
            :key="`skeleton-${row}`"
            :aria-hidden="true"
          >
            <td
              v-for="column in columns"
              :key="column.field.id"
              :class="['px-3', cellPadding]"
            >
              <UiSkeleton class="h-4 w-full max-w-32" />
            </td>
          </tr>
        </template>
        <template v-else-if="error">
          <tr>
            <td
              :colspan="columns.length"
              class="px-3 py-8"
            >
              <UiAlert
                tone="danger"
              >
                {{ error }}
              </UiAlert>
              <UiButton
                v-if="retry"
                class="mt-3"
                color="neutral"
                size="sm"
                @click="retry"
              >
                {{ t('table.retry') }}
              </UiButton>
            </td>
          </tr>
        </template>
        <template v-else-if="!rows.length">
          <tr>
            <td
              :colspan="columns.length"
              class="px-3 py-8"
            >
              <UiEmptyState>
                {{ emptyTitle }}
                <template #description>
                  {{ emptyDescription }}
                </template>
              </UiEmptyState>
            </td>
          </tr>
        </template>
        <template v-else>
          <tr
            v-for="row in rows"
            :key="row.id"
            :class="clickable ? 'cursor-pointer hover:bg-surface-muted focus-within:bg-surface-muted' : ''"
            @click="clickable && emit('rowClick', { row })"
            @keydown.enter="clickable && emit('rowClick', { row })"
          >
            <td
              v-for="column in columns"
              :key="column.field.id"
              :class="['px-3 align-middle', cellPadding]"
              :tabindex="clickable && column === columns[0] ? 0 : undefined"
            >
              <MetaFieldValue
                :field="column.field"
                :value="row.data[column.field.id]"
                :reference-label="referenceLabel"
                :currency="currency"
              />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldDefinition } from '@nexa/meta';
import MetaFieldValue from './MetaFieldValue.vue';
import UiAlert from './UiAlert.vue';
import UiButton from './UiButton.vue';
import UiEmptyState from './UiEmptyState.vue';
import UiSkeleton from './UiSkeleton.vue';
import type { MetaReferenceLabel, MetaTablePage, MetaTableRowClick, MetaTableSort } from './table';

/**
 * Server-side table: the caller queries the records API and hands over the page. This component
 * never fetches. Sorting toggles emit `update:sort`; the caller refetches.
 */
const props = defineProps<{
  /** Fields to show, in order — the caller derives this from the view's columns and filters hidden fields out. */
  columns: Array<{ field: FieldDefinition; width?: number }>;
  page: MetaTablePage;
  loading?: boolean;
  error?: string | null;
  /** Present enables the retry button after an error. */
  retry?: () => void;
  sort?: MetaTableSort;
  /** Emits sort toggles only when true. */
  sortable?: boolean;
  /** Which field types the API can sort on; others render a plain header. Defaults to all but json/json/array. */
  sortableTypes?: string[];
  /** Resolves reference ids to labels for display. */
  referenceLabel?: MetaReferenceLabel;
  /** Currency for `currency` fields. */
  currency?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Row click/Enter opens the record; also puts a focusable cell in the first column. */
  clickable?: boolean;
  /**
   * Row density. `comfortable` (36 px rows, measured) is the default and matches existing callers; `compact` (28 px, measured) suits
   * scan-heavy screens. Both use the same token-based classes, so the choice is per table, not per cell.
   */
  density?: 'comfortable' | 'compact';
  class?: string;
}>();

const emit = defineEmits<{
  'update:sort': [sort: MetaTableSort];
  rowClick: [click: MetaTableRowClick];
}>();

const { t } = useI18n();
const tableId = useId();
const rows = computed(() => (props.loading ? [] : props.page.items));
const skeletonRows = 5;
const clickable = computed(() => Boolean(props.clickable));
// Vertical padding only: horizontal padding stays px-3 so column alignment is identical in both densities.
const cellPadding = computed(() => (props.density === 'compact' ? 'py-1' : 'py-2'));
/**
 * Hidden fields never render, even if a caller passes them: the server redacts them from
 * responses, and the table must not become the place they leak from.
 */
const columns = computed(() => props.columns.filter((column) => !column.field.options.hidden));

const defaultSortableTypes = new Set(['text', 'textarea', 'number', 'integer', 'decimal', 'currency', 'percentage', 'date', 'datetime', 'time', 'select', 'boolean', 'email', 'phone', 'url', 'autoNumber']);
const sortableTypes = computed(() => new Set(props.sortableTypes ?? defaultSortableTypes));

function isSortable(field: FieldDefinition): boolean {
  return sortableTypes.value.has(field.type);
}

function toggleSort(fieldId: string): void {
  if (!props.sortable) return;
  const current = props.sort;
  if (!current || current.fieldId !== fieldId) {
    emit('update:sort', { fieldId, direction: 'asc' });
  } else if (current.direction === 'asc') {
    emit('update:sort', { fieldId, direction: 'desc' });
  } else {
    emit('update:sort', null);
  }
}

function ariaSort(fieldId: string): 'ascending' | 'descending' | 'none' {
  const current = props.sort;
  if (!current || current.fieldId !== fieldId) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}

function sortIcon(fieldId: string): string {
  const current = props.sort;
  if (!current || current.fieldId !== fieldId) return '↕';
  return current.direction === 'asc' ? '↑' : '↓';
}

function sortLabel(column: { field: FieldDefinition }): string {
  const current = props.sort;
  const direction = !current || current.fieldId !== column.field.id
    ? t('table.sortAsc')
    : current.direction === 'asc'
      ? t('table.sortDesc')
      : t('table.sortClear');
  return t('table.sortBy', { field: column.field.label, direction });
}

const emptyTitle = computed(() => props.emptyTitle ?? t('table.emptyTitle'));
const emptyDescription = computed(() => props.emptyDescription ?? t('table.emptyDescription'));
</script>
