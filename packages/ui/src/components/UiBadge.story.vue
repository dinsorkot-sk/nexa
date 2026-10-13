<script setup lang="ts">
import UiBadge from './UiBadge.vue';
import UiCard from './UiCard.vue';

const variants = ['solid', 'soft', 'outline', 'subtle'] as const;
const colors = ['primary', 'neutral', 'success', 'warning', 'danger'] as const;
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
</script>

<template>
  <Story title="Primitives/Badge and Card">
    <Variant title="Badge tones">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiBadge>Neutral</UiBadge>
        <UiBadge tone="success">
          Success
        </UiBadge>
        <UiBadge tone="warning">
          Warning
        </UiBadge>
        <UiBadge tone="danger">
          Danger
        </UiBadge>
      </div>
    </Variant>
    <Variant title="Badge variants">
      <div class="grid gap-3 p-4">
        <div
          v-for="variant in variants"
          :key="variant"
          class="flex flex-wrap items-center gap-3"
        >
          <span class="w-16 text-xs text-foreground-muted">{{ variant }}</span>
          <UiBadge
            v-for="color in colors"
            :key="color"
            :variant="variant"
            :color="color"
          >
            {{ color }}
          </UiBadge>
        </div>
      </div>
    </Variant>
    <Variant title="Badge sizes">
      <div class="flex flex-wrap items-center gap-3 p-4">
        <UiBadge
          v-for="size in sizes"
          :key="size"
          :size="size"
          color="primary"
        >
          {{ size }}
        </UiBadge>
      </div>
    </Variant>
    <Variant title="Card">
      <div class="grid max-w-md gap-4 p-4">
        <UiCard>
          <h3 class="text-base font-semibold">
            Card title (card variant)
          </h3>
          <p class="mt-1 text-sm text-foreground-muted">
            Elevated surface with shadow-sm.
          </p>
        </UiCard>
        <UiCard variant="flat">
          <h3 class="text-base font-semibold">
            Flat variant
          </h3>
          <p class="mt-1 text-sm text-foreground-muted">
            Subtle surface-muted without shadow.
          </p>
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>
