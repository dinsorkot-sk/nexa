<template>
  <div class="space-y-6">
    <div><NuxtLink :to="`/modules/${moduleId}/entities`" class="text-sm text-slate-400 hover:text-white">← Entities</NuxtLink><div class="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 class="text-3xl font-semibold">{{ entity?.pluralLabel || 'Entity' }}</h1><p class="mt-2 text-slate-400">{{ entity?.description || 'Manage entity metadata and fields.' }}</p><p class="mt-2 text-xs text-slate-500">{{ entityId }}</p></div><UiButton v-if="editable" @click="showForm = !showForm">{{ showForm ? 'Close form' : 'Add field' }}</UiButton></div></div>
    <BuilderError :error="error" />
    <UiCard v-if="showForm && editable"><FieldForm :module-id="moduleId" :entity-id="entityId" @saved="fieldAdded" /></UiCard>
    <div v-if="pending" class="text-sm text-slate-400">Loading entity…</div>
    <UiCard v-else><div class="mb-4 flex items-center justify-between"><h2 class="text-lg font-semibold">Fields</h2><span class="text-sm text-slate-500">{{ fields.length }}</span></div><div v-if="fields.length" class="divide-y divide-slate-800"><div v-for="field in fields" :key="field.id" class="flex flex-wrap items-center justify-between gap-3 py-3"><div><p class="font-medium">{{ field.label }}</p><p class="text-xs text-slate-500">{{ field.name }} · {{ field.id }}</p></div><div class="flex items-center gap-2"><UiBadge>{{ field.type }}</UiBadge><UiBadge v-if="field.options.required" tone="warning">required</UiBadge><UiBadge v-if="field.options.unique" tone="success">unique</UiBadge></div></div></div><p v-else class="text-sm text-slate-400">No fields defined.</p></UiCard>
    <UiCard v-if="!editable && !pending"><p class="text-sm text-slate-400">This module is not in draft or review. Definition editing is read-only.</p></UiCard>
  </div>
</template>

<script setup lang="ts">
import type { EntityDefinition, FieldDefinition, ModuleDefinition } from '@nexa/meta';
import { requestData } from '../../../../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../../../../utils/api-error';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const api = useApiClient();
const moduleId = computed(() => String(route.params.moduleId));
const entityId = computed(() => String(route.params.entityId));
const entity = ref<EntityDefinition | null>(null);
const module = ref<ModuleDefinition | null>(null);
const fields = ref<FieldDefinition[]>([]);
const pending = ref(true);
const showForm = ref(false);
const error = ref<NormalizedApiError | null>(null);
const editable = computed(() => module.value?.status === 'draft' || module.value?.status === 'review');
async function load() {
  pending.value = true;
  try {
    [entity.value, fields.value, module.value] = await Promise.all([
      requestData<EntityDefinition>(api.modules[':moduleId'].entities[':id'].$get({ param: { moduleId: moduleId.value, id: entityId.value } })),
      requestData<FieldDefinition[]>(api.modules[':moduleId'].fields.$get({ param: { moduleId: moduleId.value }, query: { entityId: entityId.value } })),
      requestData<ModuleDefinition>(api.modules[':id'].$get({ param: { id: moduleId.value } })),
    ]);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { pending.value = false; }
}
function fieldAdded(field: FieldDefinition) { fields.value.push(field); fields.value.sort((a, b) => a.position - b.position); showForm.value = false; }
await load();
</script>
