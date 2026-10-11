<script setup lang="ts">
import UiButton from './UiButton.vue';
</script>

<template>
  <Story title="Primitives/Button">
    <Variant title="Variants">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiButton>Primary</UiButton>
        <UiButton variant="secondary">
          Secondary
        </UiButton>
        <UiButton variant="ghost">
          Ghost
        </UiButton>
        <UiButton variant="danger">
          Danger
        </UiButton>
      </div>
    </Variant>
    <Variant title="Sizes">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiButton size="sm">
          Small
        </UiButton>
        <UiButton size="md">
          Medium
        </UiButton>
        <UiButton size="lg">
          Large
        </UiButton>
      </div>
    </Variant>
    <Variant title="States">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiButton disabled>
          Disabled
        </UiButton>
        <UiButton loading>
          Loading
        </UiButton>
      </div>
    </Variant>
  </Story>
</template>
