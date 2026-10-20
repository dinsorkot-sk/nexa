<script setup lang="ts">
import { computed } from 'vue';
import UCard from '@nuxt/ui/components/Card.vue';

/** Container with an optional header and footer, as the mockup's Card section: 4 variants. */
export type CardVariant = 'outline' | 'soft' | 'subtle' | 'solid';

const props = withDefaults(defineProps<{
  variant?: CardVariant;
  title?: string;
  description?: string;
}>(), {
  variant: 'outline',
  title: undefined,
  description: undefined,
});

const isSolid = computed(() => props.variant === 'solid');

/** The mockup's surface for each variant. The border is a real border, not the ring Nuxt UI draws. */
const surface: Record<CardVariant, string> = {
  outline: 'border border-ui-border bg-ui-bg',
  soft: 'bg-ui-bg-muted',
  subtle: 'border border-ui-border bg-ui-bg-muted',
  solid: 'bg-ui-bg-inverted',
};

const divider = computed(() => (isSolid.value ? 'border-ui-border-inverted' : 'border-ui-border'));
const bodyText = computed(() => (isSolid.value ? 'text-ui-text-inverted' : 'text-ui-text'));
const secondaryText = computed(() => (isSolid.value ? 'text-ui-text-inverted' : 'text-ui-text-muted'));

const ui = computed(() => ({
  // `ring-0` and `divide-y-0` drop Nuxt UI's own border treatment, which the mockup draws as real borders.
  root: `rounded-ui-xl overflow-hidden transition-shadow duration-ui ease-ui-out ring-0 divide-y-0 ${surface[props.variant]}`,
  header: `border-b px-4 py-4 ${divider.value}`,
  body: `p-4 ${bodyText.value}`,
  footer: `border-t px-4 py-3 ${secondaryText.value}`,
  // The title and the description are rendered as paragraphs by this package, so the slot wrappers stay bare.
  title: () => '',
  description: () => '',
}));
</script>

<template>
  <UCard
    :variant="variant"
    :ui="ui"
  >
    <template
      v-if="$slots.header || title || description"
      #header
    >
      <slot name="header">
        <p
          v-if="title"
          :class="['text-base font-semibold', isSolid ? 'text-ui-text-inverted' : 'text-ui-text-highlighted']"
        >
          {{ title }}
        </p>
        <p
          v-if="description"
          :class="['text-xs', secondaryText]"
        >
          {{ description }}
        </p>
      </slot>
    </template>
    <slot />
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </UCard>
</template>
