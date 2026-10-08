<template>
  <div class="space-y-6">
    <div><NuxtLink :to="`/modules/${moduleId}`" class="text-sm text-slate-400 hover:text-white">← {{ moduleId }}</NuxtLink><div class="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 class="text-3xl font-semibold">Entities</h1><p class="mt-2 text-slate-400">Define the objects in this module.</p></div><UiButton v-if="editable" @click="showForm = !showForm">{{ showForm ? 'Close form' : 'Add entity' }}</UiButton></div></div>
    <BuilderError :error="error" />
    <UiCard v-if="showForm"><EntityForm :module-id="moduleId" @saved="entityAdded" /></UiCard>
    <div v-if="pending" class="text-sm text-slate-400">Loading entities…</div>
    <div v-else-if="entities.length" class="grid gap-4 md:grid-cols-2"><NuxtLink v-for="entity in entities" :key="entity.id" :to="`/modules/${moduleId}/entities/${entity.id}`"><UiCard class="h-full hover:border-slate-600"><h2 class="text-lg font-semibold">{{ entity.pluralLabel }}</h2><p class="mt-1 text-sm text-slate-400">{{ entity.description || entity.name }}</p><p class="mt-4 text-xs text-slate-500">{{ entity.id }}</p></UiCard></NuxtLink></div>
    <UiCard v-else-if="!pending" class="text-center"><h2 class="text-lg font-medium">No entities yet</h2><p class="mt-2 text-sm text-slate-400">Add an entity to begin defining fields.</p></UiCard>
  </div>
</template>

<script setup lang="ts">
import type { EntityDefinition, ModuleDefinition } from '@nexa/meta';
import { requestData } from '../../../../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../../../../utils/api-error';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const api = useApiClient();
const moduleId = computed(() => String(route.params.moduleId));
const entities = ref<EntityDefinition[]>([]);
const module = ref<ModuleDefinition | null>(null);
const pending = ref(true);
const showForm = ref(false);
const error = ref<NormalizedApiError | null>(null);
const editable = computed(() => module.value?.status === 'draft' || module.value?.status === 'review');
async function load() {
  pending.value = true;
  try {
    [entities.value, module.value] = await Promise.all([
      requestData<EntityDefinition[]>(api.modules[':moduleId'].entities.$get({ param: { moduleId: moduleId.value } })),
      requestData<ModuleDefinition>(api.modules[':id'].$get({ param: { id: moduleId.value } })),
    ]);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { pending.value = false; }
}
function entityAdded(entity: EntityDefinition) { entities.value.push(entity); showForm.value = false; }
await load();
</script>
