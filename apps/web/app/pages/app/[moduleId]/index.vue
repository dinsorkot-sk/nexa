<script setup lang="ts">

definePageMeta({ layout: 'runtime', middleware: 'auth' });

const route = useRoute();
const moduleId = computed(() => String(route.params.moduleId));

const schema = ref<Awaited<ReturnType<typeof loadModuleSchema>> | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    schema.value = await loadModuleSchema(fetch, useRuntimeConfig().public.apiBaseUrl, moduleId.value);
  } catch (cause) {
    error.value = normalizeApiError(cause).message;
  }
});

useHead({ title: 'Nexa — Entities' });
</script>

<template>
  <section>
    <NuxtLink to="/app" class="text-sm text-slate-400 hover:text-slate-200">← Apps</NuxtLink>
    <h1 class="mt-2 text-2xl font-semibold">{{ moduleId }}</h1>
    <p class="mt-1 text-sm text-slate-400">Pick an entity to browse its records.</p>

    <p v-if="error" role="alert" class="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-else-if="schema?.entities.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="entity in schema.entities"
        :key="entity.id"
        :to="`/app/${moduleId}/entities/${entity.id}`"
        class="rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-emerald-600"
      >
        <h2 class="font-medium">{{ entity.label || entity.name || entity.id }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ entity.description || 'No description' }}</p>
      </NuxtLink>
    </div>
    <p v-else-if="schema" class="mt-4 text-sm text-slate-400">This module has no entities.</p>
    <p v-else class="mt-4 text-sm text-slate-400">Loading…</p>
  </section>
</template>
