<script setup lang="ts">
import { dismissToast, toastQueue } from '../lib/toast';
import NxToast from './NxToast.vue';
</script>

<template>
  <div
    aria-live="polite"
    class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
  >
    <NxToast
      v-for="item in toastQueue"
      :key="item.id"
      :title="item.title"
      :description="item.description"
      :color="item.color"
      @close="dismissToast(item.id)"
    />
  </div>
</template>
