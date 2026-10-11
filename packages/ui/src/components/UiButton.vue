<template>
  <button
    :type="type"
    :class="buttonClass"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <span
      v-if="loading"
      class="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../cn';

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  class?: string;
}>(), { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false, class: undefined });

defineEmits<{ click: [event: MouseEvent] }>();

const buttonClass = computed(() => cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    'bg-primary text-primary-foreground hover:bg-primary-hover': props.variant === 'primary',
    'border border-border bg-surface-muted text-foreground hover:bg-border': props.variant === 'secondary',
    'text-foreground-muted hover:bg-surface-muted hover:text-foreground': props.variant === 'ghost',
    'bg-danger text-danger-foreground hover:bg-danger-hover': props.variant === 'danger',
    'px-2.5 py-1 text-xs': props.size === 'sm',
    'px-3 py-2 text-sm': props.size === 'md',
    'px-4 py-2.5 text-base': props.size === 'lg',
  },
  props.class,
));
</script>
