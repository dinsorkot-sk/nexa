<script setup lang="ts">
import { reactive } from 'vue';
import { FieldTypeSchema, type FieldDefinition } from '@nexa/meta';
import MetaFieldInput from './MetaFieldInput.vue';
import MetaFieldValue from './MetaFieldValue.vue';
import UiFieldWrapper from './UiFieldWrapper.vue';
import type { LoadOptions } from './combobox';

const choices = [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'hold', label: 'On hold' }];
const people = [{ value: 'rec-1', label: 'Alice' }, { value: 'rec-2', label: 'Bob' }];

const make = (type: FieldDefinition['type']): FieldDefinition => ({
  id: type, entityId: 'demo', name: type, label: type, type, position: 0,
  options: {
    required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true,
    indexed: false, isStatus: false, ui: {},
    ...(type === 'select' || type === 'multiSelect' ? { choices } : {}),
    ...(type === 'reference' ? { referenceEntityId: 'person' } : {}),
    ...(type === 'percentage' ? { min: 0, max: 100, precision: 1 } : {}),
    ...(type === 'decimal' ? { precision: 3 } : {}),
  },
});

const samples: Record<string, unknown> = {
  text: 'Hello', longText: 'Line one\nLine two', number: 1234.5, integer: 42, decimal: 3.142, currency: 1999.5, percentage: 12.5,
  boolean: true, date: '2026-10-11', datetime: '2026-10-11T07:30:00.000Z', time: '14:30', select: 'open', multiSelect: ['open', 'hold'],
  email: 'ada@example.com', phone: '+66 81 234 5678', url: 'https://example.com', json: { a: [1, 2] },
  file: 'https://example.com/report.pdf', image: `${location.origin}/sample.svg`, reference: 'rec-1',
  computed: 12, formula: 24, autoNumber: 'INV-0001',
};

const types = FieldTypeSchema.options;
const state = reactive<Record<string, unknown>>({ ...samples });
const load: LoadOptions = async (search) => people.filter((p) => p.label.toLowerCase().includes(search.toLowerCase()));
const referenceLabel = (id: string) => people.find((p) => p.value === id)?.label;
</script>

<template>
  <Story
    title="Fields/All 23 field types"
    :layout="{ type: 'single', iframe: false }"
  >
    <Variant title="Inputs">
      <div class="grid gap-4 p-4 md:grid-cols-2">
        <UiFieldWrapper
          v-for="type in types"
          :key="type"
          :label="type"
        >
          <template #default="{ id, describedBy }">
            <MetaFieldInput
              :id="id"
              v-model="state[type]"
              :field="make(type)"
              :described-by="describedBy"
              :load-reference-options="load"
              :reference-selected="people"
            />
          </template>
        </UiFieldWrapper>
      </div>
    </Variant>
    <Variant title="Display">
      <dl class="grid gap-3 p-4 md:grid-cols-2">
        <div
          v-for="type in types"
          :key="type"
          class="rounded-md border border-border p-3"
        >
          <dt class="text-xs text-foreground-muted">
            {{ type }}
          </dt>
          <dd class="mt-1 text-sm">
            <MetaFieldValue
              :field="make(type)"
              :value="samples[type]"
              :reference-label="referenceLabel"
              currency="THB"
            />
          </dd>
        </div>
      </dl>
    </Variant>
  </Story>
</template>
