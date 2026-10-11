<template>
  <section :class="cn('rounded-xl border border-border bg-surface p-5 text-foreground shadow-sm', props.class)">
    <slot />
  </section>
</template>

<script setup lang="ts">
import { cn } from '../cn';

const props = defineProps<{ class?: string }>();
</script>
