<script setup lang="ts">
import type { Component } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { buttonClasses, type ButtonColor, type ButtonSize, type ButtonVariant } from '../lib/button';

/**
 * An icon-only button. `label` is the accessible name and the tooltip text; it is required. Rendered by Nuxt UI's
 * button in its square form, with the mockup's classes supplied through the `ui` prop.
 */
const props = withDefaults(defineProps<{
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

const ui = computed(() => ({ base: buttonClasses(props.color, props.variant, props.size, true) }));
</script>

<template>
  <UButton
    square
    :color="color"
    :variant="variant"
    :size="size"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    :ui="ui"
    :aria-label="label"
    :title="label"
    :aria-busy="loading || undefined"
  >
    <template
      v-if="loading"
      #leading
    >
      <LoaderCircle
        class="animate-spin"
        aria-hidden="true"
      />
    </template>
    <template
      v-else
      #leading
    >
      <component
        :is="icon"
        aria-hidden="true"
      />
    </template>
  </UButton>
</template>
