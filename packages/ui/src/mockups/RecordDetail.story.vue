<script setup lang="ts">
/**
 * Mockup: Record Detail
 * Purpose: Show stored vehicle values + relation links + activity trail
 * using MetaDetail with fabricated data.
 */
import UiCard from '../components/UiCard.vue';
import UiBadge from '../components/UiBadge.vue';
import UiButton from '../components/UiButton.vue';
import MetaDetail from '../components/MetaDetail.vue';
import { vehicleFields, vehicleRows } from './_fixtures';

const row = vehicleRows[0];

const activity = {
  items: [
    { id: 'a2', action: 'record.updated', actorId: 'u1', actorName: 'Nok', occurredAt: '2026-10-11T09:30:00.000Z' },
    { id: 'a1', action: 'record.created', actorId: 'u2', actorName: 'Somchai', occurredAt: '2026-10-10T14:00:00.000Z' },
  ],
  total: 2,
};

const relations = [
  {
    relationId: 'contains',
    name: 'Maintenance history',
    targets: [
      { id: 'm-01', label: 'Oil change — 2026-09-18' },
      { id: 'm-02', label: 'Brake inspection — 2026-07-02' },
    ],
    onOpen: (id: string) => console.log('open', id),
  },
];

const noRelations = [{ ...relations[0], targets: [] }];
</script>

<template>
  <Story
    title="Mockups/RecordDetail"
    group="Mockups"
  >
    <Variant title="With relations and activity">
      <div class="mx-auto max-w-3xl space-y-6">
        <!-- Page header -->
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">กข-1234</h1>
            <p class="mt-1 text-sm text-foreground-muted">Toyota Altis · 2021 · version 3</p>
          </div>
          <div class="flex items-center gap-2">
            <UiButton variant="secondary">Edit</UiButton>
            <UiButton variant="danger">Archive</UiButton>
          </div>
        </div>

        <MetaDetail
          :record="{ id: row.id, version: row.version, data: row.data }"
          :fields="vehicleFields"
          :activity="activity"
          :relations="relations"
        />
      </div>
    </Variant>

    <Variant title="No relations yet">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">กข-1234</h1>
          <p class="mt-1 text-sm text-foreground-muted">Toyota Altis · 2021</p>
        </div>

        <MetaDetail
          :record="{ id: row.id, version: row.version, data: row.data }"
          :fields="vehicleFields"
          :activity="activity"
          :relations="noRelations"
        />
      </div>
    </Variant>

    <Variant title="Plain text links (no onOpen)">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">กข-1234</h1>
          <p class="mt-1 text-sm text-foreground-muted">Viewer role: links are not clickable.</p>
        </div>

        <MetaDetail
          :record="{ id: row.id, version: row.version, data: row.data }"
          :fields="vehicleFields"
          :activity="activity"
          :relations="[{ ...relations[0], onOpen: undefined }]"
        />
      </div>
    </Variant>

    <Variant title="Empty activity">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">กข-1234</h1>
        </div>

        <MetaDetail
          :record="{ id: row.id, version: row.version, data: row.data }"
          :fields="vehicleFields"
          :activity="{ items: [], total: 0 }"
          :relations="noRelations"
        />
      </div>
    </Variant>
  </Story>
</template>