<script setup lang="ts">
/** Mockup: Workspace overview. Stats mirror GET /v1/operations/stats; activity mirrors GET /v1/audit. */
import { ArrowUpRight, Boxes, CircleAlert, Database, History, Plus, Zap } from 'lucide-vue-next';
import UiButton from '../components/UiButton.vue';
import UiBadge from '../components/UiBadge.vue';
import UiAlert from '../components/UiAlert.vue';
import MockShell from './parts/MockShell.vue';
import ModuleStatus from './parts/ModuleStatus.vue';
import { relativeTime, sampleAudit, sampleModules, sampleStats } from './parts/data';

const apps = sampleModules.filter((m) => m.status === 'enabled');
const stats = [
  { label: 'Modules', value: String(sampleStats.modules), icon: Boxes },
  { label: 'Records', value: sampleStats.records.toLocaleString('en-US'), icon: Database },
  { label: 'Audit entries', value: String(sampleStats.auditEntries), icon: History },
  { label: 'Events', value: String(sampleStats.events), icon: Zap },
];
const failures = sampleStats.failedAutomations.reduce((sum, row) => sum + row.failures, 0);
</script>

<template>
  <Story
    title="Mockups/Overview"
    group="Mockups"
  >
    <Variant title="Overview">
      <MockShell
        active="overview"
        title="Good morning, Sakda"
        description="Open an app to work with your data, or jump back into a module you are building."
      >
        <template #actions>
          <UiButton color="neutral">
            Manage modules
          </UiButton>
          <UiButton>
            <Plus
              class="mr-1.5 size-4"
              aria-hidden="true"
            />New module
          </UiButton>
        </template>

        <UiAlert
          v-if="failures"
          tone="warning"
          class="flex items-start gap-2"
        >
          <CircleAlert
            class="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{{ failures }} automation runs failed. Review them in Activity.</span>
        </UiAlert>

        <!-- Operational numbers: one quiet strip, not four cards -->
        <dl class="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-4 sm:divide-y-0">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="p-4"
          >
            <dt class="flex items-center gap-2 text-xs font-medium text-foreground-muted">
              <component
                :is="stat.icon"
                class="size-3.5"
                aria-hidden="true"
              />{{ stat.label }}
            </dt>
            <dd class="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
              {{ stat.value }}
            </dd>
          </div>
        </dl>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="apps-h">
            <div class="mb-3 flex items-center justify-between">
              <h2
                id="apps-h"
                class="text-base font-semibold"
              >
                Your apps
              </h2>
              <span class="text-xs text-foreground-muted">Enabled modules only</span>
            </div>
            <ul class="grid gap-3 sm:grid-cols-2">
              <li
                v-for="app in apps"
                :key="app.id"
              >
                <a
                  href="#"
                  class="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  @click.prevent
                >
                  <div class="flex items-start justify-between">
                    <span class="flex size-10 items-center justify-center rounded-lg bg-success-soft text-sm font-semibold text-success-soft-foreground">{{ app.name.slice(0, 1) }}</span>
                    <ArrowUpRight
                      class="size-4 text-foreground-subtle transition-colors group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p class="font-medium">{{ app.name }}</p>
                    <p class="mt-0.5 text-sm text-foreground-muted">{{ app.description }}</p>
                  </div>
                  <p class="mt-auto text-xs text-foreground-subtle">v{{ app.version }} · updated {{ relativeTime(app.updatedAt) }}</p>
                </a>
              </li>
            </ul>
            <p class="mt-3 text-sm text-foreground-muted">
              Modules still in draft or review are managed from <a
                href="#"
                class="font-medium text-primary underline underline-offset-2"
                @click.prevent
              >Modules</a>.
            </p>
          </section>

          <section aria-labelledby="act-h">
            <div class="mb-3 flex items-center justify-between">
              <h2
                id="act-h"
                class="text-base font-semibold"
              >
                Recent activity
              </h2>
              <a
                href="#"
                class="text-sm font-medium text-primary hover:underline"
                @click.prevent
              >View all</a>
            </div>
            <ol class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              <li
                v-for="entry in sampleAudit"
                :key="entry.id"
                class="flex items-start gap-3 px-4 py-3"
              >
                <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold">{{ entry.actor.slice(0, 2).toUpperCase() }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm">
                    <span class="font-medium">{{ entry.actor }}</span>
                    <span class="text-foreground-muted"> {{ entry.action.replace('.', ' ') }} </span>
                    <span class="font-medium">{{ entry.entity }}</span>
                  </p>
                  <p class="truncate text-xs text-foreground-muted">
                    {{ entry.ref }} · {{ relativeTime(entry.occurredAt) }}
                  </p>
                </div>
                <UiBadge>{{ entry.action.split('.')[0] }}</UiBadge>
              </li>
            </ol>
          </section>
        </div>

        <section aria-labelledby="mod-h">
          <h2
            id="mod-h"
            class="mb-3 text-base font-semibold"
          >
            Modules by status
          </h2>
          <ul class="flex flex-wrap gap-2">
            <li
              v-for="m in sampleModules"
              :key="m.id"
              class="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5 text-sm"
            >
              {{ m.name }}<ModuleStatus :status="m.status" />
            </li>
          </ul>
        </section>
      </MockShell>
    </Variant>

    <Variant title="First run (no modules)">
      <MockShell
        active="overview"
        title="Welcome to Nexa"
        description="Your workspace is empty. Create a module to define the data your team works with."
      >
        <div class="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <span class="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-muted"><Boxes
            class="size-6 text-foreground-muted"
            aria-hidden="true"
          /></span>
          <h2 class="mt-4 text-lg font-semibold">
            Start with a module
          </h2>
          <p class="mx-auto mt-1 max-w-md text-sm text-foreground-muted">
            A module groups entities, fields, and relations. You can import a metadata package or start from a blank draft.
          </p>
          <div class="mt-5 flex justify-center gap-2">
            <UiButton>New module</UiButton>
            <UiButton color="neutral">
              Import package
            </UiButton>
          </div>
        </div>
      </MockShell>
    </Variant>
  </Story>
</template>
