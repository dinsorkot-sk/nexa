<script setup lang="ts">
import type { FixtureRecord } from '../../data/fixtures';

const props = withDefaults(defineProps<{
  record: FixtureRecord;
  fields: { name: string; label: string; logicalType: string }[];
  displayField: string;
  statusField?: string;
}>(), { statusField: undefined });

const title = computed(() => String(props.record[props.displayField] ?? props.record.code ?? props.record.id));
const compactFields = computed(() =>
  props.fields.filter((f) => f.name !== props.displayField && f.name !== props.statusField).slice(0, 3),
);
</script>

<template>
  <div class="group flex flex-col gap-2 rounded-lg border border-default bg-default p-3 transition-shadow hover:shadow-[--ui-shadow-sm]">
    <div class="flex items-start justify-between gap-2">
      <p class="truncate text-nexa-body-strong text-highlighted">{{ title }}</p>
      <UBadge v-if="statusField && record[statusField]" color="neutral" variant="soft" size="sm" class="shrink-0">
        {{ String(record[statusField]) }}
      </UBadge>
    </div>
    <div class="flex flex-col gap-1">
      <p v-for="f in compactFields" :key="f.name" class="flex items-center gap-2 text-nexa-small text-muted">
        <span class="shrink-0 text-dimmed">{{ f.label }}</span>
        <span class="truncate text-default">{{ record[f.name] === undefined || record[f.name] === '' ? '—' : String(record[f.name]) }}</span>
      </p>
    </div>
  </div>
</template>
