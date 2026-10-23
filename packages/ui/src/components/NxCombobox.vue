<script setup lang="ts">
import { Check, ChevronsUpDown, Search } from 'lucide-vue-next';
import {
  ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxPortal, ComboboxRoot,
  ComboboxTrigger, ComboboxViewport,
} from 'reka-ui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { comboboxMaxLimit, type ComboboxOption, type LoadOptions } from '../lib/combobox';
import { useNxMessages } from '../lib/locale';
import NxChip from './NxChip.vue';

/**
 * Searchable picker. Pass `options` for a short static list, or `loadOptions` to search on the server. The component
 * never calls an API itself. `multiple` stores an array of ids and shows each chosen label as a removable chip.
 * Stored values are ids; labels are display only. `label` is the accessible name and is required.
 */
const props = withDefaults(defineProps<{
  modelValue?: string | string[] | null;
  multiple?: boolean;
  options?: ComboboxOption[];
  loadOptions?: LoadOptions;
  /** Labels for values already chosen, so they show before any search has run. */
  selected?: ComboboxOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  debounceMs?: number;
}>(), {
  modelValue: undefined,
  multiple: false,
  options: undefined,
  loadOptions: undefined,
  selected: () => [],
  placeholder: undefined,
  disabled: false,
  invalid: false,
  id: undefined,
  describedBy: undefined,
  debounceMs: 250,
});

const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | undefined] }>();
const messages = useNxMessages();

type Status = 'idle' | 'loading' | 'ready' | 'error';
const status = ref<Status>('idle');
const items = ref<ComboboxOption[]>([]);
const search = ref('');
const open = ref(false);

/** Every label seen so far, so a chosen value keeps its label after the option list changes. */
const labels = new Map<string, string>();
function remember(list: ComboboxOption[]) { for (const item of list) labels.set(item.value, item.label); }
watch(() => props.selected, (list) => remember(list ?? []), { immediate: true, deep: true });
watch(() => props.options, (list) => remember(list ?? []), { immediate: true, deep: true });

/** Without a server search, filter the static list on the client. */
const fetcher: LoadOptions = props.loadOptions ?? (async (term) => {
  const needle = term.trim().toLowerCase();
  return (props.options ?? []).filter((option) => option.label.toLowerCase().includes(needle));
});

const selectedValues = computed<string[]>(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : [];
});
const labelOf = (value: string) => labels.get(value) ?? value;
const chips = computed(() => (props.multiple ? selectedValues.value.map((value) => ({ value, label: labelOf(value) })) : []));
const rootValue = computed(() => (props.multiple ? selectedValues.value : (selectedValues.value[0] ?? undefined)));
/** The typed text drives the fetcher; the label of a single selection is what the input shows after it. */
const displayValue = (value: unknown) => (typeof value === 'string' ? labelOf(value) : '');

const anchorClass = computed(() => [
  'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-ui border bg-ui-bg px-2 py-1 text-sm text-ui-text-highlighted transition-colors focus-within:ring-2 focus-within:ring-ui-primary',
  props.invalid ? 'border-ui-error' : 'border-ui-border-accented hover:border-ui-text-dimmed',
  props.disabled && 'cursor-not-allowed bg-ui-bg-muted opacity-50',
]);

// Each request gets a sequence number and an AbortController. Only the newest may update the list, so a slow response
// to an earlier search can never overwrite the results of a later one.
let latest = 0;
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(term: string) {
  const mine = ++latest;
  controller?.abort();
  controller = new AbortController();
  status.value = 'loading';
  try {
    const result = await fetcher(term, { limit: comboboxMaxLimit, signal: controller.signal });
    if (mine !== latest) return;
    items.value = result.slice(0, comboboxMaxLimit);
    remember(items.value);
    status.value = 'ready';
  } catch {
    if (mine !== latest) return;
    items.value = [];
    status.value = 'error';
  }
}

function onSearch(term: string) {
  search.value = term;
  if (!open.value) return;
  clearTimeout(timer);
  // A static list is filtered locally, so it answers as soon as the term changes; a server search is
  // debounced so a fast typist does not give the network every letter.
  if (!props.loadOptions) {
    void run(term);
    return;
  }
  timer = setTimeout(() => {
    if (open.value) void run(term);
  }, props.debounceMs);
}

/** Opening lists the matches for the text the input already holds (typing into a closed input opens it in reka). */
function onOpenChange(next: boolean) {
  open.value = next;
  clearTimeout(timer);
  if (next) void run(search.value);
}

