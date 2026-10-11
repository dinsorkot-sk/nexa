<script setup lang="ts">
import UiBadge from './UiBadge.vue';
import UiCard from './UiCard.vue';
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
    <Variant title="Card">
      <div class="max-w-md p-4">
        <UiCard>
          <h3 class="text-base font-semibold">
            Card title
          </h3>
          <p class="mt-1 text-sm text-foreground-muted">
            Supporting text uses the muted foreground token.
          </p>
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>
