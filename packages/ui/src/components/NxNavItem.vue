<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';

/**
 * Sidebar navigation item, as the mockup's NavItem section: the current page gets the primary soft fill and a
 * primary icon; hover gets the elevated fill. `count` adds the trailing pill, `iconOnly` the 36px square form.
 * Renders a link when `href` is set, otherwise a button.
 */
const props = withDefaults(defineProps<{
  href?: string;
  active?: boolean;
  disabled?: boolean;
  icon?: Component;
  iconOnly?: boolean;
  count?: string | number;
}>(), { href: undefined, active: false, disabled: false, icon: undefined, iconOnly: false, count: undefined });

const tag = computed(() => (props.href ? 'a' : 'button'));
</script>

<template>
  <component
    :is="tag"
    :href="href"
    :type="href ? undefined : 'button'"
    :disabled="href ? undefined : disabled"
    :aria-current="href && active ? 'page' : undefined"
    :class="[
      'inline-flex items-center gap-2.5 rounded-ui py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
      iconOnly ? 'size-9 justify-center p-0' : 'px-2.5',
      active
        ? 'bg-ui-primary-soft text-ui-text-highlighted [&_svg]:text-ui-primary-text'
        : 'text-ui-text-toned hover:bg-ui-bg-elevated hover:text-ui-text-highlighted',
    ]"
  >
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
    />
    <template v-if="!iconOnly">
      <span class="flex-1 truncate text-left"><slot /></span>
      <span
        v-if="count !== undefined"
        class="rounded-full bg-ui-bg-accented px-1.5 text-[11px] font-medium text-ui-text-highlighted tabular-nums"
      >{{ count }}</span>
    </template>
  </component>
</template>
