<script setup lang="ts">
import UiAlert from './UiAlert.vue';
import UiEmptyState from './UiEmptyState.vue';
import UiFieldWrapper from './UiFieldWrapper.vue';
import UiInput from './UiInput.vue';
import UiSkeleton from './UiSkeleton.vue';
import UiSpinner from './UiSpinner.vue';

const alertVariants = ['solid', 'soft', 'outline', 'subtle'] as const;
const alertColors = ['primary', 'neutral', 'success', 'warning', 'danger'] as const;
</script>

<template>
  <Story title="Primitives/Status and feedback">
    <Variant title="Alerts (tones)">
      <div class="grid max-w-md gap-2 p-4">
        <UiAlert>Neutral note</UiAlert>
        <UiAlert tone="success">
          Saved
        </UiAlert>
        <UiAlert tone="warning">
          Check this
        </UiAlert>
        <UiAlert tone="danger">
          Something failed
        </UiAlert>
      </div>
    </Variant>
    <Variant title="Alert variants × colors">
      <div class="grid max-w-2xl gap-4 p-4">
        <div
          v-for="variant in alertVariants"
          :key="variant"
        >
          <p class="mb-1 text-xs font-medium text-foreground-muted">
            {{ variant }}
          </p>
          <div class="grid gap-1.5">
            <UiAlert
              v-for="color in alertColors"
              :key="color"
              :variant="variant"
              :color="color"
            >
              {{ variant }} {{ color }}
            </UiAlert>
          </div>
        </div>
      </div>
    </Variant>
    <Variant title="Loading">
      <div class="grid max-w-md gap-3 p-4">
        <UiSpinner />
        <UiSkeleton class="h-4 w-48" />
        <UiSkeleton class="h-10 w-full" />
      </div>
    </Variant>
    <Variant title="Empty state">
      <div class="max-w-md p-4">
        <UiEmptyState />
      </div>
    </Variant>
    <Variant title="Field wrapper">
      <div class="grid max-w-sm gap-4 p-4">
        <UiFieldWrapper
          label="Email"
          help-text="We never share it"
          required
        >
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :aria-describedby="describedBy"
            />
          </template>
        </UiFieldWrapper>
        <UiFieldWrapper
          label="Email"
          error="Expected a valid email"
          required
        >
          <template #default="{ id, describedBy, invalid }">
            <UiInput
              :id="id"
              :aria-describedby="describedBy"
              :aria-invalid="invalid || undefined"
            />
          </template>
        </UiFieldWrapper>
      </div>
    </Variant>
  </Story>
</template>
