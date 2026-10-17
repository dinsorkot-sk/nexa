<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  kind?: 'trigger' | 'condition' | 'action';
  description?: string;
  selected?: boolean;
  disabled?: boolean;
}>(), {
  kind: 'action',
  description: undefined,
  selected: false,
  disabled: false,
});

const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-pressed="selected"
    :class="[
      'block w-56 rounded-ui border bg-ui-bg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:opacity-50',
      selected ? 'border-ui-primary ring-1 ring-ui-primary' : 'border-ui-border',
    ]"
    @click="emit('click')"
  >
    <span class="text-xs font-medium uppercase tracking-wide text-ui-text-muted">{{ kind }}</span>
    <span class="mt-1 block text-sm font-semibold text-ui-text-highlighted">{{ title }}</span>
    <span
      v-if="description"
      class="mt-1 block text-xs text-ui-text-toned"
    >{{ description }}</span>
    <slot />
  </button>
</template>
