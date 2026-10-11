<template>
  <div class="space-y-3">
    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-slate-400">Loading activity…</p>
    <p v-else-if="entries.length === 0" class="text-sm text-slate-400">No activity yet.</p>
    <ul v-else class="divide-y divide-slate-800 rounded-md border border-slate-700">
      <li v-for="entry in entries" :key="entry.id" class="px-4 py-3 text-sm">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="font-medium text-slate-100">{{ entry.action }}</span>
          <span class="text-xs text-slate-500">{{ formatOccurredAt(entry.occurredAt) }}</span>
        </div>
        <p class="mt-1 text-xs text-slate-400">{{ entry.actorName || 'System' }} · {{ changesSummary(entry.changes) }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { loadActivity, type RuntimeActivityEntry } from '../../composables/useRuntime';

const props = defineProps<{
  moduleId: string;
  entityId: string;
  recordId: string;
}>();

const entries = ref<RuntimeActivityEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const config = useRuntimeConfig();
const baseUrl = String(config.public.apiBaseUrl);

function formatOccurredAt(occurredAt: string): string {
  const date = new Date(occurredAt);
  return Number.isNaN(date.getTime()) ? occurredAt : date.toLocaleString();
}

function changesSummary(changes: Record<string, unknown>): string {
  const before = isObject(changes.before) ? Object.keys(changes.before) : [];
  const after = isObject(changes.after) ? Object.keys(changes.after) : [];
  const keys = [...new Set([...before, ...after])];
  if (keys.length === 0) return changes.after === undefined ? 'created' : 'updated';
  return `changed: ${keys.join(', ')}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    entries.value = await loadActivity(fetch, baseUrl, props.moduleId, props.entityId, props.recordId);
  } catch (caught) {
    if (caught instanceof Response) error.value = 'Request failed.';
    else if (caught && typeof caught === 'object' && 'message' in caught) error.value = String((caught as { message: unknown }).message);
    else error.value = 'Something went wrong. Try again.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.entityId, props.recordId] as const, load);
</script>
