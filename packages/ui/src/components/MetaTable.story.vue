<script setup lang="ts">
import { ref } from 'vue';
import MetaTable from './MetaTable.vue';
import type { MetaTableSort } from './table';
import type { FieldDefinition } from '@nexa/meta';

const textField: FieldDefinition = {
  id: 'name', entityId: 'e', name: 'name', label: 'Name', type: 'text', position: 0,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: true, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};
const numberField: FieldDefinition = {
  id: 'qty', entityId: 'e', name: 'qty', label: 'Quantity', type: 'integer', position: 1,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};
const dateField: FieldDefinition = {
  id: 'due', entityId: 'e', name: 'due', label: 'Due date', type: 'date', position: 2,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} },
};
const statusField: FieldDefinition = {
  id: 'status', entityId: 'e', name: 'status', label: 'Status', type: 'select', position: 3,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, choices: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }] },
};

const columns = [textField, numberField, dateField, statusField].map((field) => ({ field }));

const rows = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i + 1}`,
  version: 1,
  data: {
    name: `Item ${i + 1}`,
    qty: (i + 1) * 3,
    due: `2026-1${(i % 2) + 1}-1${(i % 9) + 1}`,
    status: i % 3 === 0 ? 'done' : 'open',
  },
}));

const sort = ref<MetaTableSort>(null);

function onSort(next: MetaTableSort) {
  sort.value = next;
}
</script>

<template>
  <Story
    title="MetaTable"
    group="Views"
  >
    <Variant title="Data">
      <div class="p-4">
        <MetaTable
          :columns="columns"
          :page="{ items: rows.slice(0, 8), total: 12, limit: 8, offset: 0 }"
          :sort="sort"
          sortable
          clickable
          @update:sort="onSort"
        />
      </div>
    </Variant>
    <Variant title="Loading">
      <div class="p-4">
        <MetaTable
          :columns="columns"
          :page="{ items: [], total: 0, limit: 25, offset: 0 }"
          loading
        />
      </div>
    </Variant>
    <Variant title="Empty">
      <div class="p-4">
        <MetaTable
          :columns="columns"
          :page="{ items: [], total: 0, limit: 25, offset: 0 }"
        />
      </div>
    </Variant>
    <Variant title="Error">
      <div class="p-4">
        <MetaTable
          :columns="columns"
          :page="{ items: [], total: 0, limit: 25, offset: 0 }"
          error="Network failed"
          :retry="() => undefined"
        />
      </div>
    </Variant>
  </Story>
</template>
