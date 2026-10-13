<script setup lang="ts">
/**
 * Mockup-only application shell (not a shared component API). Every Mockups story composes this
 * so the sidebar, header, and spacing stay identical across screens. Nav destinations map to
 * areas the backend really serves: modules, records (runtime apps), /audit, and /members.
 */
import { ref } from 'vue';
import {
  Activity, AppWindow, ChevronRight, ChevronsUpDown, LayoutDashboard, LogOut, Menu, Search, Settings2, Users, Boxes, X,
} from 'lucide-vue-next';
import UiTooltip from '../../components/UiTooltip.vue';

type NavKey = 'overview' | 'modules' | 'apps' | 'activity' | 'members';

defineProps<{
  active: NavKey;
  title: string;
  description?: string;
  /** Breadcrumb trail shown above the title, for nested objects only. */
  crumbs?: string[];
}>();

const drawerOpen = ref(false);

const groups = [
  { label: 'Workspace', items: [{ key: 'overview', label: 'Overview', icon: LayoutDashboard }] },
  { label: 'Build', items: [{ key: 'modules', label: 'Modules', icon: Boxes }] },
  { label: 'Run', items: [{ key: 'apps', label: 'Apps', icon: AppWindow }] },
  {
    label: 'Govern',
    items: [
      { key: 'activity', label: 'Activity', icon: Activity },
      { key: 'members', label: 'Members', icon: Users },
    ],
  },
] as const;
</script>

<template>
  <div class="flex overflow-hidden rounded-lg border border-border bg-background text-foreground">
    <!-- Sidebar (desktop) / drawer (narrow) -->
    <div
      v-if="drawerOpen"
      class="fixed inset-0 z-40 bg-overlay md:hidden"
      @click="drawerOpen = false"
    />
    <aside
      :class="[
        'z-50 w-64 shrink-0 flex-col border-r border-border bg-surface md:static md:flex',
        drawerOpen ? 'fixed inset-y-0 left-0 flex' : 'hidden',
      ]"
      aria-label="Primary"
    >
      <div class="p-3">
        <div
          class="flex w-full items-center gap-3 rounded-lg p-2 text-left"
          aria-label="Current organization"
        >
          <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">N</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold">Dinsorkot Labs</span>
            <span class="block truncate text-xs text-foreground-muted">Organization · Owner</span>
          </span>
          <ChevronsUpDown
            class="size-4 text-foreground-subtle"
            aria-hidden="true"
          />
        </div>

        <!-- Sample only: search is not connected in the mockup -->
        <button
          type="button"
          disabled
          title="Search is not part of this mockup"
          class="mt-3 flex w-full cursor-not-allowed items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground-subtle"
        >
          <Search
            class="size-4"
            aria-hidden="true"
          />
          <span class="flex-1 text-left">Search (sample)</span>
          <kbd class="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground-subtle">Ctrl K</kbd>
        </button>
      </div>

      <nav
        class="flex-1 space-y-5 overflow-y-auto px-3 pb-3 pt-1"
        aria-label="Primary navigation"
      >
        <div
          v-for="group in groups"
          :key="group.label"
        >
          <p class="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
            {{ group.label }}
          </p>
          <!-- Static: the mockup shows where the page sits; navigation is not wired -->
          <span
            v-for="item in group.items"
            :key="item.key"
            :aria-current="item.key === active ? 'page' : undefined"
            :class="[
              'relative flex items-center gap-3 rounded-md px-2 py-2 text-sm',
              item.key === active
                ? 'bg-surface-muted font-medium text-foreground'
                : 'text-foreground-muted',
            ]"
          >
            <span
              v-if="item.key === active"
              class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <component
              :is="item.icon"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
            {{ item.label }}
          </span>
        </div>
      </nav>

      <div class="border-t border-border p-3">
        <div class="flex items-center gap-3 rounded-lg p-2">
          <span class="flex size-8 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">SK</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">Sakda K.</span>
            <span class="block truncate text-xs text-foreground-muted">sakda@example.com</span>
          </span>
          <UiTooltip text="Sign out (not in mockup)">
            <button
              type="button"
              disabled
              class="cursor-not-allowed rounded p-1.5 text-foreground-subtle"
              aria-label="Sign out (not in mockup)"
            >
              <LogOut
                class="size-4"
                aria-hidden="true"
              />
            </button>
          </UiTooltip>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
        <button
          type="button"
          class="rounded-md p-2 text-foreground-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open navigation"
          @click="drawerOpen = true"
        >
          <Menu
            class="size-5"
            aria-hidden="true"
          />
        </button>
        <span class="text-sm font-semibold">Nexa</span>
        <button
          v-if="drawerOpen"
          type="button"
          class="ml-auto rounded-md p-2 text-foreground-muted hover:bg-surface-muted"
          aria-label="Close navigation"
          @click="drawerOpen = false"
        >
          <X
            class="size-5"
            aria-hidden="true"
          />
        </button>
      </header>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
          <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <nav
                v-if="crumbs?.length"
                aria-label="Breadcrumb"
                class="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-foreground-muted"
              >
                <template
                  v-for="(crumb, index) in crumbs"
                  :key="crumb"
                >
                  <span>{{ crumb }}</span>
                  <ChevronRight
                    v-if="index < crumbs.length - 1"
                    class="size-3"
                    aria-hidden="true"
                  />
                </template>
              </nav>
              <h1 class="text-2xl font-semibold tracking-tight">
                {{ title }}
              </h1>
              <p
                v-if="description"
                class="mt-1 max-w-2xl text-sm text-foreground-muted"
              >
                {{ description }}
              </p>
              <slot name="meta" />
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <slot name="actions" />
            </div>
          </header>
          <slot />
          <p class="flex items-center gap-1.5 border-t border-border pt-4 text-xs text-foreground-subtle">
            <Settings2
              class="size-3.5"
              aria-hidden="true"
            />
            Mockup · sample data only · no API connection
          </p>
        </div>
      </main>
    </div>
  </div>
</template>
