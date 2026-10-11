<script setup lang="ts">
definePageMeta({ layout: 'runtime', middleware: 'auth' });

const route = useRoute();
const moduleId = computed(() => String(route.params.moduleId));
const entityId = computed(() => String(route.params.entityId));

const schema = ref<Awaited<ReturnType<typeof loadModuleSchema>> | null>(null);
const error = ref<string | null>(null);
const fields = computed(() => (schema.value ? fieldsForEntity(schema.value, entityId.value) : []));

onMounted(async () => {
  try {
    schema.value = await loadModuleSchema(fetch, useRuntimeConfig().public.apiBaseUrl, moduleId.value);
  } catch (cause) {
    error.value = normalizeApiError(cause).message;
  }
});

useHead({ title: 'Nexa — New record' });
</script>

<template>
  <section class="mx-auto max-w-2xl">
    <NuxtLink :to="`/app/${moduleId}/entities/${entityId}`" class="text-sm text-slate-400 hover:text-slate-200">← Records</NuxtLink>
    <h1 class="mt-2 text-2xl font-semibold">New record</h1>

    <p v-if="error" role="alert" class="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <RecordForm
      v-if="schema"
      class="mt-4"
      :module-id="moduleId"
      :entity-id="entityId"
      :fields="fields"
      @saved="navigateTo(`/app/${moduleId}/entities/${entityId}`)"
      @cancel="navigateTo(`/app/${moduleId}/entities/${entityId}`)"
    />
  </section>
</template>
