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

defineProps<{
  items: NxTimelineEntry[];
  label: string;
}>();
</script>

<template>
  <ol
    :aria-label="label"
    class="space-y-0"
  >
    <li
      v-for="(item, index) in items"
      :key="item.id"
      class="relative pb-5 pl-1"
    >
      <div
        v-if="index < items.length - 1"
        aria-hidden="true"
        class="absolute bottom-0 left-[0.4375rem] top-4 w-px bg-ui-border"
      />
      <NxActivityItem
        v-bind="item"
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
