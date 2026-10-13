<script setup lang="ts">
import UiButton from './UiButton.vue';
import UiPopover from './UiPopover.vue';
import UiTooltip from './UiTooltip.vue';
</script>

<template>
  <Story title="Primitives/Popover and Tooltip">
    <Variant title="Popover">
      <div class="p-4">
        <UiPopover closable>
          <template #trigger>
            <UiButton color="neutral">
              Open popover
            </UiButton>
          </template>
          <p class="pr-4">
            Popover content sits on the surface token.
          </p>
        </UiPopover>
      </div>
    </Variant>
    <Variant title="Tooltip">
      <div class="flex gap-3 p-4">
        <UiTooltip text="Saves the record">
          <UiButton>Save</UiButton>
        </UiTooltip>
        <UiTooltip
          text="Deletes it for good"
          side="bottom"
        >
          <UiButton color="error">
            Delete
          </UiButton>
        </UiTooltip>
      </div>
    </Variant>
  </Story>
</template>
