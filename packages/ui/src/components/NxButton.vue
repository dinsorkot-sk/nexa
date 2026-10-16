<script setup lang="ts">
import type { Component } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { buttonStyles, type ButtonColor, type ButtonSize } from '../lib/button';

withDefaults(defineProps<{
  color?: ButtonColor;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  /** Shows a spinner in place of the leading icon and blocks clicks. */
  loading?: boolean;
  icon?: Component;
  trailingIcon?: Component;
}>(), {
  color: 'primary',
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
    :class="buttonStyles({ color, size })"
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
