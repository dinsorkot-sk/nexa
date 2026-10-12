<script setup lang="ts">
/**
 * Mockup: Workspace home / module launcher.
 * Static sample data only; this story does not call the API.
 */
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import UiInput from '../components/UiInput.vue';
import UiBadge from '../components/UiBadge.vue';

const modules = [
  { id: 'fleet', name: 'Fleet Management', description: 'Vehicles, maintenance schedules, and rentals.', entities: 3, status: 'Enabled' },
  { id: 'crm', name: 'Customer Relations', description: 'Manage customers, contacts, and sales activity.', entities: 5, status: 'Enabled' },
  { id: 'inventory', name: 'Inventory', description: 'Track stock, warehouses, and stock movements.', entities: 4, status: 'Draft' },
];
</script>

<template>
  <Story title="Mockups/WorkspaceHome" group="Mockups">
    <Variant title="Module launcher">
      <div class="mx-auto max-w-[1440px] space-y-6">
        <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm text-foreground-muted">Dinsorkot Labs / Workspace</p>
            <h1 class="mt-1 text-2xl font-semibold">Your apps</h1>
            <p class="mt-1 text-sm text-foreground-muted">Open a workspace app to continue working with your data.</p>
          </div>
          <UiButton variant="secondary">Manage modules</UiButton>
        </header>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <UiInput class="sm:max-w-sm" type="search" placeholder="Search apps…" aria-label="Search apps" />
          <p class="text-sm text-foreground-muted">{{ modules.length }} apps available</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UiCard v-for="module in modules" :key="module.id" class="flex flex-col gap-4 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-sm font-semibold text-primary">
                {{ module.name.slice(0, 1) }}
              </div>
              <UiBadge :tone="module.status === 'Enabled' ? 'success' : 'warning'">{{ module.status }}</UiBadge>
            </div>
            <div class="flex-1">
              <h2 class="font-semibold">{{ module.name }}</h2>
              <p class="mt-1 text-sm text-foreground-muted">{{ module.description }}</p>
            </div>
            <div class="flex items-center justify-between border-t border-border pt-3">
              <span class="text-sm text-foreground-muted">{{ module.entities }} entities</span>
              <UiButton :disabled="module.status !== 'Enabled'" size="sm">Open app</UiButton>
            </div>
          </UiCard>
        </div>
      </div>
    </Variant>
  </Story>
</template>
