<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import { useNxMessages } from '../lib/locale';

const props = withDefaults(defineProps<{
  modelValue: number;
  total: number;
  pageSize?: number;
  label?: string;
  disabled?: boolean;
}>(), {
  pageSize: 20,
  label: undefined,
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [page: number] }>();
const messages = useNxMessages();
const total = computed(() => (Number.isFinite(props.total) ? Math.max(0, Math.floor(props.total)) : 0));
const size = computed(() => (Number.isFinite(props.pageSize) ? Math.max(1, Math.floor(props.pageSize)) : 1));
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
const page = computed(() => Math.min(Math.max(1, Math.floor(props.modelValue)), pageCount.value));
const start = computed(() => (total.value === 0 ? 0 : (page.value - 1) * size.value + 1));
const end = computed(() => Math.min(page.value * size.value, total.value));

function go(next: number) {
  if (props.disabled || next < 1 || next > pageCount.value || next === page.value) return;
  emit('update:modelValue', next);
}
</script>

<template>
  <nav
    :aria-label="label ?? messages.pagination"
    class="flex flex-wrap items-center justify-between gap-3 text-sm"
  >
    <p class="text-ui-text-muted">
      {{ start }}–{{ end }} / {{ total }}
    </p>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :aria-label="messages.previous"
        :disabled="disabled || page <= 1"
        class="inline-flex size-9 items-center justify-center rounded-ui text-ui-text-toned outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
        @click="go(page - 1)"
      >
        <ChevronLeft
          class="size-4"
          aria-hidden="true"
        />
      </button>
      <span
        class="min-w-16 text-center tabular-nums text-ui-text-highlighted"
        aria-live="polite"
      >{{ page }} / {{ pageCount }}</span>
      <button
        type="button"
        :aria-label="messages.next"
        :disabled="disabled || page >= pageCount"
        class="inline-flex size-9 items-center justify-center rounded-ui text-ui-text-toned outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
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
