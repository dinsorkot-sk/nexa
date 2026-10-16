<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { tv } from 'tailwind-variants';
import { useNxMessages } from '../lib/locale';

const chip = tv({
  base: 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs [&_svg]:size-3',
  variants: {
    color: {
      neutral: 'border-ui-border-accented bg-ui-bg-elevated text-ui-text-toned',
      primary: 'border-ui-primary/40 bg-ui-primary/10 text-ui-text-highlighted',
    },
  },
  defaultVariants: { color: 'neutral' },
});

/** `removeLabel` is the accessible name of the remove button. Without `removable` the chip is display only. */
withDefaults(defineProps<{
  color?: 'neutral' | 'primary';
  removable?: boolean;
  removeLabel?: string;
}>(), { color: 'neutral', removable: false, removeLabel: undefined });

const emit = defineEmits<{ remove: [] }>();
const messages = useNxMessages();
</script>

<template>
  <span :class="chip({ color })">
    <slot />
    <button
      v-if="removable"
      type="button"
      class="rounded-full p-0.5 text-ui-text-muted outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
      :aria-label="removeLabel ?? messages.close"
      @click="emit('remove')"
    >
      <X aria-hidden="true" />
    </button>
  </span>
</template>
