<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';

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
const toneClass = computed(() => ({
  info: 'border-ui-info/30 bg-ui-info/10 text-ui-text-highlighted',
  success: 'border-ui-success/30 bg-ui-success/10 text-ui-text-highlighted',
  warning: 'border-ui-warning/30 bg-ui-warning/10 text-ui-text-highlighted',
  error: 'border-ui-error/30 bg-ui-error/10 text-ui-text-highlighted',
}[props.color]));
</script>

<template>
  <div
    :role="role ?? (color === 'error' ? 'alert' : 'status')"
    :class="['flex items-start justify-between gap-3 rounded-ui border p-3 text-sm', toneClass]"
  >
    <div>
      <p
        v-if="title"
        class="font-medium"
      >
        {{ title }}
      </p>
      <div :class="title && 'mt-1'">
        <slot />
      </div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      :aria-label="messages.close"
      class="shrink-0 rounded p-1 outline-none hover:bg-ui-bg/50 focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="emit('dismiss')"
    >
      <X
        class="size-4"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
