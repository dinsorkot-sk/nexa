<script setup lang="ts">
import type { EntityDefinition, FieldDefinition, RecordSort, ViewDefinition } from '@nexa/meta';
import { NxAlert, NxButton, NxMetaCalendar, NxMetaGallery, NxMetaKanban, NxMetaTable, NxTabs } from '@nexa/ui';

import { ApiError, api } from '~/composables/useApi';
import type { RecordRow } from '~/composables/useEntity';

const route = useRoute();
const moduleId = String(route.params.moduleId);
const entityId = String(route.params.entityId);
const base = `/modules/${moduleId}/entities/${entityId}`;
const tablePageSize = 25;
/** The list endpoint's ceiling: the board, the calendar and the gallery show one page of this size. */
const boardPageSize = 100;

const entity = ref<EntityDefinition>();
const fields = ref<FieldDefinition[]>([]);
const views = ref<ViewDefinition[]>([]);
const currentId = ref('');
const records = ref<RecordRow[]>([]);
const total = ref(0);
const page = ref(1);
const sort = ref<RecordSort[]>([]);
const month = ref(new Date().toISOString().slice(0, 7));
const selectedDate = ref<string>();
const loading = ref(true);
const error = ref('');
const notice = ref('');

const view = computed(() => views.value.find((candidate) => candidate.id === currentId.value));
const tabs = computed(() => views.value.map((candidate) => ({ value: candidate.id, label: candidate.name })));

/** The entity's stored views, with a table of its visible fields in front when none of them is a table. */
function withDefaultTable(stored: ViewDefinition[]): ViewDefinition[] {
  const own = stored.filter((candidate) => candidate.entityId === entityId);
  if (own.some((candidate) => candidate.type === 'table')) return own;
  const table = {
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
  return [table, ...own];
}

async function loadRecords() {
  if (!view.value) return;
  loading.value = true;
  error.value = '';
  const paged = view.value.type === 'table';
  const size = paged ? tablePageSize : boardPageSize;
  const query = new URLSearchParams({ limit: String(size), offset: String(paged ? (page.value - 1) * size : 0) });
  const [first] = sort.value;
  if (paged && first) query.set('sort', `${first.fieldId}:${first.direction}`);
  try {
    const result = await api<{ items: RecordRow[]; total: number }>(`${base}/records?${query}`);
    records.value = result.items;
    total.value = result.total;
  } catch {
    error.value = 'โหลดรายการไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}

function select(id: string) {
  currentId.value = id;
  page.value = 1;
  sort.value = view.value?.sort ?? [];
  notice.value = '';
  loadRecords();
}

onMounted(async () => {
  try {
    const [entities, allFields, stored] = await Promise.all([
      api<EntityDefinition[]>(`/modules/${moduleId}/entities`),
      api<FieldDefinition[]>(`/modules/${moduleId}/fields`),
      api<ViewDefinition[]>(`/modules/${moduleId}/views`),
    ]);
    entity.value = entities.find((candidate) => candidate.id === entityId);
    fields.value = allFields.filter((field) => field.entityId === entityId);
    views.value = withDefaultTable(stored);
  } catch {
    error.value = 'โหลดข้อมูลไม่สำเร็จ';
    loading.value = false;
    return;
  }
  const preferred = views.value.find((candidate) => candidate.isDefault) ?? views.value[0];
  if (preferred) select(preferred.id);
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

function open(recordId: string) {
  return navigateTo(`${base}/${recordId}`);
}

/** A card dropped on another column: the server decides whether the move is allowed. */
async function move(recordId: string, group: string) {
  const record = records.value.find((candidate) => candidate.id === recordId);
  const field = view.value?.groupBy;
  if (!record || !field) return;
  notice.value = '';
  try {
    await api(`${base}/records/${recordId}`, { method: 'PATCH', body: { data: { ...record.data, [field]: group }, version: record.version } });
  } catch (caught) {
    notice.value = caught instanceof ApiError && caught.status === 409 ? 'มีผู้อื่นแก้ไขรายการนี้ไปแล้ว โหลดข้อมูลใหม่' : 'ย้ายรายการไม่สำเร็จ';
  }
  await loadRecords();
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
    <div class="my-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        {{ entity?.label }}
      </h1>
      <NuxtLink :to="`${base}/new`">
        <NxButton size="sm">
          เพิ่มรายการ
        </NxButton>
      </NuxtLink>
    </div>
    <NxTabs
      v-if="tabs.length > 1"
      class="mb-4"
      label="มุมมอง"
      :model-value="currentId"
      :items="tabs"
      @update:model-value="select"
    />
    <NxAlert
      v-if="notice"
      color="warning"
      :description="notice"
      class="mb-4"
      @close="notice = ''"
    />
    <template v-if="view">
      <NxMetaTable
        v-if="view.type === 'table'"
        :view="view"
        :fields="fields"
        :records="records"
        :total="total"
        :limit="tablePageSize"
        :page="page"
        :loading="loading"
        :error="error || undefined"
        :caption="entity?.label"
        @update:sort="onSort"
        @update:page="onPage"
        @retry="loadRecords"
      >
        <template #actions="{ recordId }">
          <NuxtLink
            :to="`${base}/${recordId}`"
            class="text-sm text-ui-primary-text underline"
          >
            เปิด
          </NuxtLink>
        </template>
      </NxMetaTable>
      <NxAlert
        v-else-if="error"
        color="error"
        :description="error"
        :dismissible="false"
      />
      <NxMetaKanban
        v-else-if="view.type === 'kanban'"
        :view="view"
        :fields="fields"
        :records="records"
        @open="open"
        @move="move"
      />
      <NxMetaCalendar
        v-else-if="view.type === 'calendar'"
        v-model:month="month"
        v-model:selected-date="selectedDate"
        :view="view"
        :fields="fields"
        :records="records"
        @open="open"
      />
      <NxMetaGallery
        v-else-if="view.type === 'gallery'"
        :view="view"
        :fields="fields"
        :records="records"
        @open="open"
      />
    </template>
    <NxAlert
      v-else-if="error"
      color="error"
      :description="error"
      :dismissible="false"
    />
  </main>
</template>
