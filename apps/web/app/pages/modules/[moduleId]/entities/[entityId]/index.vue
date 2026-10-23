<script setup lang="ts">
import type { EntityDefinition, FieldDefinition, RecordSort, ViewDefinition } from '@nexa/meta';
import { NxMetaTable } from '@nexa/ui';

import { api } from '~/composables/useApi';

const route = useRoute();
const moduleId = String(route.params.moduleId);
const entityId = String(route.params.entityId);
const limit = 25;

const entity = ref<EntityDefinition>();
const fields = ref<FieldDefinition[]>([]);
const view = ref<ViewDefinition>();
const records = ref<Array<{ id: string; data: Record<string, unknown> }>>([]);
const total = ref(0);
const page = ref(1);
const sort = ref<RecordSort[]>([]);
const loading = ref(true);
const error = ref('');

/** The entity's default table view, or one made of its visible fields when none is stored. */
function pickView(views: ViewDefinition[]): ViewDefinition {
  const own = views.filter((candidate) => candidate.entityId === entityId && candidate.type === 'table');
  const stored = own.find((candidate) => candidate.isDefault) ?? own[0];
  if (stored) return stored;
  return {
    id: 'default',
    moduleId,
    entityId,
    name: entity.value?.label ?? '',
    type: 'table',
    isDefault: true,
    columns: fields.value.filter((field) => !field.options.hidden).map((field) => ({ fieldId: field.id, visible: true })),
    sort: [],
    filters: {},
    settings: {},
  } as ViewDefinition;
}

async function loadRecords() {
  loading.value = true;
  error.value = '';
  const query = new URLSearchParams({ limit: String(limit), offset: String((page.value - 1) * limit) });
  const [first] = sort.value;
  if (first) query.set('sort', `${first.fieldId}:${first.direction}`);
  try {
    const result = await api<{ items: Array<{ id: string; data: Record<string, unknown> }>; total: number }>(`/modules/${moduleId}/entities/${entityId}/records?${query}`);
    records.value = result.items;
    total.value = result.total;
  } catch {
    error.value = 'โหลดรายการไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const [entities, allFields, views] = await Promise.all([
      api<EntityDefinition[]>(`/modules/${moduleId}/entities`),
      api<FieldDefinition[]>(`/modules/${moduleId}/fields`),
      api<ViewDefinition[]>(`/modules/${moduleId}/views`),
    ]);
    entity.value = entities.find((candidate) => candidate.id === entityId);
    fields.value = allFields.filter((field) => field.entityId === entityId);
    view.value = pickView(views);
    sort.value = view.value.sort;
  } catch {
    error.value = 'โหลดข้อมูลไม่สำเร็จ';
    loading.value = false;
    return;
  }
  await loadRecords();
});

function onSort(next: RecordSort[]) {
  sort.value = next;
  page.value = 1;
  loadRecords();
}

function onPage(next: number) {
  page.value = next;
  loadRecords();
}
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <NuxtLink
      :to="`/modules/${moduleId}`"
      class="text-sm text-ui-text-muted"
    >
      ← เอนทิตี
    </NuxtLink>
    <h1 class="my-4 text-2xl font-bold">
      {{ entity?.label }}
    </h1>
    <NxMetaTable
      :view="view"
      :fields="fields"
      :records="records"
      :total="total"
      :limit="limit"
      :page="page"
      :loading="loading"
      :error="error || undefined"
      :caption="entity?.label"
      @update:sort="onSort"
      @update:page="onPage"
      @retry="loadRecords"
    />
  </main>
</template>
