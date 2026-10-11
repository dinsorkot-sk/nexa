<template>
  <nav
    :class="cn('flex items-center justify-between gap-3', props.class)"
    :aria-label="t('pagination.label')"
  >
    <p
      :id="`${navId}-range`"
      class="text-sm text-foreground-muted"
      aria-live="polite"
    >
      {{ rangeText }}
    </p>
    <div class="flex items-center gap-1">
      <label
        :for="`${navId}-limit`"
        class="sr-only"
      >{{ t('pagination.perPage') }}</label>
      <select
        :id="`${navId}-limit`"
        :value="limit"
        class="h-8 rounded border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :disabled="disabled"
        @change="onLimitChange"
      >
        <option
          v-for="option in limitOptions"
          :key="option"
          :value="option"
        >
          {{ t('pagination.perPageOption', { n: option }) }}
        </option>
      </select>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="disabled || !hasPrev"
        :aria-label="t('pagination.prev')"
        @click="emit('update:offset', offset - limit)"
      >
        <span aria-hidden="true">‹</span>
      </UiButton>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="disabled || !hasNext"
        :aria-label="t('pagination.next')"
        @click="emit('update:offset', offset + limit)"
      >
        <span aria-hidden="true">›</span>
      </UiButton>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '../cn';
import UiButton from './UiButton.vue';

/**
 * Server-side pagination controls over the records API contract: `limit` 1–100 and `offset` ≥ 0
 * come straight from the loaded page; the component only emits the next offset and limit. The
 * API caps limit at 100, so larger page sizes are not offered here.
 */
const props = withDefaults(defineProps<{
  total: number;
  limit: number;
  offset: number;
  disabled?: boolean;
  class?: string;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:offset': [offset: number];
  'update:limit': [limit: number];
}>();

const { t, locale } = useI18n();
const navId = useId();

const limitOptions = [25, 50, 100] as const;

const page = computed(() => (props.limit > 0 ? Math.floor(props.offset / props.limit) + 1 : 1));
const pageCount = computed(() => (props.limit > 0 ? Math.max(Math.ceil(props.total / props.limit), 1) : 1));
const hasPrev = computed(() => props.offset > 0);
const hasNext = computed(() => props.offset + props.limit < props.total);

const rangeText = computed(() => {
  const numberFormat = new Intl.NumberFormat(locale.value === 'th' ? 'th-TH' : 'en-US');
  if (props.total === 0) return t('pagination.empty');
  const from = props.offset + 1;
  const to = Math.min(props.offset + props.limit, props.total);
  return t('pagination.range', {
    from: numberFormat.format(from),
    to: numberFormat.format(to),
    total: numberFormat.format(props.total),
    page: numberFormat.format(page.value),
    pages: numberFormat.format(pageCount.value),
  });
});

function onLimitChange(event: Event): void {
  const next = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(next) && next > 0) emit('update:limit', next);
}
</script>
