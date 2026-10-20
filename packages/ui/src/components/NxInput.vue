<script setup lang="ts">
import type { Component } from 'vue';
import { computed, useId } from 'vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { fieldBox, fieldStyles } from '../lib/input';

/**
 * Single-line text field. The leading and trailing icons are the mockup's Icon axis: colour them with the
 * dimmed token (the wrapper does this for the caller). Rendered by Nuxt UI's input, with the mockup's own
 * classes handed over through its `ui` prop.
 */
const props = withDefaults(defineProps<{
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

const generatedId = useId();

const ui = computed(() => ({
  root: 'relative flex w-full items-center',
  base: [
    fieldStyles({ variant: props.variant, size: props.size, invalid: props.invalid }),
    fieldBox[props.size],
    props.icon ? (props.size === 'lg' ? 'pl-11' : props.size === 'sm' ? 'pl-8' : 'pl-9') : '',
    props.trailingIcon ? (props.size === 'lg' ? 'pr-11' : props.size === 'sm' ? 'pr-8' : 'pr-9') : '',
  ].join(' '),
  leading: 'absolute inset-y-0 start-0 flex items-center ps-0',
  trailing: 'absolute inset-y-0 end-0 flex items-center pe-0',
}));

/** The mockup's icon offsets from the edge of the field. */
const iconOffset = computed(() => (props.size === 'lg' ? 'ml-4' : props.size === 'sm' ? 'ml-2.5' : 'ml-3'));
const trailingOffset = computed(() => (props.size === 'lg' ? 'mr-4' : props.size === 'sm' ? 'mr-2.5' : 'mr-3'));

/**
 * Nuxt UI turns the value of a `type="number"` field into a number on the way out. This field keeps the raw text,
 * because the number parsing lives in `lib/number.ts` and has to accept a half-typed value such as "-" or "1e".
 */
function onValue(value: string | number | null | undefined) {
  emit('update:modelValue', typeof value === 'number' ? String(value) : (value ?? ''));
}
</script>

<template>
  <UInput
    :id="id ?? generatedId"
    :type="type"
    :model-value="modelValue === null || modelValue === undefined ? '' : String(modelValue)"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :ui="ui"
    @update:model-value="onValue"
  >
    <template
      v-if="icon"
      #leading
    >
      <component
        :is="icon"
        aria-hidden="true"
        class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
        :class="iconOffset"
      />
    </template>
    <template
      v-if="trailingIcon"
      #trailing
    >
      <button
        v-if="trailingLabel"
        type="button"
        class="absolute right-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed hover:text-ui-text-toned"
        :class="trailingOffset"
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
        v-else
        aria-hidden="true"
        class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ui-text-dimmed"
        :class="[trailingOffset, size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4']"
      />
    </template>
  </UInput>
</template>
