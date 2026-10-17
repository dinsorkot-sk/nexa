<script setup lang="ts">
withDefaults(defineProps<{
  selected?: boolean;
  clickable?: boolean;
}>(), {
  selected: false,
  clickable: false,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <tr
    :aria-selected="selected || undefined"
    :class="[
      'border-b border-ui-border last:border-b-0',
      selected && 'bg-ui-primary/10',
      clickable && 'cursor-pointer hover:bg-ui-bg-muted',
    ]"
    @click="clickable && emit('click', $event)"
  >
    <slot />
  </tr>
</template>
