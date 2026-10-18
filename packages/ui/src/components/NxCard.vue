<script setup lang="ts">
import { tv } from 'tailwind-variants';

/** Container with an optional header and footer, as the mockup's Card section: 4 variants. */
export type CardVariant = 'outline' | 'soft' | 'subtle' | 'solid';

const card = tv({
  base: 'overflow-hidden rounded-ui-xl transition-shadow duration-ui ease-ui-out',
  variants: {
    variant: {
      outline: 'border border-ui-border bg-ui-bg',
      soft: 'bg-ui-bg-muted',
      subtle: 'border border-ui-border bg-ui-bg-muted',
      solid: 'bg-ui-bg-inverted',
    },
  },
  defaultVariants: { variant: 'outline' },
});

const props = withDefaults(defineProps<{
  variant?: CardVariant;
  title?: string;
  description?: string;
}>(), {
  variant: 'outline',
  title: undefined,
  description: undefined,
});

const bodyText = () => (props.variant === 'solid' ? 'text-ui-text-inverted' : 'text-ui-text');
const secondaryText = () => (props.variant === 'solid' ? 'text-ui-text-inverted' : 'text-ui-text-muted');
const divider = () => (props.variant === 'solid' ? 'border-ui-border-inverted' : 'border-ui-border');
</script>

<template>
  <div :class="card({ variant })">
    <div
      v-if="$slots.header || title"
      :class="['border-b px-4 py-4', divider()]"
    >
      <slot name="header">
        <p :class="['text-base font-semibold', props.variant === 'solid' ? 'text-ui-text-inverted' : 'text-ui-text-highlighted']">
          {{ title }}
        </p>
        <p
          v-if="description"
          :class="['text-xs', secondaryText()]"
        >
          {{ description }}
        </p>
      </slot>
    </div>
    <div :class="['p-4', bodyText()]">
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      :class="['border-t px-4 py-3', divider(), secondaryText()]"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
