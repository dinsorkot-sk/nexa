<script setup lang="ts">
import { ref } from 'vue';
import UiCheckbox from './UiCheckbox.vue';
import UiSwitch from './UiSwitch.vue';

const checked = ref(true);
const off = ref(false);
</script>

<template>
  <Story title="Primitives/Checkbox and Switch">
    <Variant title="Checkbox">
      <div class="flex items-center gap-3 p-4">
        <UiCheckbox
          v-model="checked"
          aria-label="Active"
        />
        <UiCheckbox
          v-model="off"
          aria-label="Archived"
        />
        <UiCheckbox
          :model-value="false"
          disabled
          aria-label="Disabled"
        />
      </div>
    </Variant>
    <Variant title="Switch">
      <div class="flex items-center gap-3 p-4">
        <UiSwitch
          v-model="checked"
          aria-label="Enabled"
        />
        <UiSwitch
          :model-value="false"
          disabled
          aria-label="Disabled"
        />
      </div>
    </Variant>
  </Story>
</template>
