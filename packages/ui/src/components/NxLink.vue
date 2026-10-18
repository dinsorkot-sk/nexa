<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next';
import { computed } from 'vue';
import { safeHref } from '../lib/safe-url';

/**
 * Inline text link, as the mockup's Link section: the primary tone by default, muted for footers and breadcrumbs,
 * underlined on hover, with an external-link mark when it opens a new tab.
 */
const props = withDefaults(defineProps<{
  href: string;
  tone?: 'primary' | 'muted';
  external?: boolean;
  disabled?: boolean;
}>(), { tone: 'primary', external: false, disabled: false });

const safeUrl = computed(() => (props.disabled ? undefined : safeHref(props.href)));
const linkClass = computed(() => [
  'inline-flex items-center gap-1 rounded outline-none underline-offset-2 transition-colors duration-ui-fast ease-ui-out hover:underline focus-visible:ring-2 focus-visible:ring-ui-primary',
  props.tone === 'primary' ? 'text-ui-primary-text' : 'text-ui-text-muted hover:text-ui-text-highlighted',
]);
</script>

<template>
  <a
    v-if="safeUrl"
    :href="safeUrl"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    :class="linkClass"
  ><slot /><ExternalLink
    v-if="external"
    class="size-3.5 shrink-0"
    aria-hidden="true"
  /></a>
  <span
    v-else
    :class="['inline-flex items-center gap-1 text-ui-text-muted', disabled && 'opacity-50']"
    aria-disabled="true"
  ><slot /></span>
</template>
