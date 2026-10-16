<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

withDefaults(defineProps<{
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}>(), { open: false, side: 'bottom', align: 'center' });

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
        class="z-50 rounded-ui border border-ui-border bg-ui-bg p-3 text-sm text-ui-text shadow-lg outline-none"
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
