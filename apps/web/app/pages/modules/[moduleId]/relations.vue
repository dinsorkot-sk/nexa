<template>
  <div class="space-y-6">
    <div><NuxtLink :to="`/modules/${moduleId}`" class="text-sm text-slate-400 hover:text-white">← {{ moduleId }}</NuxtLink><div class="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 class="text-3xl font-semibold">Relations</h1><p class="mt-2 text-slate-400">Connect entities within this module.</p></div><UiButton v-if="editable" :disabled="entities.length < 2" @click="showForm = !showForm">{{ showForm ? 'Close form' : 'Add relation' }}</UiButton></div></div>
    <BuilderError :error="error" />
    <UiCard v-if="showForm && editable"><RelationForm :module-id="moduleId" :entities="entities" @saved="relationAdded" /></UiCard>
    <div v-if="pending" class="text-sm text-slate-400">Loading relations…</div>
    <UiCard v-else><div v-if="relations.length" class="divide-y divide-slate-800"><div v-for="relation in relations" :key="relation.id" class="flex flex-wrap items-center justify-between gap-3 py-3"><div><p class="font-medium">{{ relation.name }}</p><p class="mt-1 text-sm text-slate-400">{{ entityName(relation.sourceEntityId) }} → {{ entityName(relation.targetEntityId) }}</p><p class="mt-1 text-xs text-slate-500">{{ relation.id }}</p></div><div class="flex gap-2"><UiBadge>{{ relation.type }}</UiBadge><UiBadge>{{ relation.onDelete }}</UiBadge></div></div></div><p v-else class="text-sm text-slate-400">No relations defined.</p></UiCard>
    <UiCard v-if="!editable && !pending"><p class="text-sm text-slate-400">This module is not in draft or review. Definition editing is read-only.</p></UiCard>
  </div>
</template>

<script setup lang="ts">
import type { EntityDefinition, ModuleDefinition, RelationDefinition } from '@nexa/meta';
import { requestData } from '../../../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../../../utils/api-error';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const api = useApiClient();
const moduleId = computed(() => String(route.params.moduleId));
const entities = ref<EntityDefinition[]>([]);
const relations = ref<RelationDefinition[]>([]);
const module = ref<ModuleDefinition | null>(null);
const pending = ref(true);
const showForm = ref(false);
const error = ref<NormalizedApiError | null>(null);
const editable = computed(() => module.value?.status === 'draft' || module.value?.status === 'review');
function entityName(id: string) { return entities.value.find((entity) => entity.id === id)?.label ?? id; }
async function load() {
  pending.value = true;
  try {
    [entities.value, relations.value, module.value] = await Promise.all([
      requestData<EntityDefinition[]>(api.modules[':moduleId'].entities.$get({ param: { moduleId: moduleId.value } })),
      requestData<RelationDefinition[]>(api.modules[':moduleId'].relations.$get({ param: { moduleId: moduleId.value } })),
      requestData<ModuleDefinition>(api.modules[':id'].$get({ param: { id: moduleId.value } })),
    ]);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { pending.value = false; }
}
function relationAdded(relation: RelationDefinition) { relations.value.push(relation); showForm.value = false; }
await load();
</script>
