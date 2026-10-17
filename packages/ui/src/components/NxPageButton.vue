<script setup lang="ts">
withDefaults(defineProps<{
  page: number;
  current?: boolean;
  disabled?: boolean;
}>(), {
  current: false,
  disabled: false,
});

const emit = defineEmits<{ click: [page: number] }>();
</script>

<template>
  <button
    type="button"
    :aria-label="`Page ${page}`"
    :aria-current="current ? 'page' : undefined"
    :disabled="disabled"
    :class="[
      'inline-flex size-9 items-center justify-center rounded-ui text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:opacity-50',
      current ? 'bg-ui-primary text-ui-on-solid' : 'text-ui-text-toned hover:bg-ui-bg-elevated',
    ]"
    @click="emit('click', page)"
  >
    {{ page }}
  </button>
</template>
