<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
import type { Component } from 'vue';

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
}>(), {
  open: undefined,
  align: 'start',
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

/** The item the keyboard is on, by value. */
const activeValue = ref<string | undefined>(undefined);

/** The items a person can reach. */
const enabled = computed(() => props.items.filter((item) => !item.disabled));

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

/** Moves the focus onto the nth item that is not disabled. */
function focusEnabled(position: number) {
  const items = menuRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
  if (!items?.length) return;
  const index = (position + items.length) % items.length;
  items[index]?.focus();
}

/** Moves the focus by so many items, skipping the disabled ones. */
function moveFocus(delta: number) {
  const list = enabled.value;
  if (!list.length) return;
  const current = list.findIndex((item) => item.value === activeValue.value);
  focusEnabled(current < 0 ? (delta > 0 ? 0 : list.length - 1) : current + delta);
}

/** The letters typed in a row pick the item whose label starts with them. */
let typeahead = '';
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;

function onTypeahead(event: KeyboardEvent) {
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
  typeahead += event.key.toLowerCase();
  clearTimeout(typeaheadTimer);
  typeaheadTimer = setTimeout(() => { typeahead = ''; }, 500);
  const index = enabled.value.findIndex((item) => item.label.toLowerCase().startsWith(typeahead));
  if (index >= 0) focusEnabled(index);
}

function onMenuKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); moveFocus(1); break;
    case 'ArrowUp': event.preventDefault(); moveFocus(-1); break;
    case 'Home': event.preventDefault(); focusEnabled(0); break;
    case 'End': event.preventDefault(); focusEnabled(enabled.value.length - 1); break;
    case 'Escape': event.preventDefault(); close(true); break;
    case 'Tab': close(); break;
    default: onTypeahead(event);
  }
}

/** The trigger opens the menu with the arrow keys, and the menu takes the focus. */
function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  if (!isOpen.value) toggle();
  nextTick(() => focusEnabled(event.key === 'ArrowDown' ? 0 : enabled.value.length - 1));
}

/** A click outside the menu closes it. */
function onDocumentPointerdown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) close();
}

/** The focus leaving the menu closes it, so it cannot be left open behind. */
function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (next && rootRef.value?.contains(next)) return;
  close();
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointerdown, true);
    nextTick(() => {
      const selected = enabled.value.findIndex((item) => item.selected);
      focusEnabled(selected >= 0 ? selected : 0);
    });
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerdown, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerdown, true);
  clearTimeout(typeaheadTimer);
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
      class="inline-flex items-center gap-2 rounded-ui border border-ui-border-accented bg-ui-bg px-3 py-2 text-sm text-ui-text outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <slot name="trigger">
        {{ label }}
      </slot>
      <ChevronDown
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
