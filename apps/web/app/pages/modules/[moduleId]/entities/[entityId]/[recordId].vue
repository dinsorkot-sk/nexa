<script setup lang="ts">
import type { FieldDefinition, FormDefinition, RelationDefinition } from '@nexa/meta';
import { NxAlert, NxButton, NxMetaDetail, NxMetaForm, type NxMetaDetailActivity, type NxMetaDetailRelation } from '@nexa/ui';

import { ApiError, api } from '~/composables/useApi';
import { formatActivity, type RawActivityEntry } from '~/composables/useFormat';
import { loadEntity, recordLabel, referenceLoader, type RecordRow } from '~/composables/useEntity';

const route = useRoute();
const moduleId = String(route.params.moduleId);
const entityId = String(route.params.entityId);
const recordId = String(route.params.recordId);
const base = `/modules/${moduleId}/entities/${entityId}`;
const listPath = `/modules/${moduleId}/entities/${entityId}`;

const fields = ref<FieldDefinition[]>([]);
const form = ref<FormDefinition>();
const record = ref<RecordRow>();
const relations = ref<NxMetaDetailRelation[]>([]);
const activity = ref<NxMetaDetailActivity[]>([]);
const editing = ref(false);
const values = ref<Record<string, unknown>>({});
const submitting = ref(false);
const conflict = ref(false);
const error = ref('');

const loaders = computed(() => Object.fromEntries(
  fields.value.filter((field) => field.type === 'reference').map((field) => [field.id, referenceLoader(moduleId, field)]),
));

async function load() {
  record.value = await api<RecordRow>(`${base}/records/${recordId}`);
  values.value = { ...record.value.data };
  const [{ items }, definitions] = await Promise.all([
    api<{ items: RawActivityEntry[] }>(`${base}/records/${recordId}/activity`),
    api<RelationDefinition[]>(`/modules/${moduleId}/relations`),
  ]);
  activity.value = items.map((item) => formatActivity(item));
  const own = definitions.filter((relation) => relation.sourceEntityId === entityId || relation.targetEntityId === entityId);
  relations.value = await Promise.all(own.map(async (relation) => {
    const targets = await api<RecordRow[]>(`${base}/records/${recordId}/relations/${relation.id}`);
    return { id: relation.id, name: relation.name, targets: targets.map((target) => ({ id: target.id, label: recordLabel(target) })) };
  }));
}

onMounted(async () => {
  try {
    ({ fields: fields.value, form: form.value } = await loadEntity(moduleId, entityId));
    await load();
  } catch {
    error.value = 'โหลดรายการไม่สำเร็จ';
  }
});

async function save(next: Record<string, unknown>) {
  if (!record.value) return;
  submitting.value = true;
  error.value = '';
  conflict.value = false;
  try {
    await api(`${base}/records/${recordId}`, { method: 'PATCH', body: { data: next, version: record.value.version } });
    editing.value = false;
    await load();
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 409) {
      conflict.value = true;
      error.value = 'มีผู้อื่นแก้ไขรายการนี้ไปแล้ว โหลดข้อมูลล่าสุดก่อนแก้ไขอีกครั้ง';
    } else {
      error.value = caught instanceof ApiError ? caught.message : 'บันทึกไม่สำเร็จ';
    }
  } finally {
    submitting.value = false;
  }
}

/** Drops the edit and shows the record as it is on the server now. */
async function reload() {
  error.value = '';
  conflict.value = false;
  editing.value = false;
  await load();
}

async function remove() {
  if (!window.confirm('ลบรายการนี้?')) return;
  try {
    await api(`${base}/records/${recordId}`, { method: 'DELETE' });
    await navigateTo(listPath);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'ลบไม่สำเร็จ';
  }
}
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <NuxtLink
      :to="listPath"
      class="text-sm text-ui-text-muted"
    >
      ← รายการ
    </NuxtLink>
    <div class="mt-4 flex max-w-2xl flex-col gap-4">
      <NxAlert
        v-if="error && !editing"
        color="error"
        :description="error"
        :dismissible="false"
      />
      <template v-if="record">
        <div
          v-if="!editing"
          class="flex gap-2"
        >
          <NxButton
            size="sm"
            @click="editing = true"
          >
            แก้ไข
          </NxButton>
          <NxButton
            size="sm"
            variant="outline"
            color="error"
            @click="remove"
          >
            ลบ
          </NxButton>
        </div>
        <template v-if="editing">
          <NxMetaForm
            v-model:values="values"
            mode="edit"
            :form="form"
            :fields="fields"
            :submitting="submitting"
            :error="error || undefined"
            :load-options-by-field="loaders"
            submit-label="บันทึก"
            cancel-label="ยกเลิก"
            @submit="save"
            @cancel="reload"
          />
          <NxButton
            v-if="conflict"
            variant="outline"
            @click="reload"
          >
            โหลดข้อมูลล่าสุด
          </NxButton>
        </template>
        <NxMetaDetail
          v-else
          :record="record"
          :fields="fields"
          :relations="relations"
          :activity="activity"
          @open="(id) => navigateTo(`${listPath}/${id}`)"
        />
      </template>
    </div>
  </main>
</template>
