<script setup lang="ts">
import { Check } from 'lucide-vue-next';

export interface NxStep {
  label: string;
  description?: string;
}

/**
 * Multi-step flow such as the CSV import, as the mockup's Stepper section: a 28px circle per step, a check on the
 * steps already done and a 2px connector that turns primary once the step before it is done.
 */
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
          'z-10 flex size-7 items-center justify-center rounded-full text-xs font-medium',
          index <= modelValue ? 'bg-ui-primary text-ui-on-solid' : 'border border-ui-border-accented bg-ui-bg text-ui-text-muted',
        ]"
      >
        <Check
          v-if="index < modelValue"
          class="size-3.5"
        />
        <template v-else>
          {{ index + 1 }}
        </template>
      </div>
      <span
        class="mt-2 text-sm font-medium"
        :class="index <= modelValue ? 'text-ui-text-highlighted' : 'text-ui-text-muted'"
      >
        {{ step.label }}
      </span>
      <span
        v-if="step.description"
        class="mt-1 text-xs text-ui-text-muted"
      >{{ step.description }}</span>
      <div
        v-if="index < steps.length - 1"
        aria-hidden="true"
        class="absolute left-1/2 top-3.5 h-0.5 w-full"
        :class="index < modelValue ? 'bg-ui-primary' : 'bg-ui-border-accented'"
      />
    </li>
  </ol>
</template>
