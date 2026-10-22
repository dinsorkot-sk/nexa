<script setup lang="ts">
import { GripVertical } from 'lucide-vue-next';
import { computed } from 'vue';
import NxAvatar from './NxAvatar.vue';
import NxBadge from './NxBadge.vue';

export interface NxKanbanAssignee {
  name: string;
  src?: string;
}

/** The mockup's KanbanCard section: dragging lifts the card with a primary border and a shadow. */
const props = withDefaults(defineProps<{
  title: string;
  description?: string;
  status?: string;
  assignee?: NxKanbanAssignee;
  meta?: string;
  state?: 'default' | 'hover' | 'dragging';
}>(), {
  description: undefined,
  status: undefined,
  assignee: undefined,
  meta: undefined,
  state: 'default',
});

const emit = defineEmits<{ click: [] }>();
const card = computed(() => ({
  default: 'border-ui-border shadow-sm',
  hover: 'border-ui-border-accented shadow-sm',
  dragging: 'border-ui-primary shadow-md',
}[props.state]));
</script>

<template>
  <article
    class="flex flex-col gap-2.5 rounded-ui-lg border bg-ui-bg p-3 transition-[border-color,box-shadow,scale] duration-ui ease-ui-out"
    :class="[card, state === 'dragging' && 'scale-[1.02]']"
  >
    <div class="flex items-start gap-2">
      <button
        type="button"
        class="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
        @click="emit('click')"
      >
        <h3 class="text-sm font-medium text-ui-text-highlighted">
          {{ title }}
        </h3>
      </button>
      <slot name="actions">
        <GripVertical
          class="size-3.5 shrink-0 text-ui-text-dimmed"
          aria-hidden="true"
        />
      </slot>
    </div>
    <p
      v-if="meta"
      class="text-xs text-ui-text-muted"
    >
      {{ meta }}
    </p>
    <p
      v-if="description"
      class="line-clamp-2 text-xs text-ui-text-muted"
    >
      {{ description }}
    </p>
    <div
      v-if="status || assignee || $slots.default"
      class="flex items-center justify-between gap-2"
    >
      <NxBadge
        v-if="status"
        color="warning"
        variant="soft"
        size="sm"
        dot
      >
        {{ status }}
      </NxBadge>
      <slot />
      <NxAvatar
        v-if="assignee"
        :name="assignee.name"
        :src="assignee.src"
        size="xs"
      />
    </div>
  </article>
</template>
