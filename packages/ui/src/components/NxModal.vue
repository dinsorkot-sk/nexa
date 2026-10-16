<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useNxMessages } from '../lib/locale';
import NxIconButton from './NxIconButton.vue';

/** Focus is trapped inside and Escape closes it. `title` is the accessible name and is required. */
defineProps<{
  open: boolean;
  title: string;
  description?: string;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const messages = useNxMessages();
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="(value) => emit('update:open', value)"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-ui-bg-inverted/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-ui-lg border border-ui-border bg-ui-bg p-6 shadow-xl outline-none">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <DialogTitle class="text-base font-semibold text-ui-text-highlighted">
              {{ title }}
            </DialogTitle>
            <DialogDescription
              v-if="description"
              class="text-sm text-ui-text-toned"
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
        </div>
        <div class="mt-4">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="mt-6 flex justify-end gap-2"
        >
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
