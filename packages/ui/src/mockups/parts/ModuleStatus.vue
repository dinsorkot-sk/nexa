<script setup lang="ts">
/**
 * Mockup-only status pill. Statuses are the six real values of ModuleStatusSchema, so the text
 * carries the meaning; the dot and tone only reinforce it (never color alone).
 */
import { computed } from 'vue';
import type { ModuleStatus } from '@nexa/meta';
import UiBadge from '../../components/UiBadge.vue';

const props = defineProps<{ status: ModuleStatus }>();

const meta: Record<ModuleStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In review', tone: 'warning' },
  published: { label: 'Published', tone: 'success' },
  enabled: { label: 'Enabled', tone: 'success' },
  disabled: { label: 'Disabled', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
};
const current = computed(() => meta[props.status]);
</script>

<template>
  <UiBadge
    :tone="current.tone"
    class="gap-1.5"
  >
    <span
      class="size-1.5 rounded-full bg-current"
      aria-hidden="true"
    />
    {{ current.label }}
  </UiBadge>
</template>
