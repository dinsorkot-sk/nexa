<script setup lang="ts">
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-vue-next';
import { computed } from 'vue';
import type { Component } from 'vue';
import { useNxMessages } from '../lib/locale';

/**
 * Sticky full-width message at the top of the app: offline, session expired, update available. The tone paints the
 * bar with the colour's soft hover fill and its ring as the bottom border, as the mockup's Banner section.
 */
const props = withDefaults(defineProps<{
  color?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  dismissible?: boolean;
  role?: 'alert' | 'status';
}>(), {
  color: 'info',
  title: undefined,
  dismissible: false,
  role: undefined,
});

const emit = defineEmits<{ dismiss: [] }>();
const messages = useNxMessages();

const bar: Record<NonNullable<typeof props.color>, string> = {
  info: 'border-ui-info-ring bg-ui-info-soft-hover',
  success: 'border-ui-success-ring bg-ui-success-soft-hover',
  warning: 'border-ui-warning-ring bg-ui-warning-soft-hover',
  error: 'border-ui-error-ring bg-ui-error-soft-hover',
};
const icons: Record<NonNullable<typeof props.color>, Component> = {
  info: Info,
  success: Info,
  warning: TriangleAlert,
  error: CircleAlert,
};
// Literal per-tone icon colours: Tailwind only generates classes it can read in the source.
const marks: Record<NonNullable<typeof props.color>, string> = {
  info: 'text-ui-info-text',
  success: 'text-ui-success-text',
  warning: 'text-ui-text-highlighted',
  error: 'text-ui-error-text',
};

const toneClass = computed(() => bar[props.color]);
const icon = computed(() => icons[props.color]);
const iconClass = computed(() => marks[props.color]);
</script>

<template>
  <div
    :role="role ?? (color === 'error' ? 'alert' : 'status')"
    :class="['flex w-full flex-wrap items-center gap-3 border-b px-6 py-2.5 text-sm', toneClass]"
  >
    <component
      :is="icon"
      class="size-4.5 shrink-0"
      :class="iconClass"
      aria-hidden="true"
    />
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <p
        v-if="title"
        class="font-medium text-ui-text-highlighted"
      >
        {{ title }}
      </p>
      <div
        v-if="$slots.default"
        class="text-ui-text-toned"
      >
        <slot />
      </div>
    </div>
    <slot name="action" />
    <button
      v-if="dismissible"
      type="button"
      :aria-label="messages.close"
      class="shrink-0 rounded-ui p-1 text-ui-text-muted outline-none hover:bg-ui-bg-elevated hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="emit('dismiss')"
    >
      <X
        class="size-4"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
