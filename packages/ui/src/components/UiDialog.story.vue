<script setup lang="ts">
import { ref } from 'vue';
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';

const open = ref(false);
</script>

<template>
  <Story title="Primitives/Dialog">
    <Variant title="Default">
      <div class="p-4">
        <UiButton @click="open = true">
          Open dialog
        </UiButton>
        <UiDialog v-model="open">
          <template #title>
            Confirm action
          </template>
          <template #description>
            This cannot be undone.
          </template>
          <div class="flex justify-end gap-2">
            <UiButton
              variant="ghost"
              @click="open = false"
            >
              Cancel
            </UiButton>
            <UiButton
              color="error"
              @click="open = false"
            >
              Delete
            </UiButton>
          </div>
        </UiDialog>
      </div>
    </Variant>
  </Story>
</template>
