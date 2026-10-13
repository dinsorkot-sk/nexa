<script setup lang="ts">
/**
 * Mockup: Runtime record list. Uses the real MetaTable + UiPagination with entity-record fixtures.
 * Toolbar follows the API contract: free-text search, filter on filterable fields, one sort.
 * CSV import/export exist in the runtime today (client side), so both are offered; bulk actions
 * are not supported by the API and are deliberately absent.
 */
import { computed, ref } from 'vue';
import { Download, Plus, Search, Upload } from 'lucide-vue-next';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiSelect from '../components/UiSelect.vue';
import UiPagination from '../components/UiPagination.vue';
import MetaTable from '../components/MetaTable.vue';
import MockShell from './parts/MockShell.vue';
import { emptyPage, sampleSort, vehicleFields, vehicleRows } from './_fixtures';
import type { MetaTablePage, MetaTableSort } from '../components/table';

const columns = vehicleFields.filter((f) => f.id !== 'lastService' && f.id !== 'active').map((field) => ({ field }));
const search = ref('');
const status = ref('all');
const sort = ref<MetaTableSort>(sampleSort);

const rows = computed(() => {
  const term = search.value.trim().toLowerCase();
  const filtered = vehicleRows.filter((r) =>
    (status.value === 'all' || r.data.status === status.value)
    && (!term || Object.values(r.data).some((v) => String(v).toLowerCase().includes(term))));
  const s = sort.value;
  if (!s) return filtered;
  return [...filtered].sort((a, b) => (s.direction === 'asc' ? 1 : -1) * String(a.data[s.fieldId]).localeCompare(String(b.data[s.fieldId]), 'th'));
});
const page = computed<MetaTablePage>(() => ({ items: rows.value, total: rows.value.length, limit: 25, offset: 0 }));
const filtering = computed(() => Boolean(search.value || status.value !== 'all'));
function reset() { search.value = ''; status.value = 'all'; }
</script>

<template>
  <Story
    title="Mockups/RecordList"
    group="Mockups"
  >
    <Variant title="Data">
      <MockShell
        active="apps"
        title="Vehicles"
        description="Browse and manage the vehicles in your fleet."
        :crumbs="['Apps', 'Fleet Management']"
      >
        <template #actions>
          <UiButton color="neutral">
            <Upload
              class="mr-1.5 size-4"
              aria-hidden="true"
            />Import CSV
          </UiButton>
          <UiButton color="neutral">
            <Download
              class="mr-1.5 size-4"
              aria-hidden="true"
            />Export
          </UiButton>
          <UiButton>
            <Plus
              class="mr-1.5 size-4"
              aria-hidden="true"
            />New vehicle
          </UiButton>
        </template>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative flex-1 sm:max-w-sm">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <UiInput
              v-model="search"
              class="pl-9"
              type="search"
              placeholder="Search vehicles…"
              aria-label="Search vehicles"
            />
          </div>
          <UiSelect
            v-model="status"
            class="sm:w-48"
            aria-label="Filter by status"
          >
            <option value="all">
              Status: all
            </option>
            <option value="available">
              Available
            </option>
            <option value="rented">
              Rented
            </option>
            <option value="maintenance">
              Maintenance
            </option>
          </UiSelect>
          <UiButton
            v-if="filtering"
            variant="ghost"
            @click="reset"
          >
            Clear
          </UiButton>
          <p class="text-sm text-foreground-muted sm:ml-auto">
            {{ rows.length }} of {{ vehicleRows.length }} vehicles
          </p>
        </div>

        <div class="overflow-hidden rounded-xl border border-border bg-surface">
          <MetaTable
            :columns="columns"
            :page="page"
            :sort="sort"
            sortable
            clickable
            currency="THB"
            empty-title="No vehicles match"
            empty-description="Try another keyword or clear the filters."
            @update:sort="(s) => (sort = s)"
          />
          <div class="border-t border-border px-4 py-3">
            <UiPagination
              :total="page.total"
              :limit="page.limit"
              :offset="page.offset"
            />
          </div>
        </div>
      </MockShell>
    </Variant>

    <Variant title="Empty collection">
      <MockShell
        active="apps"
        title="Vehicles"
        description="Browse and manage the vehicles in your fleet."
        :crumbs="['Apps', 'Fleet Management']"
      >
        <template #actions>
          <UiButton>New vehicle</UiButton>
        </template>
        <div class="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <h2 class="text-lg font-semibold">
            No vehicles yet
          </h2>
          <p class="mx-auto mt-1 max-w-md text-sm text-foreground-muted">
            Add the first vehicle, or import several at once from a CSV file.
          </p>
          <div class="mt-5 flex justify-center gap-2">
            <UiButton>New vehicle</UiButton><UiButton color="neutral">
              Import CSV
            </UiButton>
          </div>
        </div>
      </MockShell>
    </Variant>

    <Variant title="Loading">
      <MockShell
        active="apps"
        title="Vehicles"
        :crumbs="['Apps', 'Fleet Management']"
      >
        <div class="overflow-hidden rounded-xl border border-border bg-surface">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            loading
          />
        </div>
      </MockShell>
    </Variant>

    <Variant title="Error">
      <MockShell
        active="apps"
        title="Vehicles"
        :crumbs="['Apps', 'Fleet Management']"
      >
        <div class="overflow-hidden rounded-xl border border-border bg-surface">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            error="Could not load vehicles. The server may be unreachable."
            :retry="() => undefined"
          />
        </div>
      </MockShell>
    </Variant>
  </Story>
</template>
