<script setup lang="ts">
import { computed } from 'vue';
import NxBadge from './NxBadge.vue';

/**
 * One definition difference, as the mockup's DiffRow section: the tinted row carries a marker, the field path and
 * the value detail, and the kind badge at the end.
 */
const props = withDefaults(defineProps<{
  path: string;
  status: 'added' | 'changed' | 'removed';
  detail?: string;
  before?: string;
  after?: string;
}>(), {
  detail: undefined,
  before: undefined,
  after: undefined,
});

const rows: Record<'added' | 'changed' | 'removed', string> = {
  added: 'bg-ui-success-soft',
  changed: 'bg-ui-warning-soft',
  removed: 'bg-ui-error-soft',
};
const marks: Record<'added' | 'changed' | 'removed', string> = {
  added: 'bg-ui-success-soft-hover',
  changed: 'bg-ui-warning-soft-hover',
  removed: 'bg-ui-error-soft-hover',
};
const symbols: Record<'added' | 'changed' | 'removed', string> = { added: '+', changed: '~', removed: '-' };
const colors: Record<'added' | 'changed' | 'removed', 'success' | 'warning' | 'error'> = {
  added: 'success',
  changed: 'warning',
  removed: 'error',
};
const labels: Record<'added' | 'changed' | 'removed', string> = {
  added: 'Added',
  changed: 'Changed',
  removed: 'Removed',
};

const rowClass = computed(() => rows[props.status]);
const markClass = computed(() => marks[props.status]);
const detailText = computed(() => {
  if (props.detail) return props.detail;
  if (props.before !== undefined || props.after !== undefined) return `${props.before ?? ''} → ${props.after ?? ''}`.trim();
  return '';
});
</script>

<template>
  <div
    class="flex items-center gap-3 px-3 py-2"
    :class="rowClass"
  >
    <span
      class="flex size-5 shrink-0 items-center justify-center rounded-ui-sm font-mono text-xs text-ui-text-highlighted"
      :class="markClass"
      aria-hidden="true"
    >{{ symbols[status] }}</span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <code class="truncate font-mono text-xs text-ui-text-highlighted">{{ path }}</code>
      <span
        v-if="detailText"
        class="truncate text-xs text-ui-text-muted"
      >{{ detailText }}</span>
    </div>
    <NxBadge
      :color="colors[status]"
      variant="soft"
      size="sm"
    >
      {{ labels[status] }}
    </NxBadge>
  </div>
</template>
