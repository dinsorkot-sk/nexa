<template>
  <div class="space-y-6">
    <NuxtLink to="/modules" class="text-sm text-slate-400 hover:text-white">← Modules</NuxtLink>
    <BuilderError :error="error" />
    <template v-if="module">
      <div class="flex flex-wrap items-start justify-between gap-4"><div><div class="flex items-center gap-3"><h1 class="text-3xl font-semibold">{{ module.name }}</h1><UiBadge :tone="moduleStatusTone(module.status)">{{ module.status }}</UiBadge></div><p class="mt-2 max-w-2xl text-slate-400">{{ module.description || 'No description' }}</p><p class="mt-2 text-xs text-slate-500">{{ module.id }} · v{{ module.version }}</p></div><NuxtLink to="/modules"><UiButton variant="secondary">All modules</UiButton></NuxtLink></div>
      <div class="flex flex-wrap gap-2"><NuxtLink :to="`/modules/${encodeURIComponent(module.id)}/entities`"><UiButton variant="secondary">Entities</UiButton></NuxtLink><NuxtLink :to="`/modules/${encodeURIComponent(module.id)}/relations`"><UiButton variant="secondary">Relations</UiButton></NuxtLink></div>
      <UiCard><div class="flex flex-wrap items-start justify-between gap-4"><div><h2 class="text-lg font-semibold">Lifecycle</h2><p class="mt-1 text-sm text-slate-400">Transitions are validated by the server.</p></div><div class="flex flex-wrap gap-2"><UiButton v-for="status in transitions" :key="status" variant="secondary" :loading="transitioning === status" :disabled="Boolean(transitioning)" @click="transition(status)">Move to {{ status }}</UiButton></div></div></UiCard>
      <UiCard><h2 class="text-lg font-semibold">Module settings</h2><p class="mt-1 text-sm text-slate-400">Update module metadata while it remains in draft or review.</p><ModuleForm v-if="editable" :module="module" @saved="module = $event" /></UiCard>
      <UiCard v-if="!editable"><h2 class="text-lg font-semibold">Read-only metadata</h2><p class="mt-1 text-sm text-slate-400">Definitions can only be changed while status is draft or review.</p></UiCard>
    </template>
    <p v-else-if="pending" class="text-sm text-slate-400">Loading module…</p>
  </div>
</template>

<script setup lang="ts">
import type { ModuleDefinition, ModuleStatus } from '@nexa/meta';
import { availableModuleTransitions, moduleStatusTone } from '../../../utils/module-builder';
import { requestData } from '../../../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../../../utils/api-error';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const api = useApiClient();
const module = ref<ModuleDefinition | null>(null);
const pending = ref(true);
const error = ref<NormalizedApiError | null>(null);
const transitioning = ref<ModuleStatus | null>(null);
const transitions = computed(() => module.value ? availableModuleTransitions(module.value.status) : []);
const editable = computed(() => module.value?.status === 'draft' || module.value?.status === 'review');
const id = computed(() => String(route.params.moduleId));

async function load() {
  pending.value = true;
  try { module.value = await requestData<ModuleDefinition>(api.modules[':id'].$get({ param: { id: id.value } })); }
  catch (caught) { error.value = normalizeApiError(caught); }
  finally { pending.value = false; }
}
async function transition(to: ModuleStatus) {
  transitioning.value = to;
  error.value = null;
  try { module.value = await requestData<ModuleDefinition>(api.modules[':id'].transition.$post({ param: { id: id.value }, json: { to } })); }
  catch (caught) { error.value = normalizeApiError(caught); }
  finally { transitioning.value = null; }
}
await load();
</script>
