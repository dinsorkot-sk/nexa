<script setup lang="ts">
import { ArrowRight, GitCommitHorizontal, MessageSquare, Pencil, Plus } from 'lucide-vue-next';
import { computed } from 'vue';
import type { Component } from 'vue';
import NxBadge from './NxBadge.vue';

/**
 * One entry of the record activity trail, as the mockup's ActivityItem section: a 28px marker with the kind icon
 * and, unless it is the last entry, the connecting line below it.
 */
const props = withDefaults(defineProps<{
  actor: string;
  action: string;
  time: string;
  description?: string;
  kind?: 'create' | 'update' | 'status' | 'comment';
  oldValue?: string;
  newValue?: string;
  last?: boolean;
}>(), {
  description: undefined,
  kind: 'update',
  oldValue: undefined,
  newValue: undefined,
  last: true,
});

const icons: Record<NonNullable<typeof props.kind>, Component> = {
  create: Plus,
  update: Pencil,
  status: GitCommitHorizontal,
  comment: MessageSquare,
};
const icon = computed(() => icons[props.kind]);
</script>

<template>
  <article class="flex gap-3">
    <div class="flex w-7 shrink-0 flex-col items-center gap-1">
      <span class="flex size-7 items-center justify-center rounded-full border border-ui-border bg-ui-bg-elevated">
        <component
          :is="icon"
          class="size-3.5 text-ui-text-muted"
          aria-hidden="true"
        />
      </span>
      <span
        v-if="!last"
        aria-hidden="true"
        class="w-0.5 flex-1 bg-ui-border-accented"
      />
    </div>
    <div
      class="min-w-0 flex-1"
      :class="!last && 'pb-4'"
    >
      <p class="flex flex-wrap items-center gap-1.5">
        <span class="text-sm font-medium text-ui-text-highlighted">{{ actor }}</span>
        <span class="text-sm text-ui-text-muted">{{ action }}</span>
        <time
          :datetime="time"
          class="text-xs text-ui-text-dimmed"
        >{{ time }}</time>
      </p>
      <div
        v-if="oldValue !== undefined || newValue !== undefined"
        class="mt-1 flex items-center gap-2"
      >
        <NxBadge
          color="neutral"
          variant="soft"
          size="sm"
        >
          {{ oldValue || '—' }}
        </NxBadge>
        <ArrowRight
          class="size-3.5 shrink-0 text-ui-text-dimmed"
          aria-hidden="true"
        />
        <NxBadge
          color="success"
          variant="soft"
          size="sm"
        >
          {{ newValue || '—' }}
        </NxBadge>
      </div>
      <p
        v-if="description"
        class="mt-1 rounded-ui-lg border border-ui-border bg-ui-bg-muted px-3 py-2 text-sm text-ui-text"
      >
        {{ description }}
      </p>
      <slot name="trailing" />
    </div>
  </article>
</template>
