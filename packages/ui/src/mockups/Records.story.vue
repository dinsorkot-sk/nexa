<script setup lang="ts">
/**
 * Mockup: Record form + detail. Both use the real metadata renderers (MetaForm, MetaDetail),
 * so field rendering is never forked. Covers create, edit, validation errors, stale-write
 * conflict (409), and the read-only viewer state. `MetaDetail` is imported by path because it is
 * not exported from the @nexa/ui barrel yet.
 */
import { ref } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import UiButton from '../components/UiButton.vue';
import UiAlert from '../components/UiAlert.vue';
import UiBadge from '../components/UiBadge.vue';
import MetaForm from '../components/MetaForm.vue';
import MetaDetail from '../components/MetaDetail.vue';
import MockShell from './parts/MockShell.vue';
import { vehicleFields, vehicleForm, vehicleRows } from './_fixtures';

const existing = vehicleRows[0]!;
const submitting = ref(false);
function submit() {
  submitting.value = true;
  setTimeout(() => (submitting.value = false), 700);
}

const errors = {
  plate: 'This plate is already registered.',
  dailyRate: 'Rate must be between 0 and 100,000.',
};
const activity = {
  items: [
    { id: 'a2', action: 'record.updated', actorId: 'u1', actorName: 'Nok', occurredAt: '2026-10-11T09:30:00.000Z' },
    { id: 'a1', action: 'record.created', actorId: 'u2', actorName: 'Somchai', occurredAt: '2026-10-10T14:00:00.000Z' },
  ],
  total: 2,
};
const relations = [{
  relationId: 'maintenance',
  name: 'Maintenance history',
  targets: [{ id: 'm-01', label: 'Oil change — 2026-09-18' }, { id: 'm-02', label: 'Brake inspection — 2026-07-02' }],
  onOpen: () => undefined,
}];
const crumbs = ['Apps', 'Fleet Management', 'Vehicles'];
</script>

<template>
  <Story
    title="Mockups/Records"
    group="Mockups"
  >
    <Variant title="Detail">
      <MockShell
        active="apps"
        title="กข-1234"
        description="Toyota Altis · 2021"
        :crumbs="crumbs"
      >
        <template #meta>
          <p class="mt-2 text-xs text-foreground-muted">
            Version {{ existing.version }}
          </p>
        </template>
        <template #actions>
          <UiButton color="neutral">
            <Pencil
              class="mr-1.5 size-4"
              aria-hidden="true"
            />Edit
          </UiButton>
          <UiButton color="error">
            <Trash2
              class="mr-1.5 size-4"
              aria-hidden="true"
            />Delete
          </UiButton>
        </template>
        <MetaDetail
          :record="existing"
          :fields="vehicleFields"
          :activity="activity"
          :relations="relations"
          currency="THB"
        />
      </MockShell>
    </Variant>

    <Variant title="Create">
      <MockShell
        active="apps"
        title="New vehicle"
        description="Fields come from the Vehicle entity definition."
        :crumbs="crumbs"
      >
        <div class="max-w-3xl rounded-xl border border-border bg-surface p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :submitting="submitting"
            :cancel="() => undefined"
            @submit="submit"
          />
        </div>
      </MockShell>
    </Variant>

    <Variant title="Edit">
      <MockShell
        active="apps"
        title="กข-1234"
        description="Editing version 3"
        :crumbs="crumbs"
      >
        <div class="max-w-3xl rounded-xl border border-border bg-surface p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="existing.data"
            :version="existing.version"
            submit-label="Save changes"
            :submitting="submitting"
            :cancel="() => undefined"
            @submit="submit"
          />
        </div>
      </MockShell>
    </Variant>

    <Variant title="Validation errors">
      <MockShell
        active="apps"
        title="New vehicle"
        description="Your entries are kept when the server rejects them."
        :crumbs="crumbs"
      >
        <div class="max-w-3xl rounded-xl border border-border bg-surface p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="{ plate: 'กข-1234', make: 'Toyota', dailyRate: 999999 }"
            :field-errors="errors"
            form-error="2 fields need attention before this vehicle can be saved."
          />
        </div>
      </MockShell>
    </Variant>

    <Variant title="Conflict (409)">
      <MockShell
        active="apps"
        title="กข-1234"
        description="Someone else saved this vehicle while you were editing."
        :crumbs="crumbs"
      >
        <div class="max-w-3xl space-y-4 rounded-xl border border-border bg-surface p-6">
          <UiAlert tone="danger">
            This record was changed by someone else. Reload to see their version, or overwrite it with yours.
          </UiAlert>
          <div class="flex gap-2">
            <UiButton color="neutral">
              Reload latest
            </UiButton>
          </div>
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="{ ...existing.data, mileage: 45310 }"
            :version="existing.version"
            submit-label="Overwrite"
          />
        </div>
      </MockShell>
    </Variant>

    <Variant title="Read-only (viewer)">
      <MockShell
        active="apps"
        title="กข-1234"
        description="Toyota Altis"
        :crumbs="crumbs"
      >
        <template #meta>
          <div class="mt-2">
            <UiBadge>Viewer · read-only</UiBadge>
          </div>
        </template>
        <div class="max-w-3xl rounded-xl border border-border bg-surface p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="existing.data"
            readonly
          />
        </div>
      </MockShell>
    </Variant>
  </Story>
</template>
