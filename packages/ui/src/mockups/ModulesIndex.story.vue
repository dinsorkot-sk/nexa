<script setup lang="ts">
/**
 * Mockup: Modules index (Builder). Module rows are ModuleDefinition-shaped fixtures. The API
 * returns no entity counts here, so none are shown. Search and the status filter are interactive.
 */
import { computed, ref } from 'vue';
import { ArrowDown, ArrowUp, ChevronRight, Plus, Search, SearchX, Upload } from 'lucide-vue-next';
import type { ModuleStatus as Status } from '@nexa/meta';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiAlert from '../components/UiAlert.vue';
import UiSkeleton from '../components/UiSkeleton.vue';
import UiPagination from '../components/UiPagination.vue';
import MockShell from './parts/MockShell.vue';
import ModuleStatus from './parts/ModuleStatus.vue';
import { relativeTime, sampleModules } from './parts/data';

const search = ref('');
const status = ref<'all' | Status>('all');
const direction = ref<'asc' | 'desc'>('asc');

const statusTabs: Array<{ key: 'all' | Status; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'enabled', label: 'Enabled' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'In review' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'archived', label: 'Archived' },
];

const countByStatus = computed(() => {
  const counts: Record<string, number> = { all: sampleModules.length };
  for (const m of sampleModules) counts[m.status] = (counts[m.status] ?? 0) + 1;
  return counts;
});

const rows = computed(() => {
  const term = search.value.trim().toLowerCase();
  const filtered = sampleModules.filter((m) =>
    (status.value === 'all' || m.status === status.value)
    && (!term || m.name.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)));
  return [...filtered].sort((a, b) => (direction.value === 'asc' ? 1 : -1) * a.name.localeCompare(b.name));
});

function clear() {
  search.value = '';
  status.value = 'all';
}
</script>

