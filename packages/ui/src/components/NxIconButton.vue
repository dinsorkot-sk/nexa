<script setup lang="ts">
import type { Component } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { buttonClasses, type ButtonColor, type ButtonSize, type ButtonVariant } from '../lib/button';

/** An icon-only button. `label` is the accessible name and the tooltip text; it is required. */
withDefaults(defineProps<{
  icon: Component;
  label: string;
  color?: ButtonColor;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  /** Shows a spinner in place of the icon while the action is running. */
  loading?: boolean;
}>(), {
  color: 'neutral',
  variant: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :aria-label="label"
    :title="label"
    :class="buttonClasses(color, variant, size, true)"
  >
    <LoaderCircle
      v-if="loading"
      class="animate-spin"
      aria-hidden="true"
    />
    <component
      :is="icon"
      v-else
      aria-hidden="true"
    />
  </button>
</template>
