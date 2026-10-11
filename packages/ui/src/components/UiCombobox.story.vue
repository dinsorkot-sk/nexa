<script setup lang="ts">
import { ref } from 'vue';
import UiCombobox from './UiCombobox.vue';
import UiFieldWrapper from './UiFieldWrapper.vue';
import type { LoadOptions } from './combobox';

const people = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank'].map((name) => ({ value: `id-${name.toLowerCase()}`, label: name }));
const load: LoadOptions = async (search) => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return people.filter((person) => person.label.toLowerCase().includes(search.toLowerCase()));
};
const failing: LoadOptions = async () => { throw new Error('offline'); };

const single = ref<string | undefined>('id-bob');
const many = ref<string[]>(['id-alice']);
</script>

<template>
  <Story title="Primitives/Combobox">
    <Variant title="Single (server-side search)">
      <div class="max-w-sm p-4">
        <UiFieldWrapper
          label="Owner"
          help-text="Type to search"
        >
          <template #default="{ id, describedBy }">
            <UiCombobox
              :id="id"
              v-model="single"
              :load-options="load"
              :selected="people"
              :described-by="describedBy"
              placeholder="Search people"
            />
          </template>
        </UiFieldWrapper>
      </div>
    </Variant>
    <Variant title="Multiple">
      <div class="max-w-sm p-4">
        <UiCombobox
          v-model="many"
          multiple
          :load-options="load"
          :selected="people"
          placeholder="Add people"
        />
      </div>
    </Variant>
    <Variant title="Error state">
      <div class="max-w-sm p-4">
        <UiCombobox
          :load-options="failing"
          placeholder="Click to see the error"
        />
      </div>
    </Variant>
  </Story>
</template>
