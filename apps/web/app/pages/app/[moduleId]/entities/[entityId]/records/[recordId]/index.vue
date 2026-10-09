<script setup lang="ts">
definePageMeta({ layout: 'runtime', middleware: 'auth' });

const route = useRoute();
const moduleId = computed(() => String(route.params.moduleId));
const entityId = computed(() => String(route.params.entityId));
const recordId = computed(() => String(route.params.recordId));

const schema = ref<Awaited<ReturnType<typeof loadModuleSchema>> | null>(null);
const record = ref<Awaited<ReturnType<typeof getRecord>> | null>(null);
const error = ref<string | null>(null);
const editing = ref(false);

const fields = computed(() => (schema.value ? fieldsForEntity(schema.value, entityId.value) : []));
const relations = computed(() => (schema.value ? relationsForEntity(schema.value, entityId.value) : []));

async function loadRecord() {
  const loaded = await getRecord(fetch, useRuntimeConfig().public.apiBaseUrl, moduleId.value, entityId.value, recordId.value);
  if (!loaded) error.value = 'That record no longer exists.';
  else record.value = loaded;
}

onMounted(async () => {
  try {
    schema.value = await loadModuleSchema(fetch, useRuntimeConfig().public.apiBaseUrl, moduleId.value);
    await loadRecord();
  } catch (cause) {
    error.value = normalizeApiError(cause).message;
  }
});

useHead({ title: 'Nexa — Record' });
</script>

<template>
  <section>
    <NuxtLink :to="`/app/${moduleId}/entities/${entityId}`" class="text-sm text-slate-400 hover:text-slate-200">← Records</NuxtLink>
    <div class="mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ recordId }}</h1>
      <UiButton v-if="record && !editing" variant="secondary" size="sm" @click="editing = !editing">
        {{ editing ? 'Cancel edit' : 'Edit' }}
      </UiButton>
    </div>

    <p v-if="error" role="alert" class="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{{ error }}</p>

    <div v-else-if="schema && record" class="mt-4 space-y-4">
      <RecordForm
        v-if="editing"
        :key="record.version"
        :module-id="moduleId"
        :entity-id="entityId"
        :fields="fields"
        :record="record"
        @saved="editing = false; loadRecord()"
        @cancel="editing = false"
      />
      <UiCard v-else class="divide-y divide-slate-800">
        <div v-for="field in fields" :key="field.id" class="flex justify-between gap-4 px-4 py-2 text-sm">
          <span class="text-slate-400">{{ field.label || field.name || field.id }}</span>
          <MetaFieldValue :field="field" :value="record.data[field.id]" />
        </div>
      </UiCard>

      <RelationLinks
        :module-id="moduleId"
        :entity-id="entityId"
        :record-id="recordId"
        :relations="relations"
        :entities="schema.entities"
        :fields="schema.fields"
      />

      <RecordActivity :module-id="moduleId" :entity-id="entityId" :record-id="recordId" />
    </div>
    <p v-else class="mt-4 text-sm text-slate-400">Loading…</p>
  </section>
</template>
