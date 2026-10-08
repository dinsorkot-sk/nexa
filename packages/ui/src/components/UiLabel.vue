<template>
  <label :for="forId" :class="cn('mb-1.5 block text-sm font-medium text-slate-200', props.class)">
    <slot />
  </label>
</template>

<script setup lang="ts">
import { cn } from '../index';

const props = defineProps<{ for?: string; class?: string }>();
const forId = props.for;
</script>
