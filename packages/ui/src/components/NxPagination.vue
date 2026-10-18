<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxPageButton from './NxPageButton.vue';

/** The mockup's Pagination section: a summary, page buttons with an ellipsis, and the two arrow buttons. */
export type PaginationSize = 'sm' | 'md';

const props = withDefaults(defineProps<{
  modelValue: number;
  total: number;
  pageSize?: number;
  label?: string;
  size?: PaginationSize;
  disabled?: boolean;
}>(), {
  pageSize: 20,
  label: undefined,
  size: 'md',
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [page: number] }>();
const messages = useNxMessages();
const total = computed(() => (Number.isFinite(props.total) ? Math.max(0, Math.floor(props.total)) : 0));
const perPage = computed(() => (Number.isFinite(props.pageSize) ? Math.max(1, Math.floor(props.pageSize)) : 1));
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)));
const page = computed(() => Math.min(Math.max(1, Math.floor(props.modelValue)), pageCount.value));
const start = computed(() => (total.value === 0 ? 0 : (page.value - 1) * perPage.value + 1));
const end = computed(() => Math.min(page.value * perPage.value, total.value));

/**
 * Page numbers to show: the first and last page, the current page and its neighbours, with the gaps collapsed
 * into an ellipsis. A short list shows every page.
 */
const pages = computed(() => {
  const count = pageCount.value;
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const wanted = new Set<number>([1, count]);
  for (let item = Math.max(2, page.value - 1); item <= Math.min(count - 1, page.value + 1); item += 1) wanted.add(item);
  const out: Array<number | 'gap'> = [];
  let previous = 0;
  for (const item of [...wanted].sort((a, b) => a - b)) {
    if (item - previous === 2) out.push(previous + 1);
    else if (item - previous > 2) out.push('gap');
    out.push(item);
    previous = item;
  }
  return out;
});

const arrow = computed(() => (props.size === 'sm' ? 'size-7' : 'size-9'));

function go(next: number) {
  if (props.disabled || next < 1 || next > pageCount.value || next === page.value) return;
  emit('update:modelValue', next);
}
</script>

<template>
  <nav
    :aria-label="label ?? messages.pagination"
    class="flex flex-wrap items-center justify-between gap-3 border-t border-ui-border py-2.5 pr-3 pl-3 text-sm"
  >
    <p class="text-xs text-ui-text-muted">
      {{ messages.range(start, end, total) }}
    </p>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :aria-label="messages.previous"
        :disabled="disabled || page <= 1"
        :class="[
          'inline-flex items-center justify-center rounded-ui text-ui-text-toned outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
          arrow,
        ]"
        @click="go(page - 1)"
      >
        <ChevronLeft
          class="size-4"
          aria-hidden="true"
        />
      </button>
      <template
        v-for="(item, index) in pages"
        :key="`${item}-${index}`"
      >
        <span
          v-if="item === 'gap'"
          aria-hidden="true"
          class="px-1 text-ui-text-muted"
        >…</span>
        <NxPageButton
          v-else
          :page="item"
          :size="size"
          :current="item === page"
          :disabled="disabled"
          @click="go"
        />
      </template>
      <button
        type="button"
        :aria-label="messages.next"
        :disabled="disabled || page >= pageCount"
        :class="[
          'inline-flex items-center justify-center rounded-ui text-ui-text-toned outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
          arrow,
        ]"
        @click="go(page + 1)"
      >
        <ChevronRight
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>
  </nav>
</template>
