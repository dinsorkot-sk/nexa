<template>
  <p v-if="error" class="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300" role="alert">
    {{ error.message }}
  </p>
</template>

<script setup lang="ts">
import type { NormalizedApiError } from '../utils/api-error';
defineProps<{ error?: NormalizedApiError | null }>();
</script>
