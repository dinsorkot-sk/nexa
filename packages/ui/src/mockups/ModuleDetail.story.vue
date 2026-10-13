<script setup lang="ts">
/**
 * Mockup: Module detail (Builder). Header shows identity and the real lifecycle state; only
 * transitions allowed by `canTransitionModuleStatus` are offered. Relations spell out
 * Source / Type / Target (Directus pattern) using the four RelationTypeSchema values.
 */
import { computed, ref } from 'vue';
import { ArrowRight, Check, ChevronRight, Link2, Plus } from 'lucide-vue-next';
import { canTransitionModuleStatus, type ModuleStatus as Status } from '@nexa/meta';
import UiButton from '../components/UiButton.vue';
import UiAlert from '../components/UiAlert.vue';
import UiBadge from '../components/UiBadge.vue';
import UiDialog from '../components/UiDialog.vue';
import MockShell from './parts/MockShell.vue';
import ModuleStatus from './parts/ModuleStatus.vue';
import {
  relationTypeLabel, relativeTime, sampleAutomations, sampleEntities, sampleModules, sampleRelations, sampleWorkflows,
} from './parts/data';

const tab = ref<'overview' | 'entities' | 'relations' | 'workflows'>('entities');
// Only sections backed by a real route (apps/server/hono/routes/*) appear here.
const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'entities', label: `Entities (${sampleEntities.length})` },
  { key: 'relations', label: `Relations (${sampleRelations.length})` },
  { key: 'workflows', label: 'Workflows & automations' },
] as const;

const current = ref<Status>('draft');
const base = sampleModules[0]!;
const lifecycle: Status[] = ['draft', 'review', 'published', 'enabled'];
const nextActions = computed(() => (['review', 'draft', 'published', 'enabled', 'disabled', 'archived'] as Status[])
  .filter((to) => canTransitionModuleStatus(current.value, to) && to !== 'archived'));
const verbs: Record<Status, string> = {
  draft: 'Back to draft', review: 'Submit for review', published: 'Publish', enabled: 'Enable', disabled: 'Disable', archived: 'Archive',
};
const editable = computed(() => current.value === 'draft' || current.value === 'review');
const label = (id: string) => sampleEntities.find((e) => e.id === id)?.label ?? id;
</script>

