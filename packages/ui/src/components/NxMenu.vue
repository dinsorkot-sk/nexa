<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';

export interface NxMenuItem {
  value: string;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
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

function select(item: NxMenuItem) {
  if (item.disabled) return;
  emit('select', item.value);
  if (props.open === undefined) internalOpen.value = false;
  emit('update:open', false);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (props.open === undefined) internalOpen.value = false;
    emit('update:open', false);
  }
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
      class="inline-flex items-center gap-2 rounded-ui border border-ui-border-accented bg-ui-bg px-3 py-2 text-sm text-ui-text outline-none hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-primary"
      @click="toggle"
    >
      <slot name="trigger">
        {{ label }}
      </slot>
      <ChevronDown
        class="size-4 text-ui-text-muted"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="isOpen"
      role="menu"
      :class="[
        'absolute z-40 mt-1 min-w-48 rounded-ui border border-ui-border bg-ui-bg p-1 shadow-lg',
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
            'flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
            item.destructive ? 'text-ui-error-text hover:bg-ui-error/10' : 'text-ui-text hover:bg-ui-bg-muted',
          ]"
          @click="select(item)"
        >
          {{ item.label }}
          <Check
            v-if="item.selected"
            class="size-4"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
