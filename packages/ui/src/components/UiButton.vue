<template>
  <button
    :type="type"
    :class="buttonClass"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <Loader2
      v-if="loading"
      class="size-4 shrink-0 animate-spin"
      aria-hidden="true"
    />
    <component
      :is="leadingIcon"
      v-else-if="leadingIcon"
      class="size-4 shrink-0"
      aria-hidden="true"
    />
    <slot />
    <component
      :is="trailingIcon"
      v-if="trailingIcon"
      class="size-4 shrink-0"
      aria-hidden="true"
    />
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { cn } from '../cn';

/**
 * Button API follows the Nuxt UI vocabulary (variant, color, size, leading/trailing icon, block, square) so the
 * design reference maps one-to-one. Nexa has no separate neutral/error palette: `neutral` uses surface tokens and
 * `error` uses the `danger` tokens, both defined in theme.css. `primary` stays Emerald.
 */
const props = withDefaults(defineProps<{
  variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link';
  color?: 'primary' | 'neutral' | 'error';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  square?: boolean;
  leadingIcon?: Component;
  trailingIcon?: Component;
  class?: string;
}>(), {
  variant: 'solid',
  color: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
  square: false,
  leadingIcon: undefined,
  trailingIcon: undefined,
  class: undefined,
});

defineEmits<{ click: [event: MouseEvent] }>();

// Each color/variant pair resolves to semantic tokens only; raw palette classes are unavailable (theme.css).
const tone = computed(() => {
  const c = props.color;
  const v = props.variant;
  if (c === 'primary') {
    if (v === 'solid') return 'bg-primary text-primary-foreground hover:bg-primary-hover';
    if (v === 'outline') return 'border border-primary text-primary hover:bg-surface-muted';
    if (v === 'soft' || v === 'subtle') return 'bg-surface-muted text-primary hover:bg-surface-muted';
    return 'text-primary hover:bg-surface-muted';
  }
  if (c === 'error') {
    if (v === 'solid') return 'bg-danger text-danger-foreground hover:bg-danger-hover';
    if (v === 'outline') return 'border border-danger text-danger hover:bg-danger-soft';
    if (v === 'soft' || v === 'subtle') return 'bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft';
    return 'text-danger hover:bg-danger-soft';
  }
  // neutral
  if (v === 'solid') return 'border border-border bg-surface-muted text-foreground hover:bg-surface-muted';
  if (v === 'outline') return 'border border-border bg-surface text-foreground hover:bg-surface-muted';
  if (v === 'soft' || v === 'subtle') return 'bg-neutral-soft text-neutral-soft-foreground hover:bg-surface-muted';
  return 'text-foreground-muted hover:bg-surface-muted hover:text-foreground';
});

const sizeClass = computed(() => {
  if (props.square) {
    return {
      xs: 'size-6 text-xs', sm: 'size-7 text-sm', md: 'size-8 text-sm', lg: 'size-9 text-base', xl: 'size-10 text-base',
    }[props.size];
  }
  return {
    xs: 'px-2 py-1 text-xs gap-1',
    sm: 'px-2.5 py-1 text-sm gap-1.5',
    md: 'px-3 py-2 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
    xl: 'px-5 py-3 text-base gap-2',
  }[props.size];
});

const buttonClass = computed(() => cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  tone.value,
  sizeClass.value,
  { 'w-full': props.block },
  props.class,
));
</script>
