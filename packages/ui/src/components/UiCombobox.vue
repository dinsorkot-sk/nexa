<template>
  <ComboboxRoot
    :model-value="rootValue"
    :multiple="multiple"
    :open="open"
    :search-term="search"
    :filter-function="keepAll"
    :display-value="displayValue"
    :disabled="disabled"
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:model-value="onSelect"
    @update:open="onOpenChange"
    @update:search-term="onSearch"
  >
    <ComboboxAnchor :class="cn('flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring', disabled && 'cursor-not-allowed opacity-50', invalid && 'border-danger', props.class)">
      <span
        v-for="item in chips"
        :key="item.value"
        class="inline-flex items-center gap-1 rounded-full bg-neutral-soft px-2 py-0.5 text-xs text-neutral-soft-foreground"
      >
        {{ item.label }}
        <button
          type="button"
          class="rounded-full px-1 hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled"
          :aria-label="t('combobox.remove', { label: item.label })"
          @click="removeValue(item.value)"
        >×</button>
      </span>
      <ComboboxInput
        :id="id"
        class="min-w-24 flex-1 bg-transparent px-1 py-1 placeholder:text-placeholder focus:outline-none"
        :placeholder="chips.length ? undefined : placeholder"
        :aria-describedby="describedBy"
        :aria-invalid="invalid || undefined"
      />
      <ComboboxTrigger
        class="rounded px-1 text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('combobox.toggle')"
      >
        ▾
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 w-[var(--radix-combobox-trigger-width)] overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-lg"
      >
        <ComboboxViewport class="max-h-64 overflow-y-auto p-1">
          <div
            v-if="status === 'loading'"
            role="status"
            class="px-3 py-2 text-sm text-foreground-muted"
          >
            {{ t('combobox.loading') }}
          </div>
          <div
            v-else-if="status === 'error'"
            role="alert"
            class="flex items-center justify-between gap-2 px-3 py-2 text-sm text-danger-soft-foreground"
          >
            <span>{{ t('combobox.error') }}</span>
            <button
              type="button"
              class="rounded px-2 py-0.5 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="run(search)"
            >
              {{ t('combobox.retry') }}
            </button>
          </div>
          <div
            v-else-if="status === 'ready' && !options.length"
            class="px-3 py-2 text-sm text-foreground-muted"
          >
            {{ t('common.noResults') }}
          </div>
          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="flex cursor-pointer items-center rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted data-[state=checked]:font-medium"
          >
            {{ option.label }}
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport } from 'radix-vue';
import { cn } from '../cn';
import { comboboxMaxLimit, type ComboboxOption, type LoadOptions } from './combobox';

const props = withDefaults(defineProps<{
  /** The selected value: a single id, or an array of ids when `multiple`. Ids are what get stored; labels are display only. */
  modelValue?: string | string[] | null;
  multiple?: boolean;
  /** Fetches options for a search term. The caller does the server-side search; this component never calls an API itself. */
  loadOptions: LoadOptions;
  /** Labels for values already chosen, so they can be shown before any search has run. */
  selected?: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  debounceMs?: number;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  class?: string;
}>(), { modelValue: undefined, multiple: false, selected: () => [], placeholder: undefined, disabled: false, debounceMs: 250, id: undefined, describedBy: undefined, invalid: false, class: undefined });

const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | undefined] }>();
const { t } = useI18n();

type Status = 'idle' | 'loading' | 'ready' | 'error';
const status = ref<Status>('idle');
const options = ref<ComboboxOption[]>([]);
const search = ref('');
const open = ref(false);

/** Every label seen so far, so a chosen value keeps its label after the option list changes. */
const labels = new Map<string, string>();
function remember(list: ComboboxOption[]) { for (const item of list) labels.set(item.value, item.label); }
watch(() => props.selected, (list) => remember(list ?? []), { immediate: true, deep: true });

const selectedValues = computed<string[]>(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : [];
});
const labelOf = (value: string) => labels.get(value) ?? value;
const chips = computed(() => (props.multiple ? selectedValues.value.map((value) => ({ value, label: labelOf(value) })) : []));
const rootValue = computed(() => (props.multiple ? selectedValues.value : (selectedValues.value[0] ?? undefined)));
const displayValue = (value: unknown) => (typeof value === 'string' ? labelOf(value) : '');
/** Filtering is the server's job; showing every returned option unchanged. */
const keepAll = (items: unknown) => items as never;

// Each request gets a sequence number and an AbortController. Only the newest request may update the list, so a
// slow response to an earlier search can never overwrite the results of a later one.
let latest = 0;
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(term: string) {
  const mine = ++latest;
  controller?.abort();
  controller = new AbortController();
  status.value = 'loading';
  try {
    const result = await props.loadOptions(term, { limit: comboboxMaxLimit, signal: controller.signal });
    if (mine !== latest) return;
    options.value = result.slice(0, comboboxMaxLimit);
    remember(options.value);
    status.value = 'ready';
  } catch {
    if (mine !== latest) return;
    options.value = [];
    status.value = 'error';
  }
}

function onSearch(term: string) {
  search.value = term;
  if (!open.value) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void run(term); }, props.debounceMs);
}

function onOpenChange(next: boolean) {
  open.value = next;
  if (next) {
    clearTimeout(timer);
    void run(search.value);
  }
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
