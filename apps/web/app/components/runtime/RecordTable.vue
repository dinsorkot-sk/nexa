<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UiInput
        v-if="searchable"
        v-model="search"
        class="max-w-xs"
        type="search"
        placeholder="Search records…"
        aria-label="Search records"
      />
      <div class="flex-1" />
      <UiButton variant="secondary" :disabled="exporting" @click="exportCsv">{{ exporting ? 'Exporting…' : 'Export CSV' }}</UiButton>
      <UiButton variant="secondary" @click="emit('import')">Import CSV</UiButton>
    </div>

    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

    <div class="overflow-x-auto rounded-md border border-slate-700">
      <table class="min-w-full divide-y divide-slate-700 text-sm">
        <thead class="bg-slate-800/60">
          <tr>
            <th
              v-for="field in columns"
              :key="field.id"
              class="px-4 py-2 text-left font-medium text-slate-300"
            >
              <button
                v-if="isSortable(field)"
                type="button"
                class="inline-flex items-center gap-1 hover:text-slate-100"
                @click="toggleSort(field.id)"
              >
                {{ fieldLabel(field) }}
                <span class="text-xs text-emerald-400">{{ sortField === field.id ? (sortDirection === 'asc' ? '▲' : '▼') : '' }}</span>
              </button>
              <span v-else>{{ fieldLabel(field) }}</span>
            </th>
            <th class="px-4 py-2 text-right font-medium text-slate-300"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-if="loading">
            <td :colspan="columns.length + 1" class="px-4 py-6 text-center text-slate-400">Loading records…</td>
          </tr>
          <tr v-else-if="records.length === 0">
            <td :colspan="columns.length + 1" class="px-4 py-6 text-center text-slate-400">No records yet.</td>
          </tr>
          <tr
            v-for="record in records"
            v-else
            :key="record.id"
            class="cursor-pointer hover:bg-slate-800/50"
            @click="emit('open', record.id)"
          >
            <td v-for="field in columns" :key="field.id" class="px-4 py-2 text-slate-100">
              <MetaFieldValue :field="field" :value="record.data[field.id]" />
            </td>
            <td class="px-4 py-2 text-right">
              <UiButton variant="danger" size="sm" :disabled="deletingId === record.id" @click.stop="removeRecord(record.id)">
                {{ deletingId === record.id ? 'Deleting…' : 'Delete' }}
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between text-sm text-slate-400">
      <span>{{ rangeLabel }}</span>
      <div class="flex gap-2">
        <UiButton variant="secondary" size="sm" :disabled="offset === 0 || loading" @click="goToPage(offset - limit)">Prev</UiButton>
        <UiButton variant="secondary" size="sm" :disabled="offset + limit >= total || loading" @click="goToPage(offset + limit)">Next</UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { MetaFieldValue } from '@nexa/ui';
import { serializeCsv } from '../../utils/csv';
import { apiErrorFromResponse } from '../../utils/api-error';
import {
  deleteRecord,
  listRecords,
  type RuntimeRecord,
} from '../../composables/useRuntime';

const props = defineProps<{
  moduleId: string;
  entityId: string;
  fields: FieldDefinition[];
  searchable: boolean;
}>();

const emit = defineEmits<{ 'open': [recordId: string]; 'deleted': [recordId: string]; 'import': [] }>();

const NON_SORTABLE_TYPES = new Set(['multiSelect', 'json']);

const config = useRuntimeConfig();
const baseUrl = String(config.public.apiBaseUrl);

const records = ref<RuntimeRecord[]>([]);
const total = ref(0);
const limit = 25;
const offset = ref(0);
const search = ref('');
const sortField = ref('');
const sortDirection = ref<'asc' | 'desc'>('asc');
const loading = ref(false);
const exporting = ref(false);
const deletingId = ref<string | null>(null);
const error = ref<string | null>(null);

const columns = computed(() => props.fields.filter((field) => !field.options.hidden));

const rangeLabel = computed(() => {
  if (total.value === 0) return '0 records';
  const start = offset.value + 1;
  const end = Math.min(offset.value + limit, total.value);
  return `${start}–${end} of ${total.value}`;
});

function fieldLabel(field: FieldDefinition): string {
  return field.label || field.name || field.id;
}

function isSortable(field: FieldDefinition): boolean {
  return field.options.sortable !== false && !NON_SORTABLE_TYPES.has(field.type);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await listRecords(fetch, baseUrl, props.moduleId, props.entityId, {
      search: search.value || undefined,
      sort: sortField.value || undefined,
      direction: sortField.value ? sortDirection.value : undefined,
      limit,
      offset: offset.value,
    });
    records.value = result.items;
    total.value = result.total;
  } catch (caught) {
    error.value = apiErrorText(caught);
  } finally {
    loading.value = false;
  }
}

function apiErrorText(caught: unknown): string {
  if (caught instanceof Response) return 'Request failed.';
  if (caught && typeof caught === 'object' && 'message' in caught) return String((caught as { message: unknown }).message);
  return 'Something went wrong. Try again.';
}

function goToPage(nextOffset: number) {
  offset.value = Math.max(0, nextOffset);
  void load();
}

function toggleSort(fieldId: string) {
  if (sortField.value === fieldId) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = fieldId;
    sortDirection.value = 'asc';
  }
  offset.value = 0;
  void load();
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset.value = 0;
    void load();
  }, 300);
});

async function removeRecord(recordId: string) {
  if (!window.confirm('Delete this record? This cannot be undone.')) return;
  deletingId.value = recordId;
  error.value = null;
  try {
    const response = await deleteRecord(fetch, baseUrl, props.moduleId, props.entityId, recordId);
    if (!response.ok) {
      const apiError = await apiErrorFromResponse(response);
      error.value = apiError.message;
      return;
    }
    emit('deleted', recordId);
    await load();
  } catch (caught) {
    error.value = apiErrorText(caught);
  } finally {
    deletingId.value = null;
  }
}

function csvCell(value: unknown): string {
  return String(value ?? '');
}

async function exportCsv() {
  exporting.value = true;
  error.value = null;
  try {
    const rows: string[][] = [];
    let pageOffset = 0;
    const pageSize = 100;
    let exported = 0;
    while (exported < 10000) {
      const result = await listRecords(fetch, baseUrl, props.moduleId, props.entityId, { limit: pageSize, offset: pageOffset });
      for (const record of result.items) {
        rows.push(columns.value.map((field) => csvCell(record.data[field.id])));
        exported += 1;
      }
      pageOffset += pageSize;
      if (result.items.length === 0 || pageOffset >= result.total) break;
    }
    const csv = serializeCsv(columns.value.map(fieldLabel), rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${props.entityId}-records.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (caught) {
    error.value = apiErrorText(caught);
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
watch(() => [props.moduleId, props.entityId] as const, () => {
  offset.value = 0;
  sortField.value = '';
  sortDirection.value = 'asc';
  void load();
});
</script>
