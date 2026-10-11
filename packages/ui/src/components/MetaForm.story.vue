<script setup lang="ts">
import { ref } from 'vue';
import MetaForm from './MetaForm.vue';
import type { FieldDefinition, FormDefinition } from '@nexa/meta';

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
const notes: FieldDefinition = {
  id: 'notes', entityId: 'e', name: 'notes', label: 'Notes', type: 'longText', position: 3,
  options: { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: false, filterable: false, indexed: false, isStatus: false, ui: {} },
};

const fields = [name, qty, due, notes];

const form: FormDefinition = {
  id: 'f1', entityId: 'e', name: 'Main',
  sections: [
    { id: 's1', label: 'General', fieldIds: ['name', 'qty'], columns: 2, visibility: {} },
    { id: 's2', label: 'Schedule', fieldIds: ['due', 'notes'], columns: 1, visibility: {} },
  ],
  settings: {},
};

const submitting = ref(false);
const fieldErrors = ref<Record<string, string>>({});

function onSubmit() {
  submitting.value = true;
  setTimeout(() => {
    submitting.value = false;
    fieldErrors.value = {};
  }, 600);
}
</script>

<template>
  <Story
    title="MetaForm"
    group="Views"
  >
    <Variant title="Create">
      <div class="mx-auto max-w-2xl p-4">
        <MetaForm
          :form="form"
          :fields="fields"
          :submitting="submitting"
          :field-errors="fieldErrors"
          @submit="onSubmit"
        />
      </div>
    </Variant>
    <Variant title="Update with version">
      <div class="mx-auto max-w-2xl p-4">
        <MetaForm
          :form="form"
          :fields="fields"
          :initial-data="{ name: 'Item 1', qty: 3 }"
          :version="4"
          @submit="onSubmit"
        />
      </div>
    </Variant>
    <Variant title="Field errors">
      <div class="mx-auto max-w-2xl p-4">
        <MetaForm
          :form="form"
          :fields="fields"
          :field-errors="{ name: 'This name is already used' }"
        />
      </div>
    </Variant>
    <Variant title="Form error">
      <div class="mx-auto max-w-2xl p-4">
        <MetaForm
          :form="form"
          :fields="fields"
          form-error="This record was changed by someone else. Reload and try again."
        />
      </div>
    </Variant>
    <Variant title="Read-only">
      <div class="mx-auto max-w-2xl p-4">
        <MetaForm
          :form="form"
          :fields="fields"
          :initial-data="{ name: 'Item 1', qty: 3 }"
          readonly
        />
      </div>
    </Variant>
  </Story>
</template>
