<template>
  <button
    :type="type"
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
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
}>(), { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false });

defineEmits<{ click: [event: MouseEvent] }>();

const buttonClass = computed(() => cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50',
  {
    'bg-emerald-600 text-white hover:bg-emerald-500': props.variant === 'primary',
    'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700': props.variant === 'secondary',
    'text-slate-300 hover:bg-slate-800 hover:text-white': props.variant === 'ghost',
    'bg-rose-600 text-white hover:bg-rose-500': props.variant === 'danger',
    'px-2.5 py-1 text-xs': props.size === 'sm',
    'px-3 py-2 text-sm': props.size === 'md',
    'px-4 py-2.5 text-base': props.size === 'lg',
  },
  props.class,
));
</script>
