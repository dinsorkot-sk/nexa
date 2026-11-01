<script setup lang="ts">
import draggable from 'vuedraggable';
import type { FixtureRecord } from '../../data/fixtures';
import { buildSchema } from '@nexa/schema';

definePageMeta({ middleware: 'auth', layout: 'default' });

const route = useRoute();
const { t } = useI18n();
const { entity, modules } = useMetadata();
const toast = useToast();

const moduleKey = computed(() => route.params.module as string);
const entityName = computed(() => route.params.entity as string);
const meta = computed(() => entity(moduleKey.value, entityName.value));

const view = computed({
  get: () => (route.query.view as string) ?? 'table',
  set: (v) => navigateTo({ query: { ...route.query, view: v } }, { replace: true }),
});

const search = ref('');
const selected = ref<Set<string>>(new Set());
const page = ref(1);
const perPage = 10;
const sortBy = ref('');
const visibleFields = ref<string[]>([]);
const demoState = computed(() => (route.query.state as string) ?? '');

const allRecords = computed<FixtureRecord[]>(() => {
  if (!meta.value) return [];
  if (demoState.value === 'empty' || demoState.value === 'noresults') return [];
  return meta.value.records as FixtureRecord[];
});

const rows = ref<FixtureRecord[]>([]);
watch(allRecords, (next) => { rows.value = structuredClone(next); }, { immediate: true });

const records = computed(() => {
  let result = rows.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }
  if (sortBy.value && meta.value) {
    const f = meta.value.fields.find((x) => x.name === sortBy.value);
    if (f) result = [...result].sort((a, b) => String(a[sortBy.value] ?? '').localeCompare(String(b[sortBy.value] ?? '')));
  }
  return result;
});

const tableFields = computed(() => {
  if (!meta.value) return [];
  const all = meta.value.fields.filter((f) => !f.hidden && !['formula', 'computed'].includes(f.logicalType));
  const list = visibleFields.value.length ? all.filter((f) => visibleFields.value.includes(f.name)) : all;
  return list.slice(0, 7);
});

const paged = computed(() => {
  const start = (page.value - 1) * perPage;
  return records.value.slice(start, start + perPage);
});

function clearSelection() {
  selected.value = new Set();
}

function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(records.value.map((r) => r.id)) : new Set();
}

const sortMenu = computed(() => (meta.value ? meta.value.fields.slice(0, 8).map((f) => ({ label: f.label, icon: sortBy.value === f.name ? 'i-lucide-check' : '', onSelect: () => { sortBy.value = sortBy.value === f.name ? '' : f.name; } })) : []));

const columnMenu = computed(() => (meta.value ? meta.value.fields.map((f) => ({ label: f.label, type: 'checkbox' as const, checked: visibleFields.value.length === 0 || visibleFields.value.includes(f.name), onSelect: () => {
  visibleFields.value = visibleFields.value.includes(f.name) ? visibleFields.value.filter((n) => n !== f.name) : [...visibleFields.value, f.name];
} })) : []));

const formOpen = ref(false);
const formFields = computed(() => meta.value?.fields.filter((f) => !f.readOnly && !['formula', 'computed', 'autoNumber'].includes(f.logicalType)) ?? []);
const formState = ref<Record<string, unknown>>({});
const formError = ref<Record<string, string>>({});

function openCreate() {
  formState.value = {};
  formError.value = {};
  formOpen.value = true;
}

function submitCreate() {
  const schema = buildSchema(formFields.value);
  const parsed = schema.safeParse(formState.value);
  if (!parsed.success) {
    formError.value = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) formError.value[String(key)] = t('form.invalid');
    }
    return;
  }
  formOpen.value = false;
  toast.add({ title: t('records.createdToast'), color: 'success' });
}

const kanbanStatus = computed(() => meta.value?.fields.find((f) => f.name === 'status')?.options ?? []);

function kanbanRecords(status: string): FixtureRecord[] {
  return records.value.filter((r) => String(r.status ?? '') === status);
}

function onKanbanChange(event: { added?: { element: FixtureRecord; newIndex: number }; removed?: { element: FixtureRecord } }, status: string) {
  if (event.added) {
    const rec = event.added.element;
    const from = String(rec.status ?? '');
    const allowed = fixtureWorkflow.transitions.some((tr) => tr.from === from && tr.to === status);
    if (!allowed) {
      rows.value = structuredClone(allRecords.value);
      toast.add({ title: t('records.cantMove'), description: `${from} → ${status}`, color: 'error' });
      return;
    }
    rec.status = status;
    toast.add({ title: t('records.movedToast'), color: 'success' });
  }
}

