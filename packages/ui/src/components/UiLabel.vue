<template>
  <label
    :for="props.for"
    :class="cn('mb-1.5 block text-sm font-medium text-foreground', props.class)"
  >
    <slot />
  </label>
</template>

<script setup lang="ts">
import { cn } from '../cn';

const props = defineProps<{ for?: string; class?: string }>();
</script>
