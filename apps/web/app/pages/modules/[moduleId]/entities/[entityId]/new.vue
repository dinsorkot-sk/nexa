<script setup lang="ts">
import type { FieldDefinition, FormDefinition } from '@nexa/meta';
import { NxMetaForm } from '@nexa/ui';

import { ApiError, api } from '~/composables/useApi';
import { loadEntity, referenceLoader, type RecordRow } from '~/composables/useEntity';

const route = useRoute();
const moduleId = String(route.params.moduleId);
const entityId = String(route.params.entityId);

const fields = ref<FieldDefinition[]>([]);
const form = ref<FormDefinition>();
const values = ref<Record<string, unknown>>({});
const submitting = ref(false);
const error = ref('');

const loaders = computed(() => Object.fromEntries(
  fields.value.filter((field) => field.type === 'reference').map((field) => [field.id, referenceLoader(moduleId, field)]),
));

onMounted(async () => {
  try {
    ({ fields: fields.value, form: form.value } = await loadEntity(moduleId, entityId));
  } catch {
    error.value = 'โหลดฟอร์มไม่สำเร็จ';
  }
});

async function submit(next: Record<string, unknown>) {
  submitting.value = true;
  error.value = '';
  try {
    const created = await api<RecordRow>(`/modules/${moduleId}/entities/${entityId}/records`, { method: 'POST', body: { data: next } });
    await navigateTo(`/modules/${moduleId}/entities/${entityId}/${created.id}`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'บันทึกไม่สำเร็จ';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <NuxtLink
      :to="`/modules/${moduleId}/entities/${entityId}`"
      class="text-sm text-ui-text-muted"
    >
      ← รายการ
    </NuxtLink>
    <div class="mt-4 max-w-2xl">
      <NxMetaForm
        v-model:values="values"
        :form="form"
        :fields="fields"
        :submitting="submitting"
        :error="error || undefined"
        :load-options-by-field="loaders"
        submit-label="บันทึก"
        @submit="submit"
        @cancel="navigateTo(`/modules/${moduleId}/entities/${entityId}`)"
      />
    </div>
  </main>
</template>
