<script setup lang="ts">
definePageMeta({ layout: 'runtime', middleware: 'auth' });

const route = useRoute();
const moduleId = computed(() => String(route.params.moduleId));
const entityId = computed(() => String(route.params.entityId));

const schema = ref<Awaited<ReturnType<typeof loadModuleSchema>> | null>(null);
const error = ref<string | null>(null);
const importOpen = ref(false);
const importSummary = ref<string | null>(null);

const fields = computed(() => (schema.value ? fieldsForEntity(schema.value, entityId.value) : []));
const searchable = computed(() => fields.value.some((field) => field.options.searchable));

const table = ref<{ refresh?: () => void } | null>(null);

onMounted(async () => {
  try {
    schema.value = await loadModuleSchema(fetch, useRuntimeConfig().public.apiBaseUrl, moduleId.value);
  } catch (cause) {
    error.value = normalizeApiError(cause).message;
  }
});


function onImported(counts: { imported: number; failed: number }) {
  importSummary.value = `${counts.imported} imported, ${counts.failed} failed`;
  table.value?.refresh?.();
}

useHead({ title: 'Nexa — Records' });
</script>

<template>
  <section>
    <NuxtLink :to="`/app/${moduleId}`" class="text-sm text-slate-400 hover:text-slate-200">← Entities</NuxtLink>
    <div class="mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ entityId }}</h1>
      <div class="flex gap-2">
        <NuxtLink
          :to="`/app/${moduleId}/entities/${entityId}/records/new`"
          class="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          New record
        </NuxtLink>
        <UiButton variant="secondary" size="sm" @click="importOpen = true">Import CSV</UiButton>
      </div>
    </div>

    <p v-if="importSummary" class="mt-3 text-sm text-emerald-400">{{ importSummary }}</p>
    <p v-if="error" role="alert" class="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-if="schema" class="mt-4">
      <RecordTable
        ref="table"
        :module-id="moduleId"
        :entity-id="entityId"
        :fields="fields"
        :searchable="searchable"
        @open="navigateTo(`/app/${moduleId}/entities/${entityId}/records/${$event}`)"
        @import="importOpen = true"
      />
    </div>

    <ImportCsvDialog
      v-if="importOpen"
      :module-id="moduleId"
      :entity-id="entityId"
      :fields="fields"
      @close="importOpen = false"
      @imported="onImported"
    />
  </section>
</template>
