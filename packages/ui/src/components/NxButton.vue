<script setup lang="ts">
import type { Component } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { buttonClasses, type ButtonColor, type ButtonSize, type ButtonVariant } from '../lib/button';

withDefaults(defineProps<{
  /** Intent: primary, secondary, success, info, warning, error or neutral. */
  color?: ButtonColor;
  /** Emphasis: solid, outline, soft, subtle, ghost or link. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  /** Shows a spinner in place of the leading icon and blocks clicks, as the mockup's Loading state. */
  loading?: boolean;
  icon?: Component;
  trailingIcon?: Component;
}>(), {
  color: 'primary',
  variant: 'solid',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  icon: undefined,
  trailingIcon: undefined,
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="buttonClasses(color, variant, size)"
  >
    <LoaderCircle
      v-if="loading"
      class="animate-spin"
      aria-hidden="true"
    />
    <component
      :is="icon"
      v-else-if="icon"
      aria-hidden="true"
    />
    <slot />
    <component
      :is="trailingIcon"
      v-if="trailingIcon"
      aria-hidden="true"
    />
  </button>
</template>
