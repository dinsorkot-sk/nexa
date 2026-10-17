<script setup lang="ts">
import { X } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useNxMessages } from '../lib/locale';
import NxIconButton from './NxIconButton.vue';

withDefaults(defineProps<{
  open: boolean;
  title: string;
  description?: string;
  side?: 'left' | 'right';
}>(), {
  description: undefined,
  side: 'right',
});

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const messages = useNxMessages();
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-ui-bg-inverted/40" />
      <DialogContent
        :class="[
          'fixed inset-y-0 z-50 flex w-[min(28rem,calc(100%-1rem))] flex-col border-ui-border bg-ui-bg shadow-xl outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        ]"
      >
        <header class="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
          <div class="min-w-0">
            <DialogTitle class="text-base font-semibold text-ui-text-highlighted">
              {{ title }}
            </DialogTitle>
            <DialogDescription
              v-if="description"
              class="mt-1 text-sm text-ui-text-muted"
            >
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <NxIconButton
              :icon="X"
              :label="messages.close"
            />
          </DialogClose>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="border-t border-ui-border px-5 py-4"
        >
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
