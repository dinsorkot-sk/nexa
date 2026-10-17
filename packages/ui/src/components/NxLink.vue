<script setup lang="ts">
import { computed } from 'vue';
import { safeHref } from '../lib/safe-url';

const props = withDefaults(defineProps<{
  href: string;
  external?: boolean;
}>(), { external: false });

const safeUrl = computed(() => safeHref(props.href));
</script>

<template>
  <a
    v-if="safeUrl"
    :href="safeUrl"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    class="text-ui-primary-text underline underline-offset-2 outline-none hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
  ><slot /></a>
  <span
    v-else
    class="text-ui-text-muted"
    aria-disabled="true"
  ><slot /></span>
</template>
