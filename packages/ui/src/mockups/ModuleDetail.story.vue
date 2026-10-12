<script setup lang="ts">
/**
 * Mockup: Module Detail with sub-navigation
 * Purpose: Show module overview and entity/relation tabs using @nexa/ui
 *
 * @nexa/ui primitives:
 * - UiCard, UiBadge, UiButton
 * - MetaTable for entities
 * - Mock sub-navigation tabs
 */
import { ref } from 'vue';
import UiCard from '../components/UiCard.vue';
import UiBadge from '../components/UiBadge.vue';
import UiButton from '../components/UiButton.vue';
import MetaTable from '../components/MetaTable.vue';
import { field } from './_fixtures';

/** Entity-table columns. Width is a column option, not a field option. */
const entityTableFields = [
  field('name', 'name', 'Name', 'text', { required: true }, 0, 'vehicle'),
  field('plural', 'plural', 'Plural', 'text', {}, 1, 'vehicle'),
  field('fieldCount', 'fieldCount', 'Fields', 'integer', {}, 2, 'vehicle'),
  field('status', 'status', 'Status', 'select', {
    isStatus: true,
    choices: [
      { value: 'enabled', label: 'Enabled' },
      { value: 'draft', label: 'Draft' },
    ],
  }, 3, 'vehicle'),
];

const entityColumns = [
  { field: entityTableFields[0], width: 180 },
  { field: entityTableFields[1] },
  { field: entityTableFields[2] },
  { field: entityTableFields[3], width: 120 },
];

const moduleData = {
  id: 'fleet',
  name: 'Fleet Management',
  version: '1.2.0',
  status: 'enabled',
  description: 'Vehicle fleet, maintenance scheduling, and rental tracking.',
  owner: { id: 'u-1', name: 'Dinsorkot', slug: 'dinsorkot-labs' },
};

const entityRows = [
  { id: 'vehicle', version: 5, data: { name: 'Vehicle', plural: 'Vehicles', fieldCount: 9, status: 'enabled' } },
  { id: 'maintenance', version: 3, data: { name: 'Maintenance', plural: 'Maintenance', fieldCount: 6, status: 'enabled' } },
  { id: 'rental', version: 2, data: { name: 'Rental', plural: 'Rentals', fieldCount: 5, status: 'draft' } },
];

const tabs = [
  { to: '#overview', label: 'Overview' },
  { to: '#entities', label: 'Entities' },
  { to: '#relations', label: 'Relations' },
];

const activeTab = ref('overview');
</script>

