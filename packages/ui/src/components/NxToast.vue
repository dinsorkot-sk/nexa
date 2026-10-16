<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next';
import { computed } from 'vue';
import type { ToastColor } from '../lib/toast';
import { useNxMessages } from '../lib/locale';
import NxIconButton from './NxIconButton.vue';

/** Presentational toast. Use pushToast and NxToaster for queued toasts; this is for a toast you place yourself. */
const props = withDefaults(defineProps<{
  title: string;
  description?: string;
  color?: ToastColor;
}>(), { description: undefined, color: 'info' });

const emit = defineEmits<{ close: [] }>();
const messages = useNxMessages();

const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } as const;
const iconColor = { info: 'text-ui-info-text', success: 'text-ui-success-text', warning: 'text-ui-text-highlighted', error: 'text-ui-error-text' } as const;
const icon = computed(() => icons[props.color]);
const role = computed(() => (props.color === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div
    :role="role"
    class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-ui border border-ui-border bg-ui-bg p-4 shadow-lg"
  >
    <component
      :is="icon"
      aria-hidden="true"
      :class="['mt-0.5 size-4 shrink-0', iconColor[color]]"
    />
    <div class="min-w-0 flex-1 space-y-1">
      <p class="text-sm font-medium text-ui-text-highlighted">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="text-sm text-ui-text-toned"
      >
        {{ description }}
      </p>
    </div>
    <NxIconButton
      :icon="X"
      :label="messages.close"
      size="sm"
      @click="emit('close')"
    />
  </div>
</template>
