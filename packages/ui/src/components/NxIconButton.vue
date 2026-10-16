<script setup lang="ts">
import type { Component } from 'vue';
import { buttonStyles, type ButtonColor, type ButtonSize } from '../lib/button';

/** An icon-only button. `label` is the accessible name and the tooltip text; it is required. */
withDefaults(defineProps<{
  icon: Component;
  label: string;
  color?: ButtonColor;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>(), {
  color: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    :class="buttonStyles({ color, size, iconOnly: true })"
  >
    <component
      :is="icon"
      aria-hidden="true"
    />
  </button>
</template>
