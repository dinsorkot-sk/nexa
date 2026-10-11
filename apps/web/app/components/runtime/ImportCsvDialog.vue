<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('close')">
    <div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl">
      <h2 class="text-lg font-semibold">Import CSV</h2>
      <p class="mt-1 text-sm text-slate-400">Map CSV columns by header name or field ID. Hidden, read-only and computed fields are skipped.</p>

      <div class="mt-4 space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          class="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-100 hover:file:bg-slate-700"
          @change="onFileChange"
        >
        <p v-if="fileName" class="text-xs text-slate-500">{{ fileName }}</p>

        <div v-if="preview" class="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm">
          <p>{{ preview.rowCount }} rows detected; {{ preview.mappedColumns }} columns mapped.</p>
          <p v-if="preview.skipped.length" class="mt-1 text-xs text-amber-400">Skipped columns: {{ preview.skipped.join(', ') }}</p>
        </div>
      </div>

      <p v-if="error" class="mt-4 text-sm text-rose-400">{{ error }}</p>

      <div v-if="result" class="mt-4 rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm">
        <p>Imported {{ result.imported }} row(s); {{ result.failed }} failed.</p>
        <table v-if="result.failures.length" class="mt-2 min-w-full text-xs">
          <thead>
            <tr class="text-left text-slate-400">
              <th class="py-1 pr-3">Row</th>
              <th class="py-1">Error</th>
            </tr>
          </thead>
          <tbody class="text-rose-300">
            <tr v-for="failure in result.failures" :key="failure.row">
              <td class="py-1 pr-3">{{ failure.row }}</td>
              <td class="py-1">{{ failure.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <UiButton variant="ghost" @click="emit('close')">Close</UiButton>
        <UiButton :disabled="!canImport || importing" :loading="importing" @click="runImport">
          {{ importing ? 'Importing…' : 'Import' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { parseCsv } from '../../utils/csv';
import { csvRowToRecordData } from '../../utils/runtime';
import { apiErrorFromResponse, normalizeApiError } from '../../utils/api-error';
import { createRecord } from '../../composables/useRuntime';

const props = defineProps<{
  moduleId: string;
  entityId: string;
  fields: FieldDefinition[];
}>();

const emit = defineEmits<{ 'close': []; 'imported': [counts: { imported: number; failed: number }] }>();

const config = useRuntimeConfig();
const baseUrl = String(config.public.apiBaseUrl);

const rows = ref<string[][]>([]);
const headers = ref<string[]>([]);
const fileName = ref('');
const preview = ref<{ rowCount: number; mappedColumns: number; skipped: string[] } | null>(null);
const importing = ref(false);
const error = ref<string | null>(null);
const result = ref<{ imported: number; failed: number; failures: Array<{ row: number; message: string }> } | null>(null);

const canImport = computed(() => rows.value.length > 0);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  result.value = null;
  error.value = null;
  preview.value = null;
  rows.value = [];
  headers.value = [];
  fileName.value = file?.name ?? '';
  if (!file) return;
  void file.text().then((text) => {
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      error.value = 'The file is empty.';
      return;
    }
    headers.value = parsed[0]!;
    rows.value = parsed.slice(1);
    const first = csvRowToRecordData(props.fields, headers.value, rows.value[0] ?? []);
    preview.value = {
      rowCount: rows.value.length,
      mappedColumns: headers.value.length - first.skipped.length,
      skipped: first.skipped,
    };
  });
}

async function runImport() {
  importing.value = true;
  error.value = null;
  const failures: Array<{ row: number; message: string }> = [];
  let imported = 0;
  let failed = 0;
  try {
    for (let index = 0; index < rows.value.length; index += 1) {
      const { data } = csvRowToRecordData(props.fields, headers.value, rows.value[index]!);
      if (Object.keys(data).length === 0) continue;
      try {
        const response = await createRecord(fetch, baseUrl, props.moduleId, props.entityId, data);
        if (!response.ok) {
          failed += 1;
          failures.push({ row: index + 2, message: (await apiErrorFromResponse(response)).message });
        } else {
          imported += 1;
        }
      } catch (caught) {
        failed += 1;
        failures.push({ row: index + 2, message: normalizeApiError(caught).message });
      }
    }
    result.value = { imported, failed, failures };
    emit('imported', { imported, failed });
  } finally {
    importing.value = false;
  }
}
</script>
