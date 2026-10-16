<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';

const props = withDefaults(defineProps<{ label?: string }>(), { label: undefined });
const messages = useNxMessages();
const text = computed(() => props.label ?? messages.value.loading);
</script>

<template>
  <span
    role="status"
    :aria-label="text"
    class="inline-flex"
  >
    <LoaderCircle class="size-4 animate-spin text-ui-text-muted" />
  </span>
</template>
