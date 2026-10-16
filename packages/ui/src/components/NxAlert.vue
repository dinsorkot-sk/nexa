<script setup lang="ts">
import type { Component } from 'vue';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next';
import { tv } from 'tailwind-variants';

export type AlertColor = 'info' | 'success' | 'warning' | 'error';

const alert = tv({
  base: 'flex gap-3 rounded-ui border p-3 text-sm',
  variants: {
    color: {
      info: 'border-ui-info/40 bg-ui-info/10',
      success: 'border-ui-success/40 bg-ui-success/10',
      warning: 'border-ui-warning/50 bg-ui-warning/15',
      error: 'border-ui-error/40 bg-ui-error/10',
    },
  },
  defaultVariants: { color: 'info' },
});

// Icon colours avoid the warning text token, which is below the 3:1 non-text contrast on a light background.
const iconColor: Record<AlertColor, string> = {
  info: 'text-ui-info-text',
  success: 'text-ui-success-text',
  warning: 'text-ui-text-highlighted',
  error: 'text-ui-error-text',
};

const icons: Record<AlertColor, Component> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

const props = withDefaults(defineProps<{
  color?: AlertColor;
  title?: string;
  description?: string;
}>(), { color: 'info', title: undefined, description: undefined });
</script>

<template>
  <div
    :role="props.color === 'error' ? 'alert' : 'status'"
    :class="alert({ color })"
  >
    <component
      :is="icons[props.color]"
      aria-hidden="true"
      :class="['mt-0.5 size-4 shrink-0', iconColor[props.color]]"
    />
    <div class="min-w-0 flex-1 space-y-1">
      <p
        v-if="title"
        class="font-medium text-ui-text-highlighted"
      >
        {{ title }}
      </p>
      <p
        v-if="description"
        class="text-ui-text-toned"
      >
        {{ description }}
      </p>
      <slot />
    </div>
  </div>
</template>
