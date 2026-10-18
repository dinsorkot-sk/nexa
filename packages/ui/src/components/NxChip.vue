<script setup lang="ts">
import type { Component } from 'vue';
import { X } from 'lucide-vue-next';
import { tv } from 'tailwind-variants';
import { useNxMessages } from '../lib/locale';

/** Filter or tag pill, as the mockup's Chip section: 2 colours x 2 sizes, optional icon and remove button. */
const chip = tv({
  base: 'inline-flex items-center rounded-full border font-medium',
  variants: {
    color: {
      neutral: 'border-ui-border-accented bg-ui-bg-elevated text-ui-text-toned',
      primary: 'border-ui-primary-outline bg-ui-primary-soft text-ui-text-highlighted',
    },
    size: {
      sm: 'gap-1 px-2 py-0.5 text-xs [&_svg]:size-3',
      md: 'gap-1.5 px-2.5 py-1 text-sm [&_svg]:size-3.5',
    },
  },
  defaultVariants: { color: 'neutral', size: 'md' },
});

const iconColor = { neutral: 'text-ui-text-muted', primary: 'text-ui-primary-text' } as const;

/** `removeLabel` is the accessible name of the remove button. Without `removable` the chip is display only. */
withDefaults(defineProps<{
  color?: 'neutral' | 'primary';
  size?: 'sm' | 'md';
  icon?: Component;
  removable?: boolean;
  removeLabel?: string;
}>(), {
  color: 'neutral',
  size: 'md',
  icon: undefined,
  removable: false,
  removeLabel: undefined,
});

const emit = defineEmits<{ remove: [] }>();
const messages = useNxMessages();
</script>

<template>
  <span :class="chip({ color, size })">
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
      :class="iconColor[color]"
    />
    <slot />
    <button
      v-if="removable"
      type="button"
      class="rounded-full outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
      :class="iconColor[color]"
      :aria-label="removeLabel ?? messages.close"
      @click="emit('remove')"
    >
      <X aria-hidden="true" />
    </button>
  </span>
</template>
