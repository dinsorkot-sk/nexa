<script setup lang="ts">
import { useNxMessages } from '../lib/locale';

export interface NxTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
}

export interface NxTableSort {
  key: string;
  direction: 'asc' | 'desc';
}

const props = withDefaults(defineProps<{
  columns: NxTableColumn[];
  rows: Record<string, unknown>[];
  rowKey?: string;
  caption?: string;
  emptyLabel?: string;
  loading?: boolean;
  sort?: NxTableSort;
}>(), {
  rowKey: 'id',
  caption: undefined,
  emptyLabel: undefined,
  loading: false,
  sort: undefined,
});

const emit = defineEmits<{ 'update:sort': [sort: NxTableSort] }>();
const messages = useNxMessages();

function keyOf(row: Record<string, unknown>, index: number): string | number {
  const value = row[props.rowKey];
  return typeof value === 'string' || typeof value === 'number' ? value : index;
}

function sortBy(column: NxTableColumn) {
  if (!column.sortable) return;
  const direction = column.key === props.sort?.key && props.sort.direction === 'asc' ? 'desc' : 'asc';
  emit('update:sort', { key: column.key, direction });
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? value.join(', ') : '[object]';
}
</script>

<template>
  <div class="overflow-x-auto rounded-ui border border-ui-border">
    <table
      class="w-full border-collapse text-left text-sm text-ui-text"
      :aria-busy="props.loading || undefined"
    >
      <caption
        v-if="props.caption"
        class="sr-only"
      >
        {{ props.caption }}
      </caption>
      <thead class="bg-ui-bg-muted text-xs font-medium text-ui-text-muted">
        <tr>
          <th
            v-for="column in props.columns"
            :key="column.key"
            scope="col"
            :class="[
              'whitespace-nowrap px-3 py-2.5',
              column.align === 'center' && 'text-center',
              column.align === 'end' && 'text-right',
            ]"
          >
            <button
              v-if="column.sortable"
              type="button"
              class="rounded outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
              :aria-label="`Sort by ${column.label}`"
              @click="sortBy(column)"
            >
              {{ column.label }}
              <span
                v-if="props.sort?.key === column.key"
                aria-hidden="true"
              >{{ props.sort.direction === 'asc' ? '↑' : '↓' }}</span>
            </button>
            <span v-else>{{ column.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-ui-border">
        <tr
          v-for="(row, rowIndex) in props.rows"
          :key="keyOf(row, rowIndex)"
          class="bg-ui-bg hover:bg-ui-bg-muted"
        >
          <td
            v-for="column in props.columns"
            :key="column.key"
            :class="[
              'max-w-80 px-3 py-2.5',
              column.align === 'center' && 'text-center',
              column.align === 'end' && 'text-right',
            ]"
          >
            <slot
              :name="`cell-${column.key}`"
              :row="row"
              :value="row[column.key]"
            >
              {{ displayValue(row[column.key]) }}
            </slot>
          </td>
        </tr>
        <tr v-if="props.loading">
          <td
            :colspan="Math.max(props.columns.length, 1)"
            role="status"
            class="px-3 py-8 text-center text-ui-text-muted"
          >
            <slot name="loading">
              {{ messages.loading }}
            </slot>
          </td>
        </tr>
        <tr v-else-if="props.rows.length === 0">
          <td
            :colspan="Math.max(props.columns.length, 1)"
            class="px-3 py-8 text-center text-ui-text-muted"
          >
            <slot name="empty">
              {{ props.emptyLabel ?? messages.noResults }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
