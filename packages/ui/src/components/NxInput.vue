<script setup lang="ts">
import type { Component } from 'vue';
import { useId } from 'vue';
import { fieldBox, fieldStyles } from '../lib/input';

/**
 * Single-line text field. The leading and trailing icons are the mockup's Icon axis: colour them with the
 * dimmed token (the wrapper does this for the caller).
 */
withDefaults(defineProps<{
  modelValue?: string | number | null;
  id?: string;
  type?: string;
  variant?: 'outline' | 'soft' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
  /** Leading icon, for example a search or folder icon. */
  icon?: Component;
  /** Trailing icon, for example a reveal or clear icon. */
  trailingIcon?: Component;
  /** Accessible name for the trailing icon. Given one it becomes a button and emits `trailing-icon-click`. */
  trailingLabel?: string;
}>(), {
  modelValue: undefined,
  id: undefined,
  type: 'text',
  variant: 'outline',
  size: 'md',
  invalid: false,
  disabled: false,
  icon: undefined,
  trailingIcon: undefined,
  trailingLabel: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'trailing-icon-click': [];
}>();

defineOptions({ inheritAttrs: false });

const generatedId = useId();
</script>

<template>
  <div class="relative">
    <component
      :is="icon"
      v-if="icon"
      aria-hidden="true"
      class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
      :class="size === 'lg' ? 'ml-4' : size === 'sm' ? 'ml-2.5' : 'ml-3'"
    />
    <input
      :id="id ?? generatedId"
      :type="type"
      :value="modelValue ?? ''"
      :disabled="disabled"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :class="[
        fieldStyles({ variant, size, invalid }),
        fieldBox[size],
        icon ? (size === 'lg' ? 'pl-11' : size === 'sm' ? 'pl-8' : 'pl-9') : '',
        trailingIcon ? (size === 'lg' ? 'pr-11' : size === 'sm' ? 'pr-8' : 'pr-9') : '',
      ]"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <button
      v-if="trailingIcon && trailingLabel"
      type="button"
      class="absolute right-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed hover:text-ui-text-toned"
      :class="size === 'lg' ? 'mr-4' : size === 'sm' ? 'mr-2.5' : 'mr-3'"
      :aria-label="trailingLabel"
      @click="emit('trailing-icon-click')"
    >
      <component
        :is="trailingIcon"
        aria-hidden="true"
        :class="size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4'"
      />
    </button>
    <component
      :is="trailingIcon"
      v-else-if="trailingIcon"
      aria-hidden="true"
      class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
      :class="[size === 'lg' ? 'mr-4' : size === 'sm' ? 'mr-2.5' : 'mr-3', size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4']"
    />
  </div>
</template>
