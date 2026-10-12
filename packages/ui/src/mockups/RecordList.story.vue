<script setup lang="ts">
/**
 * Mockup: Runtime Record List (Vehicle index)
 * Purpose: Show record list using MetaTable + UiPagination with mock data.
 * Exercising: search, filtering, sorting, pagination, empty/error/loading states.
 */
import { ref } from 'vue';
import UiCard from '../components/UiCard.vue';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiBadge from '../components/UiBadge.vue';
import MetaTable from '../components/MetaTable.vue';
import UiPagination from '../components/UiPagination.vue';
import { vehicleFields, firstPage, secondPage, sampleSort, emptyPage } from './_fixtures';
import type { MetaTableSort, MetaTablePage } from '../components/table';

const columns = vehicleFields.map((field) => ({ field }));

const mockPage = ref<MetaTablePage>(firstPage);
const mockSort = ref<MetaTableSort>(sampleSort);
const search = ref('');

function onSort(sort: MetaTableSort) {
  mockSort.value = sort;
}
</script>

<template>
  <Story
    title="Mockups/RecordList"
    group="Mockups"
  >
    <Variant title="Data">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <!-- Page header -->
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Vehicles</h1>
            <p class="mt-1 text-sm text-foreground-muted">Browse, search, and manage fleet vehicles.</p>
          </div>
          <div class="flex items-center gap-2">
            <UiButton variant="secondary">Import CSV</UiButton>
            <UiButton variant="primary">New vehicle</UiButton>
          </div>
        </div>

        <!-- Toolbar: search + filters -->
        <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div class="flex-1">
            <UiInput
              v-model="search"
              type="search"
              placeholder="Search vehicles…"
              aria-label="Search vehicles"
            />
          </div>
          <UiButton variant="secondary">
            Status: All
          </UiButton>
        </div>

        <!-- Result count -->
        <p class="text-sm text-foreground-muted">12 records · sorted by Plate ascending</p>

        <!-- Table -->
        <UiCard class="overflow-hidden p-0">
          <MetaTable
            :columns="columns"
            :page="mockPage"
            :sort="mockSort"
            sortable
            clickable
            @update:sort="onSort"
          />
          <div class="border-t border-border p-4">
            <UiPagination
              :total="mockPage.total"
              :limit="mockPage.limit"
              :offset="mockPage.offset"
            />
          </div>
        </UiCard>
      </div>
    </Variant>

    <Variant title="No Results">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Vehicles</h1>
            <p class="mt-1 text-sm text-foreground-muted">Browse, search, and manage fleet vehicles.</p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div class="flex-1">
            <UiInput
              value="zzz-no-match"
              type="search"
              aria-label="Search vehicles"
            />
          </div>
        </div>

        <UiCard class="p-0">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            empty-title="No vehicles match your search"
            empty-description="Try a different keyword or clear the filters."
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Empty Collection">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Vehicles</h1>
            <p class="mt-1 text-sm text-foreground-muted">Browse, search, and manage fleet vehicles.</p>
          </div>
          <UiButton variant="primary">New vehicle</UiButton>
        </div>

        <UiCard class="p-0">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            empty-title="No vehicles yet"
            empty-description="Create your first vehicle to start tracking the fleet."
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Loading">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Vehicles</h1>
          <p class="mt-1 text-sm text-foreground-muted">Browse, search, and manage fleet vehicles.</p>
        </div>
        <UiCard class="p-0">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            loading
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Error">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Vehicles</h1>
          <p class="mt-1 text-sm text-foreground-muted">Browse, search, and manage fleet vehicles.</p>
        </div>
        <UiCard class="p-0">
          <MetaTable
            :columns="columns"
            :page="emptyPage"
            error="Could not load vehicles. The server may be unreachable."
            :retry="() => console.log('retry')"
          />
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>