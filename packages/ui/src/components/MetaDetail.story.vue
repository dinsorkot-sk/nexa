<script setup lang="ts">
import MetaDetail from './MetaDetail.vue';
import type { FieldDefinition } from '@nexa/meta';

const name: FieldDefinition = {
  id: 'name', entityId: 'e', name: 'name', label: 'Name', type: 'text', position: 0,
  options: { required: true, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};
const qty: FieldDefinition = {
  id: 'qty', entityId: 'e', name: 'qty', label: 'Quantity', type: 'integer', position: 1,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};
const due: FieldDefinition = {
  id: 'due', entityId: 'e', name: 'due', label: 'Due date', type: 'date', position: 2,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};

const fields = [name, qty, due];

const record = { id: 'r1', version: 3, data: { name: 'Widget', qty: 12, due: '2026-10-20' } };
const activity = {
  items: [
    { id: 'a2', action: 'record.updated', actorId: 'u1', actorName: 'Nok', occurredAt: '2026-10-11T09:30:00.000Z' },
    { id: 'a1', action: 'record.created', actorId: 'u2', actorName: 'Somchai', occurredAt: '2026-10-10T14:00:00.000Z' },
  ],
  total: 2,
};
const relations = [
  { relationId: 'rel1', name: 'Contains', targets: [{ id: 't1', label: 'Bolt pack' }, { id: 't2', label: 'Label sheet' }], onOpen: (id: string) => console.log('open', id) },
];
</script>

<template>
  <Story
    title="MetaDetail"
    group="Views"
  >
    <Variant title="With relations and activity">
      <div class="mx-auto max-w-2xl p-4">
        <MetaDetail
          :record="record"
          :fields="fields"
          :activity="activity"
          :relations="relations"
        />
      </div>
    </Variant>
    <Variant title="Plain text links (no onOpen)">
      <div class="mx-auto max-w-2xl p-4">
        <MetaDetail
          :record="record"
          :fields="fields"
          :activity="activity"
          :relations="[{ ...relations[0]!, onOpen: undefined }]"
        />
      </div>
    </Variant>
    <Variant title="Empty">
      <div class="mx-auto max-w-2xl p-4">
        <MetaDetail
          :record="record"
          :fields="fields"
          :activity="{ items: [], total: 0 }"
          :relations="[{ relationId: 'rel1', name: 'Contains', targets: [] }]"
        />
      </div>
    </Variant>
  </Story>
</template>
