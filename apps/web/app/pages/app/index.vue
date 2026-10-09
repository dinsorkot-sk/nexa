<script setup lang="ts">
import type { ModuleDefinition } from '@nexa/meta';

definePageMeta({ layout: 'runtime', middleware: 'auth' });

const api = useApiClient();
const modules = ref<ModuleDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await api.modules.$get({ query: { status: 'enabled' } });
    const payload = await response.json() as { items?: ModuleDefinition[] };
    modules.value = payload.items ?? [];
  } catch (cause) {
    error.value = normalizeApiError(cause).message;
  } finally {
    loading.value = false;
  }
});

useHead({ title: 'Nexa — Apps' });
</script>

<template>
  <section>
    <h1 class="text-2xl font-semibold">Apps</h1>
    <p class="mt-1 text-sm text-slate-400">Enabled modules available to you.</p>

    <p v-if="error" role="alert" class="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-else-if="loading" class="mt-4 text-sm text-slate-400">Loading…</p>

    <div v-else-if="modules.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="module in modules"
        :key="module.id"
        :to="`/app/${module.id}`"
        class="rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-emerald-600"
      >
        <h2 class="font-medium">{{ module.name }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ module.description || 'No description' }}</p>
      </NuxtLink>
    </div>
    <p v-else class="mt-4 text-sm text-slate-400">No enabled modules yet. Enable one in the Builder first.</p>
  </section>
</template>
