<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { Search } from 'lucide-vue-next';
import { useFuse } from '@vueuse/integrations/useFuse';
import type { Component } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxKbd from './NxKbd.vue';

export interface NxCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: Component;
  group?: string;
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

/**
 * The fuzzy search is the same one Nuxt UI's command palette uses, so a partial or misspelled term still finds its
 * command. The keyword list of a command is searched next to its label and its description.
 */
const { results } = useFuse(search, () => props.commands, {
  fuseOptions: {
    keys: ['label', 'description', 'keywords'],
    threshold: 0.3,
    ignoreLocation: true,
  },
  matchAllWhenSearchEmpty: true,
});

/** The commands split into consecutive runs that share a `group`; each run sits under one small caption. */
const runs = computed(() => {
  const out: Array<{ group?: string; items: NxCommand[] }> = [];
  for (const command of props.commands) {
    const last = out.at(-1);
    if (last && last.group === command.group) last.items.push(command);
    else out.push({ group: command.group, items: [command] });
  }
  return out;
});

/** The ranking orders the rows inside a group. The groups themselves keep the order the commands came in. */
const groups = computed(() => {
  const rank = new Map(results.value.map((result, index) => [result.item, index]));
  const out: Array<{ group?: string; items: NxCommand[] }> = [];
  for (const run of runs.value) {
    const items = run.items
      .filter((command) => rank.has(command))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    if (items.length) out.push({ group: run.group, items });
  }
  return out;
});

const filtered = computed(() => groups.value.flatMap((group) => group.items));

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
      <DialogOverlay class="fixed inset-0 z-50 bg-ui-overlay data-[state=open]:animate-ui-fade-in data-[state=closed]:animate-ui-fade-out" />
      <DialogContent
        class="fixed left-1/2 top-[15vh] z-50 w-[min(35rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-ui-xl border border-ui-border bg-ui-bg shadow-lg outline-none data-[state=open]:animate-ui-pop-in data-[state=closed]:animate-ui-pop-out"
      >
        <DialogTitle class="sr-only">
          {{ label }}
        </DialogTitle>
        <DialogDescription class="sr-only">
          {{ placeholder ?? messages.search }}
        </DialogDescription>
        <div class="flex items-center gap-2.5 border-b border-ui-border px-4 py-3.5">
          <Search
            class="size-4.5 shrink-0 text-ui-text-dimmed"
            aria-hidden="true"
          />
          <input
            v-model="search"
            type="search"
            :aria-label="label"
            :aria-controls="`${id}-results`"
            :aria-activedescendant="filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined"
            :placeholder="placeholder ?? messages.search"
            class="min-w-0 flex-1 bg-transparent text-base text-ui-text-highlighted outline-none placeholder:text-ui-text-dimmed"
            @keydown="onKeydown"
          >
          <NxKbd
            variant="subtle"
            size="sm"
          >
            Esc
          </NxKbd>
        </div>
        <div
          :id="`${id}-results`"
          role="listbox"
          :aria-label="label"
          class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-2"
        >
          <template
            v-for="(group, groupIndex) in groups"
            :key="group.group ?? groupIndex"
          >
            <p
              v-if="group.group"
              role="presentation"
              class="px-2 pb-1 pt-1.5 text-[11px] font-medium text-ui-text-dimmed"
            >
              {{ group.group }}
            </p>
            <div
              v-for="command in group.items"
              :id="`${id}-option-${filtered.indexOf(command)}`"
              :key="command.id"
              role="option"
              :aria-selected="filtered.indexOf(command) === activeIndex"
              :class="[
                'flex cursor-pointer items-center gap-2 rounded-ui px-2 py-1.5 outline-none transition-colors duration-ui-fast ease-ui-out',
                filtered.indexOf(command) === activeIndex ? 'bg-ui-bg-elevated' : 'hover:bg-ui-bg-elevated',
              ]"
              @mouseenter="activeIndex = filtered.indexOf(command)"
              @click="choose(command)"
            >
              <component
                :is="command.icon"
                v-if="command.icon"
                class="size-4 shrink-0 text-ui-text-muted"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ui-text-highlighted">{{ command.label }}</span>
                <span
                  v-if="command.description"
                  class="block truncate text-xs text-ui-text-muted"
                >{{ command.description }}</span>
              </span>
            </div>
          </template>
        </div>
        <p
          v-if="!filtered.length"
          role="status"
          class="px-4 py-8 text-center text-sm text-ui-text-muted"
        >
          {{ messages.noResults }}
        </p>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
