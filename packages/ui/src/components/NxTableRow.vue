<script setup lang="ts">
/**
 * Header or body row of a table, as the mockup's TableRow section: the header is 40px on the muted fill, the body
 * row 48px and takes the elevated fill on hover and the primary soft fill when selected.
 */
withDefaults(defineProps<{
  head?: boolean;
  selected?: boolean;
  clickable?: boolean;
}>(), {
  head: false,
  selected: false,
  clickable: false,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <tr
    :aria-selected="selected || undefined"
    :class="[
      'border-b border-ui-border transition-colors duration-ui-fast',
      head ? 'h-10 bg-ui-bg-muted' : 'h-12',
      !head && selected && 'bg-ui-primary-soft',
      !head && clickable && !selected && 'cursor-pointer hover:bg-ui-bg-elevated',
    ]"
    @click="clickable && emit('click', $event)"
  >
    <slot />
  </tr>
</template>