<template>
  <Story
    title="Mockups/ModuleDetail"
    group="Mockups"
  >
    <Variant title="Entities">
      <MockShell
        active="modules"
        :title="base.name"
        :description="base.description"
        :crumbs="['Modules']"
      >
        <template #meta>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <ModuleStatus :status="current" />
            <UiBadge>v{{ base.version }}</UiBadge>
            <span class="text-xs text-foreground-muted">Updated {{ relativeTime(base.updatedAt) }}</span>
          </div>
        </template>
        <template #actions>
          <UiButton
            v-for="to in nextActions.slice(0, 1)"
            :key="to"
            @click="current = to"
          >
            {{ verbs[to] }}
          </UiButton>
          <UiButton color="neutral">
            Export package
          </UiButton>
        </template>

        <!-- Lifecycle: shows where the module is, not a fabricated progress -->
        <ol
          class="flex flex-wrap items-center gap-2 text-sm"
          aria-label="Lifecycle"
        >
          <li
            v-for="(step, i) in lifecycle"
            :key="step"
            class="flex items-center gap-2"
          >
            <span
              :class="[
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                step === current ? 'border-primary bg-success-soft font-medium text-success-soft-foreground' : 'border-border text-foreground-muted',
              ]"
              :aria-current="step === current ? 'step' : undefined"
            >
              <Check
                v-if="lifecycle.indexOf(current) > i"
                class="size-3.5"
                aria-hidden="true"
              />{{ step === 'review' ? 'In review' : step.charAt(0).toUpperCase() + step.slice(1) }}
            </span>
            <ChevronRight
              v-if="i < lifecycle.length - 1"
              class="size-4 text-foreground-subtle"
              aria-hidden="true"
            />
          </li>
        </ol>

        <UiAlert
          v-if="!editable"
          tone="neutral"
        >
          Definitions are read-only while a module is {{ current }}. Return it to draft to edit entities, fields, and relations.
        </UiAlert>

        <nav
          class="flex gap-1 overflow-x-auto border-b border-border"
          aria-label="Module sections"
        >
          <button
            v-for="t in tabs"
            :key="t.key"
            type="button"
            :aria-current="tab === t.key ? 'page' : undefined"
            :class="[
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-foreground-muted hover:text-foreground',
            ]"
            @click="tab = t.key"
          >
            {{ t.label }}
          </button>
        </nav>

        <!-- Entities -->
        <section
          v-if="tab === 'entities'"
          aria-label="Entities"
        >
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm text-foreground-muted">
              Each entity is a table of records. Open one to edit its fields.
            </p>
            <UiButton
              size="sm"
              :disabled="!editable"
            >
              <Plus
                class="mr-1 size-4"
                aria-hidden="true"
              />New entity
            </UiButton>
          </div>
          <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            <li
              v-for="e in sampleEntities"
              :key="e.id"
            >
              <a
                href="#"
                class="group flex items-center gap-4 px-4 py-3.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                @click.prevent
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-sm font-semibold">{{ e.label.slice(0, 1) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">{{ e.label }} <span class="font-normal text-foreground-muted">· {{ e.pluralLabel }}</span></span>
                  <span class="block truncate text-sm text-foreground-muted">{{ e.description }}</span>
                </span>
                <span class="hidden text-sm tabular-nums text-foreground-muted sm:block">{{ e.fieldCount }} fields</span>
                <ChevronRight
                  class="size-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </li>
          </ul>
        </section>

        <!-- Overview -->
        <section
          v-else-if="tab === 'overview'"
          class="grid gap-6 lg:grid-cols-2"
        >
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border bg-surface p-5 text-sm">
            <div><dt class="text-xs font-medium text-foreground-muted">Module ID</dt><dd class="mt-0.5 font-mono">{{ base.id }}</dd></div>
            <div><dt class="text-xs font-medium text-foreground-muted">Version</dt><dd class="mt-0.5">{{ base.version }}</dd></div>
            <div><dt class="text-xs font-medium text-foreground-muted">Status</dt><dd class="mt-0.5"><ModuleStatus :status="current" /></dd></div>
            <div><dt class="text-xs font-medium text-foreground-muted">Owner</dt><dd class="mt-0.5">Dinsorkot Labs</dd></div>
          </dl>
          <div class="rounded-xl border border-border bg-surface p-5">
            <h2 class="text-sm font-semibold">
              Lifecycle actions
            </h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Only transitions the server allows from <strong>{{ current }}</strong> are listed.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <UiButton
                v-for="to in nextActions"
                :key="to"
                color="neutral"
                size="sm"
                @click="current = to"
              >
                {{ verbs[to] }}
              </UiButton>
              <UiDialog>
                <template #trigger>
                  <UiButton
                    color="error"
                    size="sm"
                  >
                    Archive
                  </UiButton>
                </template>
                <template #title>
                  Archive “{{ base.name }}”?
                </template>
                <template #description>
                  Archiving is final: an archived module cannot be changed or re-enabled, and its apps disappear from the workspace.
                </template>
                <div class="flex justify-end gap-2">
                  <UiButton color="neutral">
                    Keep module
                  </UiButton>
                  <UiButton color="error">
                    Archive module
                  </UiButton>
                </div>
              </UiDialog>
            </div>
          </div>
        </section>

        <!-- Relations -->
        <section
          v-else-if="tab === 'relations'"
          aria-label="Relations"
        >
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm text-foreground-muted">
              How entities link to each other. Each row reads Source → Type → Target.
            </p>
            <UiButton
              size="sm"
              :disabled="!editable"
            >
              <Plus
                class="mr-1 size-4"
                aria-hidden="true"
              />New relation
            </UiButton>
          </div>
          <ul class="space-y-3">
            <li
              v-for="r in sampleRelations"
              :key="r.id"
              class="rounded-xl border border-border bg-surface p-4"
            >
              <div class="flex items-center gap-2 text-sm text-foreground-muted">
                <Link2
                  class="size-4"
                  aria-hidden="true"
                /><span class="font-medium text-foreground">{{ r.name }}</span>
              </div>
              <div class="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div class="rounded-lg border border-border bg-background px-3 py-2">
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
                    Source entity
                  </p><p class="font-medium">
                    {{ label(r.sourceEntityId) }}
                  </p>
                </div>
                <div class="flex flex-col items-center gap-1">
                  <UiBadge tone="success">
                    {{ relationTypeLabel[r.type] }}
                  </UiBadge>
                  <ArrowRight
                    class="size-4 text-foreground-subtle"
                    aria-hidden="true"
                  />
                </div>
                <div class="rounded-lg border border-border bg-background px-3 py-2">
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
                    Target entity
                  </p><p class="font-medium">
                    {{ label(r.targetEntityId) }}
                  </p>
                </div>
              </div>
              <p class="mt-3 text-xs text-foreground-muted">
                On delete: {{ r.onDelete === 'restrict' ? 'block deleting a record that still has links' : 'delete linked records too' }}
                <template v-if="r.reverseName"> · Reverse name: “{{ r.reverseName }}”</template>
              </p>
            </li>
          </ul>
        </section>

        <!-- Workflows & automations: sample rows only; the API returns the real list -->
        <section
          v-else
          aria-label="Workflows and automations"
        >
          <p class="mb-3 text-sm text-foreground-muted">
            Workflows move a record through a select field. Automations run actions after a record, workflow, or event changes.
          </p>
          <div class="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 class="mb-2 text-sm font-semibold">
                Workflows
              </h2>
              <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                <li
                  v-for="w in sampleWorkflows"
                  :key="w.id"
                  class="flex items-center gap-3 px-4 py-3"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">{{ w.name }}</span>
                    <span class="block truncate text-sm text-foreground-muted">{{ w.entity }} · field “{{ w.field }}”</span>
                  </span>
                  <UiBadge>{{ w.steps }} steps</UiBadge>
                </li>
              </ul>
            </div>
            <div>
              <h2 class="mb-2 text-sm font-semibold">
                Automations
              </h2>
              <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                <li
                  v-for="a in sampleAutomations"
                  :key="a.id"
                  class="flex items-center gap-3 px-4 py-3"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">{{ a.name }}</span>
                    <span class="block truncate text-sm text-foreground-muted">Trigger: {{ a.trigger }} · Action: {{ a.action }}</span>
                  </span>
                  <UiBadge :tone="a.failures > 0 ? 'warning' : 'neutral'">
                    {{ a.failures > 0 ? `${a.failures} failed runs` : 'No failures' }}
                  </UiBadge>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </MockShell>
    </Variant>
  </Story>
</template>
