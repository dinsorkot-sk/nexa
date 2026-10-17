<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useNxMessages } from '../lib/locale';

export interface NxCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
}

const props = withDefaults(defineProps<{
  open: boolean;
  commands: NxCommand[];
  label: string;
  placeholder?: string;
}>(), { placeholder: undefined });

const emit = defineEmits<{
  'update:open': [open: boolean];
  select: [command: NxCommand];
}>();
const messages = useNxMessages();
const id = `nx-command-${useId()}`;
const search = ref('');
const activeIndex = ref(0);
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) return props.commands;
  return props.commands.filter((command) =>
    [command.label, command.description, ...(command.keywords ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(query)),
  );
});
watch(() => props.open, (open) => {
  if (open) {
    search.value = '';
    activeIndex.value = 0;
  }
});
watch(filtered, () => { activeIndex.value = 0; });

function choose(command: NxCommand) {
  emit('select', command);
  emit('update:open', false);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && filtered.value.length) {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % filtered.value.length;
  } else if (event.key === 'ArrowUp' && filtered.value.length) {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + filtered.value.length) % filtered.value.length;
  } else if (event.key === 'Enter' && filtered.value[activeIndex.value]) {
    event.preventDefault();
    choose(filtered.value[activeIndex.value]);
  }
}
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-ui-bg-inverted/40" />
      <DialogContent
        class="fixed left-1/2 top-[15vh] z-50 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-ui border border-ui-border bg-ui-bg shadow-xl outline-none"
      >
        <DialogTitle class="sr-only">
          {{ label }}
        </DialogTitle>
        <DialogDescription class="sr-only">
          {{ placeholder ?? messages.search }}
        </DialogDescription>
        <input
          v-model="search"
          type="search"
          :aria-label="label"
          :aria-controls="`${id}-results`"
          :aria-activedescendant="filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined"
          :placeholder="placeholder ?? messages.search"
          class="w-full border-b border-ui-border bg-ui-bg px-4 py-3 text-sm text-ui-text-highlighted outline-none placeholder:text-ui-text-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-primary"
          @keydown="onKeydown"
        >
        <ul
          v-if="filtered.length"
          :id="`${id}-results`"
          role="listbox"
          :aria-label="label"
          class="max-h-80 overflow-y-auto p-1"
        >
          <li
            v-for="(command, index) in filtered"
            :id="`${id}-option-${index}`"
            :key="command.id"
            role="option"
            :aria-selected="index === activeIndex"
            :class="[
              'cursor-pointer rounded px-3 py-2 outline-none',
              index === activeIndex ? 'bg-ui-bg-elevated' : 'hover:bg-ui-bg-muted',
            ]"
            @mouseenter="activeIndex = index"
            @click="choose(command)"
          >
            <span class="block text-sm font-medium text-ui-text-highlighted">{{ command.label }}</span>
            <span
              v-if="command.description"
              class="mt-0.5 block text-xs text-ui-text-muted"
            >{{ command.description }}</span>
          </li>
        </ul>
        <p
          v-else
          role="status"
          class="px-4 py-8 text-center text-sm text-ui-text-muted"
        >
          {{ messages.noResults }}
        </p>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
