<script setup lang="ts">
import { CircleAlert, EllipsisVertical, GripVertical } from 'lucide-vue-next';
import { computed } from 'vue';
import NxBadge from './NxBadge.vue';
import NxIconButton from './NxIconButton.vue';
import { useNxMessages } from '../lib/locale';

/**
 * Row of the Entity Designer field list, as the mockup's FieldRow section: drag handle, name and key, type badge,
 * flags, an error mark and the row menu.
 */
const props = withDefaults(defineProps<{
  label: string;
  name: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  position?: number;
  state?: 'default' | 'hover' | 'selected' | 'error';
}>(), {
  required: false,
  readonly: false,
  position: undefined,
  state: 'default',
});

const emit = defineEmits<{ configure: [] }>();
const messages = useNxMessages();

const rows: Record<'default' | 'hover' | 'selected' | 'error', string> = {
  default: 'border-ui-border bg-ui-bg',
  hover: 'border-ui-border bg-ui-bg-elevated',
  selected: 'border-ui-primary-outline bg-ui-primary-soft',
  error: 'border-ui-error bg-ui-bg',
};
const rowClass = computed(() => rows[props.state]);
</script>

<template>
  <div
    class="flex w-full items-center gap-3 rounded-ui-lg border px-3 py-2.5"
    :class="rowClass"
  >
    <GripVertical
      class="size-4 shrink-0 cursor-grab text-ui-text-dimmed"
      aria-hidden="true"
    />
    <span
      v-if="position !== undefined"
      class="text-xs tabular-nums text-ui-text-muted"
    >{{ position + 1 }}</span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <p class="truncate text-sm font-medium text-ui-text-highlighted">
        {{ label }}<span
          v-if="required"
          aria-hidden="true"
          class="ml-0.5 text-ui-error-text"
        >*</span>
      </p>
      <p class="truncate font-mono text-xs text-ui-text-muted">
        {{ name }}
      </p>
    </div>
    <NxBadge
      color="neutral"
      variant="soft"
      size="sm"
    >
      {{ type }}
    </NxBadge>
    <NxBadge
      v-if="required"
      color="error"
      variant="subtle"
      size="sm"
    >
      Required
    </NxBadge>
    <span
      v-if="readonly"
      class="text-xs text-ui-text-muted"
    >Read only</span>
    <CircleAlert
      v-if="state === 'error'"
      class="size-4 shrink-0 text-ui-error-text"
      aria-hidden="true"
    />
    <slot name="action">
      <NxIconButton
        :icon="EllipsisVertical"
        :label="messages.options"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="emit('configure')"
      />
    </slot>
  </div>
</template>
