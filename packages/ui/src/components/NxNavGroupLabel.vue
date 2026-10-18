<script setup lang="ts">
/** Small caps heading above a group of NavItems, as the mockup's NavGroupLabel section. */
defineProps<{
  collapsed?: boolean;
}>();
</script>

<template>
  <h2
    v-if="!collapsed"
    class="px-2.5 pb-1 text-[11px] font-medium text-ui-text-dimmed"
  >
    <slot />
  </h2>
</template>
