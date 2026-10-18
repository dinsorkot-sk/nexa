<script setup lang="ts">
import NxActivityItem from './NxActivityItem.vue';

export interface NxTimelineEntry {
  id: string;
  actor: string;
  action: string;
  time: string;
  description?: string;
  kind?: 'create' | 'update' | 'status' | 'comment';
  oldValue?: string;
  newValue?: string;
}

/** Vertical activity list, as the mockup's Timeline section: each entry draws its own connecting line. */
defineProps<{
  items: NxTimelineEntry[];
  label: string;
}>();
</script>

<template>
  <ol
    :aria-label="label"
    class="flex flex-col"
  >
    <li
      v-for="(item, index) in items"
      :key="item.id"
      class="flex"
    >
      <NxActivityItem
        v-bind="item"
        :last="index === items.length - 1"
        class="w-full"
      >
        <template
          v-if="$slots.item"
          #trailing
        >
          <slot
            name="item"
            :item="item"
          />
        </template>
      </NxActivityItem>
    </li>
  </ol>
</template>
