<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';
import type { ToastColor } from '../lib/toast';
import NxIconButton from './NxIconButton.vue';

/**
 * Transient feedback after an action, as the mockup's Toast section. Use pushToast and NxToaster for queued
 * toasts; this is for a toast you place yourself. Put an optional action in the `action` slot.
 */
const props = withDefaults(defineProps<{
  title: string;
  description?: string;
  color?: ToastColor;
}>(), { description: undefined, color: 'neutral' });

const emit = defineEmits<{ close: [] }>();
const messages = useNxMessages();

const icons = { neutral: Info, info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } as const;
// The warning icon colour is too light on the toast surface, so it uses the highlighted token.
const iconColor = {
  neutral: 'text-ui-text-muted',
  info: 'text-ui-info-text',
  success: 'text-ui-success-text',
  warning: 'text-ui-text-highlighted',
  error: 'text-ui-error-text',
} as const;

const icon = computed(() => icons[props.color]);
// Error toasts are announced as alerts; the others as status.
const role = computed(() => (props.color === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div
    :role="role"
    class="pointer-events-auto flex w-full items-start gap-3 rounded-ui-xl border border-ui-border bg-ui-bg p-4 shadow-lg"
  >
    <component
      :is="icon"
      aria-hidden="true"
      :class="['mt-0.5 size-5 shrink-0', iconColor[color]]"
    />
    <div class="min-w-0 flex-1 space-y-0.5">
      <p class="text-sm font-medium text-ui-text-highlighted">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="text-xs text-ui-text-muted"
      >
        {{ description }}
      </p>
      <div
        v-if="$slots.action"
        class="pt-2.5"
      >
        <slot name="action" />
      </div>
    </div>
    <NxIconButton
      :icon="X"
      :label="messages.close"
      size="sm"
      @click="emit('close')"
    />
  </div>
</template>
