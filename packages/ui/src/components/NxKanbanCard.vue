<script setup lang="ts">
import NxAvatar from './NxAvatar.vue';
import NxBadge from './NxBadge.vue';

export interface NxKanbanAssignee {
  name: string;
  src?: string;
}

withDefaults(defineProps<{
  title: string;
  description?: string;
  status?: string;
  assignee?: NxKanbanAssignee;
  meta?: string;
}>(), {
  description: undefined,
  status: undefined,
  assignee: undefined,
  meta: undefined,
});

const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <article class="rounded-ui border border-ui-border bg-ui-bg p-3 shadow-sm">
    <button
      type="button"
      class="w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="emit('click')"
    >
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-sm font-medium text-ui-text-highlighted">
          {{ title }}
        </h3>
        <NxBadge
          v-if="status"
          color="neutral"
        >
          {{ status }}
        </NxBadge>
      </div>
      <p
        v-if="description"
        class="mt-2 line-clamp-2 text-xs text-ui-text-toned"
      >
        {{ description }}
      </p>
    </button>
    <div
      v-if="meta || assignee || $slots.default"
      class="mt-3 flex items-center justify-between gap-2"
    >
      <span
        v-if="meta"
        class="truncate text-xs text-ui-text-muted"
      >{{ meta }}</span>
      <slot />
      <NxAvatar
        v-if="assignee"
        :name="assignee.name"
        :src="assignee.src"
        size="sm"
      />
    </div>
  </article>
</template>
