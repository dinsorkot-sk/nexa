<script setup lang="ts">
import { reactive } from 'vue';
import UiInput from './UiInput.vue';
import UiLabel from './UiLabel.vue';
import UiTextarea from './UiTextarea.vue';
import UiSelect from './UiSelect.vue';

const state = reactive({ name: '', notes: '', choice: 'a' });
</script>

<template>
  <Story title="Primitives/Form controls">
    <Variant title="Input">
      <div class="max-w-sm p-4">
        <UiLabel for="story-name">
          Name
        </UiLabel>
        <UiInput
          id="story-name"
          v-model="state.name"
          placeholder="Ada Lovelace"
        />
      </div>
    </Variant>
    <Variant title="Disabled input">
      <div class="max-w-sm p-4">
        <UiInput
          model-value="Read only"
          disabled
        />
      </div>
    </Variant>
    <Variant title="Textarea">
      <div class="max-w-sm p-4">
        <UiTextarea
          v-model="state.notes"
          placeholder="Notes"
        />
      </div>
    </Variant>
    <Variant title="Select">
      <div class="max-w-sm p-4">
        <UiSelect v-model="state.choice">
          <option value="a">
            Option A
          </option>
          <option value="b">
            Option B
          </option>
        </UiSelect>
      </div>
    </Variant>
  </Story>
</template>
