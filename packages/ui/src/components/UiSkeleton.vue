<template>
  <span
    :class="cn('block animate-pulse rounded-md bg-surface-muted', props.class)"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { cn } from '../cn';

const props = defineProps<{ class?: string }>();
</script>
