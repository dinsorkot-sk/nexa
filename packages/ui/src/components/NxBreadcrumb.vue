<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';

export interface NxBreadcrumbItem {
  label: string;
  href?: string;
}

defineProps<{
  items: NxBreadcrumbItem[];
  label: string;
}>();
</script>

<template>
  <nav
    :aria-label="label"
    class="min-w-0"
  >
    <ol class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <li
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        class="inline-flex min-w-0 items-center gap-2"
      >
        <a
          v-if="item.href && index < items.length - 1"
          :href="item.href"
          class="truncate rounded text-ui-text-muted outline-none hover:text-ui-text hover:underline focus-visible:ring-2 focus-visible:ring-ui-primary"
        >{{ item.label }}</a>
        <span
          v-else
          :aria-current="index === items.length - 1 ? 'page' : undefined"
          :class="index === items.length - 1 ? 'truncate font-medium text-ui-text-highlighted' : 'truncate text-ui-text-muted'"
        >{{ item.label }}</span>
        <ChevronRight
          v-if="index < items.length - 1"
          class="size-3.5 shrink-0 text-ui-text-dimmed"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>