<template>
  <Story
    title="Mockups/ModulesIndex"
    group="Mockups"
  >
    <Variant title="Data">
      <MockShell
        active="modules"
        title="Modules"
        description="Define the data your workspace runs on. Each module holds entities, fields, and relations."
      >
        <template #actions>
          <UiButton color="neutral">
            <Upload
              class="mr-1.5 size-4"
              aria-hidden="true"
            />Import package
          </UiButton>
          <UiButton>
            <Plus
              class="mr-1.5 size-4"
              aria-hidden="true"
            />New module
          </UiButton>
        </template>

        <!-- Toolbar: status filter (counts come from the loaded list) + search -->
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            class="flex gap-1 overflow-x-auto"
            role="group"
            aria-label="Filter by status"
          >
            <button
              v-for="tab in statusTabs"
              :key="tab.key"
              type="button"
              :aria-pressed="status === tab.key"
              :class="[
                'flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                status === tab.key
                  ? 'border-primary bg-success-soft font-medium text-success-soft-foreground'
                  : 'border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground',
              ]"
              @click="status = tab.key"
            >
              {{ tab.label }}
              <span class="tabular-nums text-xs opacity-80">{{ countByStatus[tab.key] ?? 0 }}</span>
            </button>
          </div>
          <div class="relative w-full lg:max-w-xs">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <UiInput
              v-model="search"
              class="pl-9"
              type="search"
              placeholder="Search modules…"
              aria-label="Search modules"
            />
          </div>
        </div>

        <section
          v-if="rows.length"
          class="overflow-hidden rounded-xl border border-border bg-surface"
          aria-label="Modules"
        >
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-muted text-left text-xs font-medium text-foreground-muted">
                <th
                  class="px-4 py-2.5"
                  :aria-sort="direction === 'asc' ? 'ascending' : 'descending'"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    @click="direction = direction === 'asc' ? 'desc' : 'asc'"
                  >
                    Module
                    <component
                      :is="direction === 'asc' ? ArrowUp : ArrowDown"
                      class="size-3"
                      aria-hidden="true"
                    />
                  </button>
                </th>
                <th class="hidden px-4 py-2.5 md:table-cell">
                  Version
                </th>
                <th class="px-4 py-2.5">
                  Status
                </th>
                <th class="hidden px-4 py-2.5 sm:table-cell">
                  Updated
                </th>
                <th class="w-10 px-2 py-2.5">
                  <span class="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in rows"
                :key="m.id"
                class="group border-b border-border last:border-b-0 hover:bg-surface-muted"
              >
                <td class="px-4 py-3">
                  <a
                    href="#"
                    class="flex items-start gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    @click.prevent
                  >
                    <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-semibold group-hover:bg-surface">{{ m.name.slice(0, 1) }}</span>
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{{ m.name }}</span>
                      <span class="block truncate text-xs text-foreground-muted">{{ m.description }}</span>
                    </span>
                  </a>
                </td>
                <td class="hidden px-4 py-3 font-mono text-xs text-foreground-muted md:table-cell">
                  {{ m.version }}
                </td>
                <td class="px-4 py-3">
                  <ModuleStatus :status="m.status" />
                </td>
                <td class="hidden px-4 py-3 text-foreground-muted sm:table-cell">
                  {{ relativeTime(m.updatedAt) }}
                </td>
                <td class="px-2 py-3 text-foreground-subtle">
                  <ChevronRight
                    class="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div class="border-t border-border px-4 py-3">
            <UiPagination
              :total="rows.length"
              :limit="25"
              :offset="0"
            />
          </div>
        </section>

        <!-- No results: only when filters/search are active -->
        <section
          v-else
          class="rounded-xl border border-border bg-surface px-6 py-14 text-center"
        >
          <span class="mx-auto flex size-11 items-center justify-center rounded-full bg-surface-muted"><SearchX
            class="size-5 text-foreground-muted"
            aria-hidden="true"
          /></span>
          <h2 class="mt-3 font-semibold">
            No modules match
          </h2>
          <p class="mt-1 text-sm text-foreground-muted">
            Try another name or clear the filters.
          </p>
          <UiButton
            class="mt-4"
            color="neutral"
            @click="clear"
          >
            Clear filters
          </UiButton>
        </section>
      </MockShell>
    </Variant>

    <Variant title="Empty workspace">
      <MockShell
        active="modules"
        title="Modules"
        description="Define the data your workspace runs on."
      >
        <section class="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <h2 class="text-lg font-semibold">
            No modules yet
          </h2>
          <p class="mx-auto mt-1 max-w-md text-sm text-foreground-muted">
            Create a blank module, or import a metadata package such as the inventory, CRM, or HR templates.
          </p>
          <div class="mt-5 flex justify-center gap-2">
            <UiButton>New module</UiButton>
            <UiButton color="neutral">
              Import package
            </UiButton>
          </div>
        </section>
      </MockShell>
    </Variant>

    <Variant title="Loading">
      <MockShell
        active="modules"
        title="Modules"
        description="Loading workspace definitions…"
      >
        <div
          class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
          aria-busy="true"
        >
          <div
            v-for="n in 5"
            :key="n"
            class="flex items-center gap-3 px-4 py-4"
          >
            <UiSkeleton class="size-8" />
            <div class="flex-1 space-y-2">
              <UiSkeleton class="h-3.5 w-40" /><UiSkeleton class="h-3 w-64 max-w-full" />
            </div>
            <UiSkeleton class="h-5 w-20 rounded-full" />
          </div>
        </div>
      </MockShell>
    </Variant>

    <Variant title="Error">
      <MockShell
        active="modules"
        title="Modules"
        description="Define the data your workspace runs on."
      >
        <UiAlert
          tone="danger"
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <span>We couldn't load modules. Check your connection and try again.</span>
          <UiButton
            size="sm"
            color="neutral"
          >
            Retry
          </UiButton>
        </UiAlert>
      </MockShell>
    </Variant>
  </Story>
</template>
