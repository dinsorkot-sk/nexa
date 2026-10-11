<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div v-if="conflict" class="rounded-md border border-amber-600/50 bg-amber-950/40 p-4 text-sm text-amber-200">
      <p>{{ conflictMessage }}</p>
      <div class="mt-3 flex gap-2">
        <UiButton variant="secondary" size="sm" :disabled="busy" @click="reloadLatest">Reload latest</UiButton>
        <UiButton variant="danger" size="sm" :disabled="busy" @click="overwrite">Overwrite</UiButton>
      </div>
    </div>

    <p v-else-if="error" class="text-sm text-rose-400">{{ error }}</p>

    <div class="grid gap-4 md:grid-cols-2">
      <div v-for="field in editableFields" :key="field.id">
        <UiLabel :for="`field-${field.id}`">
          {{ field.label || field.name || field.id }}
          <span v-if="field.options.required" class="text-rose-400">*</span>
        </UiLabel>
        <div class="mt-1">
          <MetaFieldInput
            :field="field"
            :model-value="values[field.id]"
            :reference-options="referenceOptions[field.id]"
            @update:model-value="values[field.id] = $event"
          />
        </div>
        <p v-if="field.options.helpText" class="mt-1 text-xs text-slate-500">{{ field.options.helpText }}</p>
      </div>
    </div>

    <div class="flex justify-end gap-3">
      <UiButton variant="ghost" @click="emit('cancel')">Cancel</UiButton>
      <UiButton type="submit" :loading="busy">{{ isEdit ? 'Save changes' : 'Create record' }}</UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { MetaFieldInput } from '@nexa/ui';
import { apiErrorFromResponse, normalizeApiError } from '../../utils/api-error';
import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
  type RuntimeRecord,
} from '../../composables/useRuntime';

const NON_WRITABLE_TYPES = new Set(['formula', 'computed', 'autoNumber']);

const props = defineProps<{
  moduleId: string;
  entityId: string;
  fields: FieldDefinition[];
  record?: RuntimeRecord | null;
}>();

const emit = defineEmits<{ 'saved': [record: RuntimeRecord]; 'cancel': [] }>();

const config = useRuntimeConfig();
const baseUrl = String(config.public.apiBaseUrl);

const isEdit = computed(() => Boolean(props.record));

const editableFields = computed(() =>
  props.fields.filter(
    (field) => !field.options.readonly && !field.options.hidden && !NON_WRITABLE_TYPES.has(field.type),
  ),
);

const values = reactive<Record<string, unknown>>(initValues());
const busy = ref(false);
const error = ref<string | null>(null);
const conflict = ref(false);
const conflictMessage = ref('');
const referenceOptions = ref<Record<string, Array<{ value: string; label: string }>>>({});

function initValues(): Record<string, unknown> {
  const initial: Record<string, unknown> = {};
  if (props.record?.data) {
    for (const field of props.fields) {
      if (field.options.readonly || field.options.hidden || NON_WRITABLE_TYPES.has(field.type)) continue;
      if (props.record.data[field.id] !== undefined) initial[field.id] = props.record.data[field.id];
    }
  }
  return initial;
}

function firstLabel(record: RuntimeRecord): string {
  for (const value of Object.values(record.data)) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return record.id;
}

async function loadReferenceOptions() {
  const next: Record<string, Array<{ value: string; label: string }>> = {};
  for (const field of props.fields) {
    if (field.type !== 'reference' || !field.options.referenceEntityId) continue;
    if (field.options.readonly || field.options.hidden || NON_WRITABLE_TYPES.has(field.type)) continue;
    try {
      const result = await listRecords(fetch, baseUrl, props.moduleId, field.options.referenceEntityId, { limit: 100 });
      next[field.id] = result.items.map((record) => ({ value: record.id, label: firstLabel(record) }));
    } catch {
      next[field.id] = [];
    }
  }
  referenceOptions.value = next;
}

function buildData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) data[key] = value;
  }
  return data;
}

async function saveWithVersion(version: number) {
  const data = buildData();
  if (isEdit.value && props.record) {
    return updateRecord(fetch, baseUrl, props.moduleId, props.entityId, props.record.id, data, version);
  }
  return createRecord(fetch, baseUrl, props.moduleId, props.entityId, data);
}

async function parseSaved(response: Response): Promise<RuntimeRecord> {
  return await response.json() as RuntimeRecord;
}

async function submit() {
  busy.value = true;
  error.value = null;
  conflict.value = false;
  try {
    const version = isEdit.value && props.record ? props.record.version : 0;
    const response = await saveWithVersion(version);
    if (!response.ok) {
      const apiError = await apiErrorFromResponse(response);
      if (apiError.code === 'RECORD_CONFLICT' && isEdit.value) {
        conflict.value = true;
        conflictMessage.value = apiError.message;
      } else {
        error.value = apiError.message;
      }
      return;
    }
    emit('saved', await parseSaved(response));
  } catch (caught) {
    error.value = normalizeApiError(caught).message;
  } finally {
    busy.value = false;
  }
}

async function fetchLatest(): Promise<RuntimeRecord | null> {
  if (!props.record) return null;
  const latest = await getRecord(fetch, baseUrl, props.moduleId, props.entityId, props.record.id);
  return latest ?? null;
}

function applyLatest(latest: RuntimeRecord) {
  for (const field of editableFields.value) {
    if (latest.data[field.id] !== undefined) values[field.id] = latest.data[field.id];
    else delete values[field.id];
  }
}

async function reloadLatest() {
  busy.value = true;
  error.value = null;
  try {
    const latest = await fetchLatest();
    if (!latest) {
      error.value = 'Could not reload the latest record.';
      return;
    }
    applyLatest(latest);
    conflict.value = false;
  } catch (caught) {
    error.value = normalizeApiError(caught).message;
  } finally {
    busy.value = false;
  }
}

async function overwrite() {
  busy.value = true;
  error.value = null;
  try {
    const latest = await fetchLatest();
    if (!latest) {
      error.value = 'Could not fetch the latest version to overwrite.';
      return;
    }
    const response = await updateRecord(fetch, baseUrl, props.moduleId, props.entityId, latest.id, buildData(), latest.version);
    if (!response.ok) {
      const apiError = await apiErrorFromResponse(response);
      if (apiError.code === 'RECORD_CONFLICT') {
        conflict.value = true;
        conflictMessage.value = apiError.message;
      } else {
        error.value = apiError.message;
      }
      return;
    }
    conflict.value = false;
    emit('saved', await parseSaved(response));
  } catch (caught) {
    error.value = normalizeApiError(caught).message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void loadReferenceOptions();
});
</script>
