<script setup lang="ts">
defineProps<{
  collapsed?: boolean;
}>();
</script>

<template>
  <h2
    v-if="!collapsed"
    class="px-3 py-1 text-xs font-medium text-ui-text-muted"
  >
    <slot />
  </h2>
</template>
