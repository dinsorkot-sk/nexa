<script setup lang="ts">
withDefaults(defineProps<{ type?: 'mark' | 'full'; size?: 'sm' | 'md' | 'lg' }>(), {
  type: 'full',
  size: 'md',
});

const markSizes = { sm: 'size-6 rounded-md', md: 'size-8 rounded-lg', lg: 'size-10 rounded-lg' };
const textSizes = { sm: 'text-nexa-subheading', md: 'text-nexa-title', lg: 'text-nexa-display' };
</script>

<template>
  <span class="inline-flex select-none items-center gap-2">
    <span :class="['inline-flex shrink-0 items-center justify-center bg-[--ui-primary] text-[--ui-on-solid]', markSizes[size]]">
      <svg viewBox="0 0 24 24" class="size-3/5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 18V6l12 12V6" />
      </svg>
    </span>
    <span v-if="type === 'full'" :class="['font-semibold tracking-tight text-highlighted', textSizes[size]]">Nexa</span>
  </span>
</template>
