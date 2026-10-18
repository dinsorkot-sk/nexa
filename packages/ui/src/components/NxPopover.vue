<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

/**
 * The mockup's Popover section: a floating panel for help text or a small form. Pass `title` for the panel
 * heading, or use the default slot for free content.
 */
withDefaults(defineProps<{
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  title?: string;
}>(), { open: false, side: 'bottom', align: 'center', title: undefined });

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
</script>

<template>
  <PopoverRoot
    :open="open"
    @update:open="(value) => emit('update:open', value)"
  >
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="6"
        class="z-50 flex w-70 flex-col gap-3 rounded-ui-lg border border-ui-border bg-ui-bg p-4 text-sm text-ui-text shadow-md outline-none data-[state=open]:animate-ui-pop-in data-[state=closed]:animate-ui-pop-out"
      >
        <h2
          v-if="title"
          class="text-base font-semibold text-ui-text-highlighted"
        >
          {{ title }}
        </h2>
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
