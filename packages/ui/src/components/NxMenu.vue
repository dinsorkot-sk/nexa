<script setup lang="ts">
import { computed, ref } from 'vue';
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

function toggle() {
  const next = !isOpen.value;
  if (props.open === undefined) internalOpen.value = next;
  emit('update:open', next);
}

function close() {
  if (props.open === undefined) internalOpen.value = false;
  emit('update:open', false);
}

function select(item: NxMenuItem) {
  if (item.disabled) return;
  emit('select', item.value);
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}
</script>

<template>
  <div
    class="relative inline-block"
    @keydown="onKeydown"
  >
    <button
      type="button"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-label="label"
      class="inline-flex items-center gap-2 rounded-ui border border-ui-border-accented bg-ui-bg px-3 py-2 text-sm text-ui-text outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="toggle"
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
      role="menu"
      :class="[
        'absolute z-40 mt-1 min-w-54 animate-ui-rise-in rounded-ui-lg border border-ui-border bg-ui-bg p-1 shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
      ]"
    >
      <li
        v-for="item in items"
        :key="item.value"
        role="none"
      >
        <button
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          :class="[
            'flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm font-normal outline-none transition-colors duration-ui-fast focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
            item.destructive
              ? 'text-ui-error-text hover:bg-ui-error-soft'
              : 'text-ui-text-highlighted hover:bg-ui-bg-elevated',
          ]"
          @click="select(item)"
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
