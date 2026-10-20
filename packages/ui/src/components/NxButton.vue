<script setup lang="ts">
import type { Component } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { buttonClasses, type ButtonColor, type ButtonSize, type ButtonVariant } from '../lib/button';

/**
 * The mockup's button, rendered by Nuxt UI's button. The mockup's classes are handed to Nuxt UI through its
 * `ui` prop, so the rendered element keeps the mockup's colours, heights and radius while Nuxt UI owns the
 * markup, the disabled and loading behaviour and the focus handling.
 */
const props = withDefaults(defineProps<{
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

const ui = computed(() => ({ base: buttonClasses(props.color, props.variant, props.size) }));
</script>

<template>
  <UButton
    :color="color"
    :variant="variant"
    :size="size"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    :ui="ui"
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
      v-else-if="icon"
      #leading
    >
      <component
        :is="icon"
        aria-hidden="true"
      />
    </template>
    <slot />
    <template
      v-if="trailingIcon"
      #trailing
    >
      <component
        :is="trailingIcon"
        aria-hidden="true"
      />
    </template>
  </UButton>
</template>
