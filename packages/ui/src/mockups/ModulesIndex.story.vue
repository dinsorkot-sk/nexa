<script setup lang="ts">
/**
 * Mockup: Modules index.
 * The module rows are metadata-shaped fixtures, not vehicle records.
 */
import { ref, computed } from 'vue';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiSelect from '../components/UiSelect.vue';
import UiBadge from '../components/UiBadge.vue';
import UiAlert from '../components/UiAlert.vue';
import MetaTable from '../components/MetaTable.vue';
import UiPagination from '../components/UiPagination.vue';
import { field } from './_fixtures';
import type { MetaTablePage, MetaTableSort } from '../components/table';

const moduleFields = [
  field('name', 'name', 'Module', 'text', { searchable: true }, 0, 'module'),
  field('description', 'description', 'Description', 'text', {}, 1, 'module'),
  field('version', 'version', 'Version', 'text', {}, 2, 'module'),
  field('status', 'status', 'Status', 'select', {
    isStatus: true,
    choices: [
      { value: 'enabled', label: 'Enabled' },
      { value: 'draft', label: 'Draft' },
      { value: 'archived', label: 'Archived' },
    ],
  }, 3, 'module'),
];

const moduleRows = [
  { id: 'fleet', version: 3, data: { name: 'Fleet Management', description: 'Vehicles, maintenance schedules, and rentals.', version: '1.2.0', status: 'enabled' } },
  { id: 'crm', version: 2, data: { name: 'Customer Relations', description: 'Customers, contacts, and sales activity.', version: '1.0.0', status: 'enabled' } },
  { id: 'inventory', version: 1, data: { name: 'Inventory', description: 'Stock, warehouses, and stock movements.', version: '0.4.0', status: 'draft' } },
  { id: 'hr', version: 1, data: { name: 'People Operations', description: 'Team directory and employee lifecycle.', version: '0.1.0', status: 'draft' } },
];
const page: MetaTablePage = { items: moduleRows, total: moduleRows.length, limit: 25, offset: 0 };
const emptyPage: MetaTablePage = { items: [], total: 0, limit: 25, offset: 0 };
const search = ref('');
const status = ref('all');
const sort = ref<MetaTableSort>({ fieldId: 'name', direction: 'asc' });
const filteredRows = computed(() => moduleRows.filter((row) => {
  const term = search.value.trim().toLowerCase();
  const matchesSearch = !term || String(row.data.name).toLowerCase().includes(term) || String(row.data.description).toLowerCase().includes(term);
  const matchesStatus = status.value === 'all' || row.data.status === status.value;
  return matchesSearch && matchesStatus;
}));
const filteredPage = computed<MetaTablePage>(() => ({ ...page, items: filteredRows.value, total: filteredRows.value.length }));
function onSort(next: MetaTableSort) { sort.value = next; }
</script>

<template>
  <Story title="Mockups/ModulesIndex" group="Mockups">
    <Variant title="Data">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 class="text-2xl font-semibold">Modules</h1>
            <p class="mt-1 text-sm text-foreground-muted">Create and manage the building blocks of your workspace.</p>
          </div>
          <UiButton>New module</UiButton>
        </header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <UiInput v-model="search" class="sm:max-w-sm" type="search" placeholder="Search modules…" aria-label="Search modules" />
          <UiSelect v-model="status" class="sm:max-w-48" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </UiSelect>
          <p class="text-sm text-foreground-muted sm:ml-auto">{{ filteredRows.length }} modules</p>
        </div>
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <MetaTable :columns="moduleFields.map(field => ({ field }))" :page="filteredPage" :sort="sort" sortable clickable @update:sort="onSort" @row-click="() => {}" />
          <div class="border-t border-border p-4">
            <UiPagination :total="filteredPage.total" :limit="filteredPage.limit" :offset="filteredPage.offset" />
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Empty workspace">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <header class="flex items-start justify-between gap-4">
          <div><h1 class="text-2xl font-semibold">Modules</h1><p class="mt-1 text-sm text-foreground-muted">Create your first module to define your workspace data.</p></div>
          <UiButton>New module</UiButton>
        </header>
        <div class="rounded-lg border border-border bg-surface p-10 text-center">
          <div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface-muted text-xl text-foreground-muted">＋</div>
          <h2 class="font-semibold">No modules yet</h2>
          <p class="mx-auto mt-1 max-w-md text-sm text-foreground-muted">Modules group entities, fields, and relationships into a reusable business workspace.</p>
          <UiButton class="mt-4">Create module</UiButton>
        </div>
      </div>
    </Variant>

    <Variant title="Loading">
      <div class="space-y-6">
        <div><h1 class="text-2xl font-semibold">Modules</h1><p class="mt-1 text-sm text-foreground-muted">Loading workspace definitions…</p></div>
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <MetaTable :columns="moduleFields.map(field => ({ field }))" :page="emptyPage" loading />
        </div>
      </div>
    </Variant>

    <Variant title="Error">
      <div class="space-y-6">
        <div><h1 class="text-2xl font-semibold">Modules</h1><p class="mt-1 text-sm text-foreground-muted">Manage your workspace definitions.</p></div>
        <UiAlert variant="error" role="alert">
          We couldn't load modules. Check your connection and try again.
          <template #actions><UiButton size="sm" variant="secondary">Retry</UiButton></template>
        </UiAlert>
      </div>
    </Variant>

    <Variant title="No search results">
      <div class="space-y-6">
        <div><h1 class="text-2xl font-semibold">Modules</h1><p class="mt-1 text-sm text-foreground-muted">Manage your workspace definitions.</p></div>
        <UiInput value="no matching module" type="search" aria-label="Search modules" />
        <div class="rounded-lg border border-border bg-surface p-10 text-center">
          <h2 class="font-semibold">No modules found</h2>
          <p class="mt-1 text-sm text-foreground-muted">Try another name or clear your filters.</p>
          <UiButton class="mt-4" variant="secondary">Clear filters</UiButton>
        </div>
      </div>
    </Variant>
  </Story>
</template>
