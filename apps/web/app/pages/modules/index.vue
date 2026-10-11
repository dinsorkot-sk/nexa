<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div><p class="text-sm uppercase tracking-widest text-emerald-400">Workspace</p><h1 class="mt-1 text-3xl font-semibold">Modules</h1><p class="mt-2 text-slate-400">Manage your module definitions and lifecycle.</p></div>
      <NuxtLink to="/modules/new"><UiButton>New module</UiButton></NuxtLink>
    </div>
    <BuilderError :error="error" />
    <div v-if="pending" class="text-sm text-slate-400">Loading modules…</div>
    <div v-else-if="modules.length" class="grid gap-4 md:grid-cols-2">
      <NuxtLink v-for="module in modules" :key="module.id" :to="`/modules/${encodeURIComponent(module.id)}`" class="block">
        <UiCard class="h-full transition-colors hover:border-slate-600">
          <div class="flex items-start justify-between gap-3"><div><h2 class="text-lg font-semibold">{{ module.name }}</h2><p class="mt-1 text-sm text-slate-400">{{ module.description || 'No description' }}</p></div><UiBadge :tone="moduleStatusTone(module.status)">{{ module.status }}</UiBadge></div>
          <p class="mt-5 text-xs text-slate-500">{{ module.id }} · v{{ module.version }}</p>
        </UiCard>
      </NuxtLink>
    </div>
    <UiCard v-else class="text-center"><h2 class="text-lg font-medium">No modules yet</h2><p class="mt-2 text-sm text-slate-400">Create a module to start defining entities and fields.</p><NuxtLink class="mt-4 inline-block" to="/modules/new"><UiButton>Create your first module</UiButton></NuxtLink></UiCard>
  </div>
</template>

<script setup lang="ts">
import type { ModuleDefinition } from '@nexa/meta';
import { requestData } from '../../utils/requests';
import { moduleStatusTone } from '../../utils/module-builder';
import { normalizeApiError, type NormalizedApiError } from '../../utils/api-error';
definePageMeta({ middleware: 'auth' });
const api = useApiClient();
const modules = ref<ModuleDefinition[]>([]);
const pending = ref(true);
const error = ref<NormalizedApiError | null>(null);

async function load() {
  pending.value = true;
  try {
    modules.value = await requestData<ModuleDefinition[]>(api.modules.$get());
  } catch (caught) {
    error.value = normalizeApiError(caught);
  } finally {
    pending.value = false;
  }
}
await load();
</script>