<template>
  <Story
    title="Mockups/ModuleDetail"
    group="Mockups"
  >
    <Variant title="Overview">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <!-- Page header -->
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Fleet Management</h1>
            <p class="mt-1 text-sm text-foreground-muted">Vehicle fleet, maintenance scheduling, and rental tracking.</p>
            <div class="mt-2 flex items-center gap-2">
              <UiBadge tone="success">Enabled</UiBadge>
              <UiBadge tone="neutral">v1.2.0</UiBadge>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UiButton variant="secondary">Edit module</UiButton>
            <UiButton variant="primary">Enable</UiButton>
          </div>
        </div>

        <!-- Sub-navigation -->
        <nav class="flex gap-1 overflow-x-auto border-b border-border" aria-label="Module sections">
          <a
            v-for="tab in tabs"
            :key="tab.to"
            :href="tab.to"
            :aria-current="activeTab === tab.label.toLowerCase() ? 'page' : undefined"
            class="-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="activeTab === tab.label.toLowerCase() ? 'border-primary font-medium text-foreground' : 'border-transparent text-foreground-muted hover:text-foreground'"
            @click.prevent="activeTab = tab.label.toLowerCase()"
          >
            {{ tab.label }}
          </a>
        </nav>

        <!-- Overview content -->
        <div class="grid gap-6 sm:grid-cols-2">
          <UiCard class="p-6">
            <h2 class="mb-4 text-sm font-semibold text-foreground">Module Info</h2>
            <dl class="grid gap-3 sm:grid-cols-2">
              <div>
                <dt class="text-xs font-medium text-foreground-muted">Module ID</dt>
                <dd class="text-sm font-mono text-foreground">fleet</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-foreground-muted">Version</dt>
                <dd class="text-sm text-foreground">1.2.0</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-foreground-muted">Status</dt>
                <dd class="text-sm text-foreground">
                  <UiBadge tone="success">Enabled</UiBadge>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-foreground-muted">Owner</dt>
                <dd class="text-sm text-foreground">Dinsorkot Labs (dinsorkot-labs)</dd>
              </div>
            </dl>
          </UiCard>

          <UiCard class="p-6">
            <h2 class="mb-4 text-sm font-semibold text-foreground">Entities (3)</h2>
            <ul class="space-y-2">
              <li class="flex items-center justify-between rounded-md p-2 text-sm hover:bg-surface-muted">
                <span>Vehicle <span class="text-foreground-muted ml-2 text-xs">9 fields</span></span>
                <UiBadge tone="success">Enabled</UiBadge>
              </li>
              <li class="flex items-center justify-between rounded-md p-2 text-sm hover:bg-surface-muted">
                <span>Maintenance <span class="text-foreground-muted ml-2 text-xs">6 fields</span></span>
                <UiBadge tone="success">Enabled</UiBadge>
              </li>
              <li class="flex items-center justify-between rounded-md p-2 text-sm hover:bg-surface-muted">
                <span>Rental <span class="text-foreground-muted ml-2 text-xs">5 fields</span></span>
                <UiBadge tone="warning">Draft</UiBadge>
              </li>
            </ul>
          </UiCard>
        </div>
      </div>
    </Variant>

    <Variant title="Entities">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Fleet Management</h1>
            <p class="mt-1 text-sm text-foreground-muted">Vehicle fleet, maintenance scheduling, and rental tracking.</p>
          </div>
        </div>

        <nav class="flex gap-1 overflow-x-auto border-b border-border" aria-label="Module sections">
          <a
            v-for="tab in tabs"
            :key="tab.to"
            :href="tab.to"
            :aria-current="activeTab === tab.label.toLowerCase() ? 'page' : undefined"
            class="-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="activeTab === tab.label.toLowerCase() ? 'border-primary font-medium text-foreground' : 'border-transparent text-foreground-muted hover:text-foreground'"
            @click.prevent="activeTab = tab.label.toLowerCase()"
          >
            {{ tab.label }}
          </a>
        </nav>

        <UiCard class="p-6">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 class="text-xl font-semibold">Entities</h2>
            <UiButton variant="primary">New entity</UiButton>
          </div>

          <MetaTable
            :columns="entityColumns"
            :page="{
              items: entityRows,
              total: entityRows.length,
              limit: 25,
              offset: 0,
            }"
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Relations">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">Fleet Management</h1>
            <p class="mt-1 text-sm text-foreground-muted">Vehicle fleet, maintenance scheduling, and rental tracking.</p>
          </div>
        </div>

        <nav class="flex gap-1 overflow-x-auto border-b border-border" aria-label="Module sections">
          <a
            v-for="tab in tabs"
            :key="tab.to"
            :href="tab.to"
            :aria-current="activeTab === tab.label.toLowerCase() ? 'page' : undefined"
            class="-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="activeTab === tab.label.toLowerCase() ? 'border-primary font-medium text-foreground' : 'border-transparent text-foreground-muted hover:text-foreground'"
            @click.prevent="activeTab = tab.label.toLowerCase()"
          >
            {{ tab.label }}
          </a>
        </nav>

        <UiCard class="p-6">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 class="text-xl font-semibold">Relations</h2>
            <UiButton variant="primary">New relation</UiButton>
          </div>

          <div class="space-y-4">
            <div class="rounded-lg border border-border p-4">
              <h3 class="font-medium">Vehicle → Maintenance</h3>
              <p class="mt-1 text-sm text-foreground-muted">One-to-many: each vehicle can have multiple maintenance records.</p>
            </div>
            <div class="rounded-lg border border-border p-4">
              <h3 class="font-medium">Vehicle → Rental</h3>
              <p class="mt-1 text-sm text-foreground-muted">One-to-many: each vehicle can have multiple rental records.</p>
            </div>
          </div>
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>