function onSelect(value: unknown) {
  if (props.multiple) {
    emit('update:modelValue', Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
    search.value = '';
  } else {
    emit('update:modelValue', typeof value === 'string' && value ? value : undefined);
    search.value = typeof value === 'string' ? labelOf(value) : '';
    open.value = false;
  }
}

function removeValue(value: string) {
  emit('update:modelValue', selectedValues.value.filter((item) => item !== value));
}

onBeforeUnmount(() => {
  clearTimeout(timer);
  controller?.abort();
  latest += 1;
});
</script>

<template>
  <ComboboxRoot
    :model-value="rootValue"
    :multiple="multiple"
    :open="open"
    :ignore-filter="true"
    :disabled="disabled"
    @update:model-value="onSelect"
    @update:open="onOpenChange"
  >
    <ComboboxAnchor :class="anchorClass">
      <NxChip
        v-for="item in chips"
        :key="item.value"
        removable
        :remove-label="messages.remove(item.label)"
        @remove="removeValue(item.value)"
      >
        {{ item.label }}
      </NxChip>
      <ComboboxInput
        :id="id"
        :display-value="displayValue"
        :aria-label="label"
        :aria-describedby="describedBy"
        :aria-invalid="invalid || undefined"
        :placeholder="chips.length ? undefined : placeholder"
        :disabled="disabled"
        class="min-w-24 flex-1 bg-transparent px-1 py-1 outline-none placeholder:text-ui-text-muted"
        @update:model-value="onSearch"
      />
      <ComboboxTrigger
        :aria-label="messages.openList"
        :disabled="disabled"
        class="group rounded px-1 text-ui-text-dimmed outline-none transition-colors duration-ui-fast focus-visible:ring-2 focus-visible:ring-ui-primary"
      >
        <ChevronsUpDown
          class="size-4 transition-transform duration-ui ease-ui-out group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 w-[var(--reka-combobox-trigger-width)] overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg text-ui-text shadow-lg data-[state=closed]:animate-ui-rise-out data-[state=open]:animate-ui-rise-in"
      >
        <ComboboxViewport class="flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1">
          <div
            v-if="status === 'loading'"
            role="status"
            class="px-3 py-2 text-sm text-ui-text-muted"
          >
            {{ messages.loading }}
          </div>
          <div
            v-else-if="status === 'error'"
            role="alert"
            class="flex items-center justify-between gap-2 px-3 py-2 text-sm text-ui-error-text"
          >
            <span>{{ messages.comboboxError }}</span>
            <button
              type="button"
              class="rounded px-2 py-0.5 underline outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
              @click="run(search)"
            >
              {{ messages.retry }}
            </button>
          </div>
          <div
            v-else-if="status === 'ready' && !items.length"
            class="flex flex-col items-center gap-1 px-3 py-5 text-center"
          >
            <Search
              class="size-5 text-ui-text-dimmed"
              aria-hidden="true"
            />
            <p class="text-sm font-medium text-ui-text-highlighted">
              {{ messages.noMatches }}
            </p>
            <p class="text-xs text-ui-text-muted">
              {{ messages.noMatchesHint }}
            </p>
          </div>
          <ComboboxItem
            v-for="option in items"
            :key="option.value"
            :value="option.value"
            class="group flex cursor-pointer items-center gap-2 rounded-ui px-2 py-1.5 text-sm text-ui-text outline-none data-[highlighted]:bg-ui-bg-elevated data-[state=checked]:text-ui-text-highlighted"
          >
            <span
              v-if="multiple"
              class="flex size-3.5 shrink-0 items-center justify-center rounded-ui-sm border border-ui-border-accented bg-ui-bg group-data-[state=checked]:border-ui-primary group-data-[state=checked]:bg-ui-primary"
            >
              <ComboboxItemIndicator>
                <Check
                  class="size-2.5 text-ui-on-solid"
                  aria-hidden="true"
                />
              </ComboboxItemIndicator>
            </span>
            <span class="flex-1 truncate">{{ option.label }}</span>
            <ComboboxItemIndicator v-if="!multiple">
              <Check
                class="size-4 text-ui-primary-text"
                aria-hidden="true"
              />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
        <div
          v-if="multiple && selectedValues.length"
          class="flex items-center justify-between gap-2 border-t border-ui-border px-2 py-1.5 pl-2.5"
        >
          <span class="text-xs text-ui-text-muted">{{ messages.selectedCount(selectedValues.length) }}</span>
          <button
            type="button"
            class="rounded-ui px-2 py-1 text-xs font-medium text-ui-text-muted outline-none hover:bg-ui-bg-elevated hover:text-ui-text-highlighted focus-visible:ring-2 focus-visible:ring-ui-primary"
            @click="emit('update:modelValue', [])"
          >
            {{ messages.clear }}
          </button>
        </div>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
