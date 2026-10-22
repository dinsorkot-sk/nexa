<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
import type { Component } from 'vue';
import { useMenuKeyboard } from '../lib/menu';

/** A row of the menu, as the mockup's MenuItem section: an optional leading icon and a destructive tone. */
export interface NxMenuItem {
  value: string;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  icon?: Component;
}

const props = withDefaults(defineProps<{
  items: NxMenuItem[];
  label: string;
  open?: boolean;
  align?: 'start' | 'end';
  /** Draws a small icon-only trigger, for a card action; the trigger slot carries the icon. */
  compact?: boolean;
}>(), {
  open: undefined,
  align: 'start',
  compact: false,
});

const emit = defineEmits<{
  'update:open': [open: boolean];
  select: [value: string];
}>();

const internalOpen = ref(false);
const isOpen = computed(() => props.open ?? internalOpen.value);

const triggerId = useId();
const menuId = useId();
const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

function toggle() {
  const next = !isOpen.value;
  if (props.open === undefined) internalOpen.value = next;
  emit('update:open', next);
}

function close(restoreFocus = false) {
  if (props.open === undefined) internalOpen.value = false;
  emit('update:open', false);
  if (restoreFocus) triggerRef.value?.focus();
}

function select(item: NxMenuItem) {
  if (item.disabled) return;
  emit('select', item.value);
  close(true);
}

const { activeValue, onMenuKeydown, onTriggerKeydown, onFocusout } = useMenuKeyboard({
  entries: () => props.items,
  isOpen: () => isOpen.value,
  open: toggle,
  close,
  rootRef,
  menuRef,
  triggerRef,
});
</script>

<template>
  <div
    ref="rootRef"
    class="relative inline-block"
    @focusout="onFocusout"
  >
    <button
      :id="triggerId"
      ref="triggerRef"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-controls="menuId"
      :aria-label="label"
      :class="compact
        ? 'inline-flex size-6 items-center justify-center rounded-ui text-ui-text-muted outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary'
        : 'inline-flex items-center gap-2 rounded-ui border border-ui-border-accented bg-ui-bg px-3 py-2 text-sm text-ui-text outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-primary'"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <slot name="trigger">
        {{ label }}
      </slot>
      <ChevronDown
        v-if="!compact"
        class="size-4 text-ui-text-muted transition-transform duration-ui ease-ui-out"
        :class="isOpen && 'rotate-180'"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="isOpen"
      :id="menuId"
      ref="menuRef"
      role="menu"
      :aria-labelledby="triggerId"
      :class="[
        'absolute z-40 mt-1 min-w-54 animate-ui-rise-in rounded-ui-lg border border-ui-border bg-ui-bg p-1 shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
      ]"
      @keydown="onMenuKeydown"
    >
      <li
        v-for="item in items"
        :key="item.value"
        role="none"
      >
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="item.disabled"
          :aria-current="item.selected ? 'true' : undefined"
          :class="[
            'flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm font-normal outline-none transition-colors duration-ui-fast focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
            item.destructive
              ? 'text-ui-error-text hover:bg-ui-error-soft'
              : 'text-ui-text-highlighted hover:bg-ui-bg-elevated',
          ]"
          @click="select(item)"
          @focus="activeValue = item.value"
        >
          <component
            :is="item.icon"
            v-if="item.icon"
            class="size-4 shrink-0"
            :class="item.destructive ? 'text-ui-error-text' : 'text-ui-text-muted'"
            aria-hidden="true"
          />
          <span class="flex-1 truncate">{{ item.label }}</span>
          <Check
            v-if="item.selected"
            class="size-4 shrink-0 text-ui-primary-text"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
