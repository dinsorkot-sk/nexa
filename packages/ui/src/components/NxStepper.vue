<script setup lang="ts">
export interface NxStep {
  label: string;
  description?: string;
}

defineProps<{
  steps: NxStep[];
  modelValue: number;
  label: string;
}>();
</script>

<template>
  <ol
    :aria-label="label"
    class="flex w-full items-start"
  >
    <li
      v-for="(step, index) in steps"
      :key="`${index}-${step.label}`"
      :aria-current="index === modelValue ? 'step' : undefined"
      class="relative flex min-w-0 flex-1 flex-col items-center text-center"
    >
      <div
        aria-hidden="true"
        :class="[
          'z-10 flex size-8 items-center justify-center rounded-full border text-sm font-medium',
          index < modelValue && 'border-ui-primary bg-ui-primary text-ui-on-solid',
          index === modelValue && 'border-ui-primary bg-ui-bg text-ui-primary-text ring-2 ring-ui-primary/20',
          index > modelValue && 'border-ui-border-accented bg-ui-bg text-ui-text-muted',
        ]"
      >
        {{ index + 1 }}
      </div>
      <span class="mt-2 text-xs font-medium text-ui-text-highlighted">
        {{ step.label }}
      </span>
      <span
        v-if="step.description"
        class="mt-1 text-xs text-ui-text-muted"
      >{{ step.description }}</span>
      <div
        v-if="index < steps.length - 1"
        aria-hidden="true"
        class="absolute left-1/2 top-4 h-px w-full bg-ui-border-accented"
      />
    </li>
  </ol>
</template>
