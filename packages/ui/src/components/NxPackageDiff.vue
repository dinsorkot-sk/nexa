<script setup lang="ts">
import NxDiffRow from './NxDiffRow.vue';
import { useNxMessages } from '../lib/locale';

export interface NxPackageDiffEntry {
  path: string;
  status: 'added' | 'changed' | 'removed';
  before?: string;
  after?: string;
}

/** The mockup's PackageDiff section: what an import or upgrade will add, change or remove, before confirming. */
defineProps<{
  items: NxPackageDiffEntry[];
  label: string;
  title?: string;
}>();
const messages = useNxMessages();
</script>

<template>
  <section
    :aria-label="label"
    class="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg"
  >
    <h2
      v-if="title"
      class="border-b border-ui-border px-4 py-3 text-base font-semibold text-ui-text-highlighted"
    >
      {{ title }}
    </h2>
    <NxDiffRow
      v-for="(item, index) in items"
      :key="`${item.path}-${index}`"
      v-bind="item"
    />
    <p
      v-if="items.length === 0"
      class="px-3 py-8 text-center text-sm text-ui-text-muted"
    >
      {{ messages.noResults }}
    </p>
  </section>
</template>
