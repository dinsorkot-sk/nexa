<script setup lang="ts">
/** One page number of the pagination, as the mockup's PageButton section: 28px and 36px square forms. */
export type PageButtonSize = 'sm' | 'md';

withDefaults(defineProps<{
  page: number;
  current?: boolean;
  disabled?: boolean;
  size?: PageButtonSize;
}>(), {
  current: false,
  disabled: false,
  size: 'md',
});

const box: Record<PageButtonSize, string> = { sm: 'size-7 text-xs', md: 'size-9 text-sm' };

const emit = defineEmits<{ click: [page: number] }>();
</script>

<template>
  <button
    type="button"
    :aria-label="`Page ${page}`"
    :aria-current="current ? 'page' : undefined"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center rounded-ui tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
      box[size],
      current ? 'bg-ui-primary text-ui-on-solid' : 'text-ui-text-toned hover:bg-ui-bg-elevated',
    ]"
    @click="emit('click', page)"
  >
    {{ page }}
  </button>
</template>
