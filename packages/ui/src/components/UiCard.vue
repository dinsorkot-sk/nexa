<template>
  <section :class="cn('rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm', props.class)">
    <slot />
  </section>
</template>

<script setup lang="ts">
import { cn } from '../cn';

const props = defineProps<{ class?: string }>();
</script>
