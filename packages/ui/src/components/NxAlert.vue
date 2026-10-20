<script setup lang="ts">
import type { Component } from 'vue';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next';
import { computed } from 'vue';
import UAlert from '@nuxt/ui/components/Alert.vue';
import { useNxMessages } from '../lib/locale';
import { tone, type NxColor, type NxVariant } from '../lib/tone';
import NxIconButton from './NxIconButton.vue';

/** Inline message for a page or section: 7 colours x 4 variants, as the mockup's Alert section. */
export type AlertColor = NxColor;
export type AlertVariant = Extract<NxVariant, 'solid' | 'outline' | 'soft' | 'subtle'>;

const icons: Record<NxColor, Component> = {
  primary: Info,
  secondary: Info,
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  neutral: Info,
};

const props = withDefaults(defineProps<{
  color?: AlertColor;
  variant?: AlertVariant;
  title?: string;
  description?: string;
  /** Shows the close button from the mockup. Turn off for a message that is not dismissible. */
  dismissible?: boolean;
}>(), {
  color: 'info',
  variant: 'soft',
  title: undefined,
  description: undefined,
  dismissible: true,
});

const emit = defineEmits<{ close: [] }>();
const messages = useNxMessages();

const t = () => tone(props.color, props.variant);
const isSolid = () => props.variant === 'solid';

const ui = computed(() => ({
  root: `flex w-full items-start gap-3 rounded-ui-lg px-4 py-3 ${t().surface} ${t().border}`,
  wrapper: 'min-w-0 flex-1 space-y-0.5',
  // The title and the description are paragraphs here, so Nuxt UI's own wrappers stay bare.
  title: () => '',
  description: () => '',
  actions: 'flex shrink-0 items-start',
}));
</script>

<template>
  <UAlert
    :color="color"
    :variant="variant"
    :close="dismissible"
    :ui="ui"
    :role="color === 'error' ? 'alert' : 'status'"
  >
    <template #leading>
      <component
        :is="icons[color]"
        aria-hidden="true"
        :class="['mt-0.5 size-5 shrink-0', t().icon]"
      />
    </template>
    <template
      v-if="title"
      #title
    >
      <p :class="['text-sm font-medium', t().label]">
        {{ title }}
      </p>
    </template>
    <template
      v-if="description"
      #description
    >
      <p :class="['text-xs', isSolid() ? t().label : 'text-ui-text-toned']">
        {{ description }}
      </p>
    </template>
    <slot />
    <template
      v-if="dismissible"
      #close
    >
      <NxIconButton
        :icon="X"
        :label="messages.close"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="emit('close')"
      />
    </template>
  </UAlert>
</template>
