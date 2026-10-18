<script setup lang="ts">
import { TriangleAlert, X } from 'lucide-vue-next';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxIconButton from './NxIconButton.vue';

/** The mockup's Modal section: three widths and a destructive tone with the warning icon. */
export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalTone = 'default' | 'destructive';

/** Focus is trapped inside and Escape closes it. `title` is the accessible name and is required. */
const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description?: string;
  size?: ModalSize;
  tone?: ModalTone;
}>(), {
  description: undefined,
  size: 'md',
  tone: 'default',
});

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const messages = useNxMessages();

const width: Record<ModalSize, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[640px]',
};
const destructive = computed(() => props.tone === 'destructive');
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="(value) => emit('update:open', value)"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-ui-overlay data-[state=open]:animate-ui-fade-in data-[state=closed]:animate-ui-fade-out" />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-ui-xl border border-ui-border bg-ui-bg shadow-lg outline-none data-[state=open]:animate-ui-pop-in data-[state=closed]:animate-ui-pop-out',
          width[size],
        ]"
      >
        <div class="flex items-start gap-3 px-5 pb-3 pt-5">
          <slot name="icon">
            <span
              v-if="destructive"
              aria-hidden="true"
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-ui-error-soft text-ui-error-text"
            >
              <TriangleAlert class="size-5" />
            </span>
          </slot>
          <div class="flex-1 space-y-1">
            <DialogTitle class="text-xl font-semibold text-ui-text-highlighted">
              {{ title }}
            </DialogTitle>
            <DialogDescription
              v-if="description"
              class="text-sm text-ui-text-muted"
            >
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <NxIconButton
              :icon="X"
              :label="messages.close"
              color="neutral"
              variant="ghost"
              size="sm"
            />
          </DialogClose>
        </div>
        <div class="flex-1 px-5 pb-5 pt-2">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="flex items-center justify-end gap-2 border-t border-ui-border bg-ui-bg-muted px-5 py-3"
        >
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
