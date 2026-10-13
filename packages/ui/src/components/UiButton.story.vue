<script setup lang="ts">
import { Plus, ArrowRight } from 'lucide-vue-next';
import UiButton from './UiButton.vue';

const variants = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'] as const;
const colors = ['primary', 'neutral', 'error'] as const;
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
</script>

<template>
  <Story title="Primitives/Button">
    <Variant title="Variants and colors">
      <div class="grid gap-3 p-4">
        <div
          v-for="variant in variants"
          :key="variant"
          class="flex flex-wrap items-center gap-3"
        >
          <span class="w-16 text-xs text-foreground-muted">{{ variant }}</span>
          <UiButton
            v-for="color in colors"
            :key="color"
            :variant="variant"
            :color="color"
          >
            {{ color }}
          </UiButton>
        </div>
      </div>
    </Variant>
    <Variant title="Sizes">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiButton
          v-for="size in sizes"
          :key="size"
          :size="size"
        >
          {{ size }}
        </UiButton>
      </div>
    </Variant>
    <Variant title="Icons and square">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiButton :leading-icon="Plus">
          Add item
        </UiButton>
        <UiButton
          color="neutral"
          variant="outline"
          :trailing-icon="ArrowRight"
        >
          Next
        </UiButton>
        <UiButton
          square
          size="md"
          :leading-icon="Plus"
          aria-label="Add"
        />
        <UiButton
          square
          size="sm"
          variant="ghost"
          color="neutral"
          :leading-icon="Plus"
          aria-label="Add"
        />
      </div>
    </Variant>
    <Variant title="Block layout">
      <div class="max-w-xs space-y-2 p-4">
        <UiButton block>
          Block primary
        </UiButton>
        <UiButton
          block
          variant="outline"
          color="neutral"
        >
          Block neutral
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
