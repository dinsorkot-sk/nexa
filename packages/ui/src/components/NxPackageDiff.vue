<script setup lang="ts">
import NxDiffRow from './NxDiffRow.vue';
import { useNxMessages } from '../lib/locale';

export interface NxPackageDiffEntry {
  path: string;
  status: 'added' | 'changed' | 'removed';
  before?: string;
  after?: string;
}

defineProps<{
  items: NxPackageDiffEntry[];
  label: string;
}>();
const messages = useNxMessages();
</script>

<template>
  <section
    :aria-label="label"
    class="overflow-hidden rounded-ui border border-ui-border"
  >
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
