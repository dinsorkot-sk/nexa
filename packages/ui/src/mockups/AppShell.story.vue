<script setup lang="ts">
import UiButton from '../components/UiButton.vue';
import UiBadge from '../components/UiBadge.vue';
import UiInput from '../components/UiInput.vue';

const navigation = [
  { label: 'Workspace', icon: 'W', active: false },
  { label: 'Modules', icon: 'M', active: true },
  { label: 'Runtime apps', icon: 'A', active: false },
];
</script>

<template>
  <Story title="Mockups/AppShell" group="Mockups">
    <Variant title="Desktop shell">
      <div class="min-h-[680px] overflow-hidden rounded-xl border border-border bg-background text-foreground">
        <div class="flex min-h-[680px]">
          <aside class="hidden w-60 shrink-0 flex-col border-r border-border bg-surface p-3 sm:flex">
            <div class="flex items-center gap-3 px-2 py-3">
              <div class="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">N</div>
              <div class="min-w-0"><p class="font-semibold">Nexa</p><p class="truncate text-xs text-foreground-muted">Dinsorkot Labs</p></div>
            </div>
            <div class="mt-4 rounded-md border border-border px-3 py-2">
              <p class="text-xs text-foreground-muted">Workspace</p>
              <p class="mt-1 truncate text-sm font-medium">Dinsorkot Labs</p>
            </div>
            <nav class="mt-5 space-y-1" aria-label="Primary navigation">
              <a v-for="item in navigation" :key="item.label" href="#" class="flex items-center gap-3 rounded-md px-3 py-2 text-sm" :class="item.active ? 'bg-surface-muted font-medium text-foreground' : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'" :aria-current="item.active ? 'page' : undefined" @click.prevent>
                <span class="flex size-6 items-center justify-center rounded border border-border text-xs">{{ item.icon }}</span>{{ item.label }}
              </a>
            </nav>
            <div class="mt-auto border-t border-border pt-3">
              <div class="flex items-center gap-3 rounded-md p-2">
                <div class="flex size-8 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">SK</div>
                <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">Workspace admin</p><p class="truncate text-xs text-foreground-muted">admin@example.com</p></div>
                <button class="rounded p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Account menu">•••</button>
              </div>
            </div>
          </aside>
          <main class="min-w-0 flex-1">
            <header class="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
              <div class="min-w-0"><p class="text-xs text-foreground-muted">Workspace / Builder</p><h1 class="mt-1 text-lg font-semibold">Modules</h1></div>
              <div class="flex items-center gap-2"><UiButton variant="secondary" size="sm">Help</UiButton><UiButton size="sm">New module</UiButton></div>
            </header>
            <div class="space-y-5 p-4 sm:p-6">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="max-w-xl text-sm text-foreground-muted">Manage modules and the entities that define your business data.</p>
                <UiInput class="sm:max-w-xs" type="search" placeholder="Search modules…" aria-label="Search modules" />
              </div>
              <section class="overflow-hidden rounded-lg border border-border bg-surface">
                <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px] gap-4 border-b border-border px-4 py-3 text-xs font-medium text-foreground-muted">
                  <span>Module</span><span>Description</span><span>Status</span>
                </div>
                <div v-for="item in [{name:'Fleet Management',description:'Vehicles, maintenance, and rentals',status:'Enabled'},{name:'Customer Relations',description:'Customers and sales activity',status:'Enabled'},{name:'Inventory',description:'Stock and warehouses',status:'Draft'}]" :key="item.name" class="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px] items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
                  <div class="min-w-0"><p class="truncate text-sm font-medium">{{ item.name }}</p><p class="mt-1 text-xs text-foreground-muted">Module definition</p></div>
                  <p class="truncate text-sm text-foreground-muted">{{ item.description }}</p>
                  <div><UiBadge :tone="item.status === 'Enabled' ? 'success' : 'warning'">{{ item.status }}</UiBadge></div>
                </div>
              </section>
              <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-muted"><span>Showing 3 illustrative modules</span><span>Mockup only · no API connection</span></div>
            </div>
          </main>
        </div>
      </div>
    </Variant>
    <Variant title="Narrow viewport">
      <div class="mx-auto min-h-[560px] max-w-sm overflow-hidden rounded-xl border border-border bg-background text-foreground">
        <header class="flex items-center justify-between border-b border-border bg-surface p-4">
          <div class="flex items-center gap-3"><div class="flex size-8 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">N</div><div><p class="text-sm font-semibold">Nexa</p><p class="text-xs text-foreground-muted">Modules</p></div></div>
          <UiButton variant="secondary" size="sm" aria-label="Open navigation">Menu</UiButton>
        </header>
        <main class="space-y-4 p-4">
          <div><h1 class="text-xl font-semibold">Modules</h1><p class="mt-1 text-sm text-foreground-muted">Manage workspace definitions.</p></div>
          <UiInput type="search" placeholder="Search modules…" aria-label="Search modules" />
          <UiButton class="w-full">New module</UiButton>
          <section class="space-y-3">
            <article v-for="item in [{name:'Fleet Management',description:'Vehicles, maintenance, and rentals',status:'Enabled'},{name:'Customer Relations',description:'Customers and sales activity',status:'Enabled'},{name:'Inventory',description:'Stock and warehouses',status:'Draft'}]" :key="item.name" class="rounded-lg border border-border bg-surface p-4">
              <div class="flex items-start justify-between gap-3"><h2 class="font-medium">{{ item.name }}</h2><UiBadge :tone="item.status === 'Enabled' ? 'success' : 'warning'">{{ item.status }}</UiBadge></div>
              <p class="mt-2 text-sm text-foreground-muted">{{ item.description }}</p>
              <button class="mt-3 text-sm font-medium text-primary">Open module →</button>
            </article>
          </section>
        </main>
      </div>
    </Variant>
  </Story>
</template>
