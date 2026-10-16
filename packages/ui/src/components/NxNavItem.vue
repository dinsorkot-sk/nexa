<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';

/** Renders a link when `href` is set, otherwise a button. `active` marks the current page for assistive technology. */
const props = withDefaults(defineProps<{
  href?: string;
  active?: boolean;
  icon?: Component;
}>(), { href: undefined, active: false, icon: undefined });

const tag = computed(() => (props.href ? 'a' : 'button'));
</script>

<template>
  <component
    :is="tag"
    :href="href"
    :type="href ? undefined : 'button'"
    :aria-current="href && active ? 'page' : undefined"
    :class="[
      'flex w-full items-center gap-2 rounded-ui px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ui-primary [&_svg]:size-4 [&_svg]:shrink-0',
      active ? 'bg-ui-bg-elevated text-ui-text-highlighted' : 'text-ui-text-toned hover:bg-ui-bg-elevated hover:text-ui-text-highlighted',
    ]"
  >
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
    />
    <slot />
  </component>
</template>
