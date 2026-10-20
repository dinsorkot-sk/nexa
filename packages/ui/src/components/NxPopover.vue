<script setup lang="ts">
import { computed } from 'vue';
import UPopover from '@nuxt/ui/components/Popover.vue';

/**
 * The mockup's Popover section: a floating panel for help text or a small form. Pass `title` for the panel
 * heading, or use the default slot for free content. Rendered by Nuxt UI's popover, with the mockup's classes
 * handed over through its `ui` prop.
 */
withDefaults(defineProps<{
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  title?: string;
}>(), { open: false, side: 'bottom', align: 'center', title: undefined });

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const ui = computed(() => ({
  content: 'z-50 flex w-70 flex-col gap-3 rounded-ui-lg border border-ui-border bg-ui-bg p-4 text-sm text-ui-text shadow-md outline-none data-[state=open]:animate-ui-pop-in data-[state=closed]:animate-ui-pop-out',
}));
</script>

<template>
  <UPopover
    :open="open"
    :content="{ side, align, sideOffset: 6 }"
    :ui="ui"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #default>
      <slot name="trigger" />
    </template>
    <template #content>
      <h2
        v-if="title"
        class="text-base font-semibold text-ui-text-highlighted"
      >
        {{ title }}
      </h2>
      <slot />
    </template>
  </UPopover>
</template>