const calendarEvents = computed(() => records.value.filter((r) => r.purchaseDate).map((r, i) => ({
  id: r.id,
  title: String(r.plateNo ?? r.code ?? r.id),
  start: new Date(String(r.purchaseDate)),
  color: (['primary', 'secondary', 'warning', 'error'] as const)[i % 4],
})));

const galleryFields = computed(() => meta.value?.fields.filter((f) => ['text', 'integer', 'currency', 'select', 'date'].includes(f.logicalType)).slice(0, 4) ?? []);

const moduleIcon = computed(() => modules.value.find((m) => m.key === moduleKey.value)?.icon ?? 'i-lucide-box');
const moduleName = computed(() => modules.value.find((m) => m.key === moduleKey.value)?.name ?? moduleKey.value);
</script>

<template>
  <div v-if="!meta" class="flex flex-col gap-3">
    <NxErrorScreen status="404" :title="t('errors.notFoundTitle')" :description="t('errors.notFoundHint')" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <NxPageHeader :icon="moduleIcon" :title="meta.label" :description="`${moduleName} · ${t('records.count', { n: formatNumber(records.length) })}`">
      <template #actions>
        <UButton icon="i-lucide-download" variant="outline" :label="t('common.export')" @click="toast.add({ title: t('records.exportToast'), color: 'info' })" />
        <UButton icon="i-lucide-upload" variant="outline" :label="t('common.import')" :to="`/m/${moduleKey}/${entityName}/import`" />
        <UButton icon="i-lucide-plus" color="primary" :label="t('common.add')" @click="openCreate" />
      </template>
    </NxPageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <UTabs v-model="view" variant="pill" size="md" :items="[
        { label: t('records.views.table'), value: 'table', icon: 'i-lucide-table' },
        { label: t('records.views.kanban'), value: 'kanban', icon: 'i-lucide-columns-3' },
        { label: t('records.views.calendar'), value: 'calendar', icon: 'i-lucide-calendar' },
        { label: t('records.views.gallery'), value: 'gallery', icon: 'i-lucide-images' },
      ]" />
      <div class="ms-auto flex items-center gap-2">
        <UInput v-model="search" :placeholder="t('records.searchPlaceholder')" class="w-56" clearable>
          <template #leading>
            <UIcon name="i-lucide-search" class="size-4" />
          </template>
        </UInput>
        <UDropdownMenu :items="[sortMenu, columnMenu]">
          <UButton icon="i-lucide-sliders-horizontal" variant="outline" :label="t('records.filter')" />
        </UDropdownMenu>
      </div>
    </div>

    <div v-if="selected.size > 0" class="flex items-center gap-3 rounded-lg border border-default bg-default px-4 py-2">
      <span class="text-nexa-body-medium text-highlighted">{{ t('records.bulkSelected', { n: selected.size }) }}</span>
      <UButton variant="ghost" size="sm" :label="t('common.clearSelection')" @click="clearSelection" />
      <div class="ms-auto flex gap-1">
        <UButton variant="ghost" size="sm" icon="i-lucide-trash-2" :label="t('common.delete')" color="error" />
        <UButton variant="ghost" size="sm" icon="i-lucide-download" :label="t('common.export')" />
      </div>
    </div>

    <div v-if="demoState === 'loading'" class="flex flex-col gap-2">
      <USkeleton v-for="i in 6" :key="i" class="h-10 w-full rounded-md" />
    </div>

    <div v-else-if="demoState === 'error'" class="rounded-xl border border-default bg-default">
      <NxErrorScreen status="500" :title="t('errors.loadFailedTitle')" :description="t('errors.loadFailedHint')" request-id="req_01hzx8demo">
        <template #actions>
          <UButton color="primary" variant="outline" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="navigateTo({ query: {} })" />
        </template>
      </NxErrorScreen>
    </div>

    <UCard v-else-if="records.length === 0" class="rounded-xl">
      <NxEmptyState
        :icon="demoState === 'noresults' ? 'i-lucide-search-x' : 'i-lucide-inbox'"
        :title="demoState === 'noresults' ? t('records.noResults') : t('records.emptyTitle')"
        :description="demoState === 'noresults' ? t('records.noResultsHint', { q: search }) : t('records.emptyHint', { entity: meta.label })"
      >
        <template #actions>
          <UButton color="primary" icon="i-lucide-plus" :label="t('records.addFirst')" @click="openCreate" />
          <UButton v-if="demoState === 'noresults'" variant="outline" :label="t('records.clearFilters')" @click="search = ''" />
        </template>
      </NxEmptyState>
    </UCard>

    <div v-else-if="view === 'table'" class="flex flex-col gap-3">
      <div class="overflow-x-auto rounded-xl border border-default">
        <table class="min-w-full">
          <thead>
            <tr class="border-b border-default bg-[--ui-bg-muted]">
              <th class="w-10 px-3 py-2">
                <UCheckbox :model-value="selected.size === records.length && records.length > 0" @update:model-value="toggleAll" />
              </th>
              <th v-for="f in tableFields" :key="f.name" class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ f.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rec in paged" :key="rec.id" class="border-b border-default transition-colors last:border-b-0 hover:bg-[--ui-bg-muted]" :class="selected.has(rec.id) ? 'bg-[--ui-primary-soft]' : ''">
              <td class="px-3 py-2">
                <UCheckbox :model-value="selected.has(rec.id)" @update:model-value="(v: boolean) => { const next = new Set(selected); if (v) next.add(rec.id); else next.delete(rec.id); selected = next; }" />
              </td>
              <td v-for="f in tableFields" :key="f.name" class="max-w-48 px-3 py-2">
                <NxFieldValue :field="f" :value="rec[f.name]" view="table" :module-key="moduleKey" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between">
        <p class="text-nexa-small text-muted">{{ t('records.pageInfo', { from: (page - 1) * perPage + 1, to: Math.min(page * perPage, records.length), total: records.length }) }}</p>
        <UPagination v-model="page" :page-count="perPage" :total="records.length" size="sm" />
      </div>
    </div>

    <div v-else-if="view === 'kanban'" class="flex gap-3 overflow-x-auto pb-2">
      <div v-for="col in kanbanStatus" :key="col.value" class="w-72 shrink-0 rounded-xl border border-default bg-[--ui-bg-muted] p-2">
        <div class="flex items-center justify-between px-1 py-2">
          <p class="text-nexa-body-medium text-highlighted">{{ col.label }}</p>
          <UBadge color="neutral" variant="soft" size="sm">{{ kanbanRecords(col.value).length }}</UBadge>
        </div>
        <draggable :list="kanbanRecords(col.value)" group="records" item-key="id" class="flex min-h-24 flex-col gap-2" @change="(e) => onKanbanChange(e, col.value)">
          <template #item="{ element }">
            <NxKanbanCard :record="element" :fields="meta.fields" :display-field="meta.displayField" status-field="status" />
          </template>
        </draggable>
      </div>
    </div>

    <div v-else-if="view === 'calendar'">
      <NxCalendarView :events="calendarEvents" />
    </div>

    <div v-else-if="view === 'gallery'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="rec in records" :key="rec.id" class="overflow-hidden rounded-xl" :ui="{ body: { padding: 'p-0' }, root: 'overflow-hidden' }">
        <div class="aspect-video bg-[--ui-bg-accented]">
          <img v-if="rec.image" :src="String(rec.image)" :alt="String(rec.plateNo ?? rec.id)" class="h-full w-full object-cover" @error="($event.target as HTMLImageElement).style.display = 'none'">
          <div v-else class="flex h-full items-center justify-center text-nexa-caption text-dimmed">{{ t('records.imageFallback') }}</div>
        </div>
        <div class="flex flex-col gap-1 p-3">
          <p class="text-nexa-body-strong text-highlighted">{{ rec[meta.displayField] }}</p>
          <p v-for="f in galleryFields" :key="f.name" class="flex items-center justify-between gap-2 text-nexa-small">
            <span class="text-muted">{{ f.label }}</span>
            <NxFieldValue :field="f" :value="rec[f.name]" view="kanban" :module-key="moduleKey" />
          </p>
        </div>
      </UCard>
    </div>

    <USlideover v-model="formOpen" :title="t('records.createTitle', { entity: meta.label })" :description="t('records.createDescription')">
      <div class="flex flex-col gap-4 p-4">
        <NxFieldInput v-for="f in formFields" :key="f.id" :field="f" v-model="formState[f.name]" :error="formError[f.name]" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2 border-t border-default p-4">
          <UButton variant="ghost" :label="t('common.cancel')" @click="formOpen = false" />
          <UButton color="primary" :label="t('common.create')" @click="submitCreate" />
        </div>
      </template>
    </USlideover>
  </div>
</template>
