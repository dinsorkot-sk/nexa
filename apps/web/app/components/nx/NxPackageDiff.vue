<script setup lang="ts">
export interface PackageDiffRow {
  kind: 'added' | 'changed' | 'removed';
  path: string;
  detail?: string;
}

withDefaults(defineProps<{ rows: PackageDiffRow[] }>(), { rows: () => [] });

const { t } = useI18n();

const kindMeta = {
  added: { icon: 'i-lucide-plus', color: 'success' as const, label: t('builder.diff.added') },
  changed: { icon: 'i-lucide-pencil', color: 'warning' as const, label: t('builder.diff.changed') },
  removed: { icon: 'i-lucide-trash-2', color: 'error' as const, label: t('builder.diff.removed') },
};
</script>

<template>
  <UAlert color="warning" variant="soft" :description="t('builder.diff.removeWarning')" class="mb-3" />
  <div class="flex flex-col rounded-xl border border-default">
    <div
      v-for="row in rows"
      :key="row.path"
      class="flex items-center gap-3 border-b border-default px-3 py-2 last:border-b-0"
    >
      <UBadge :color="kindMeta[row.kind].color" variant="soft" size="sm" class="w-20 justify-center">
        <template #leading>
          <UIcon :name="kindMeta[row.kind].icon" class="size-3" />
        </template>
        {{ kindMeta[row.kind].label }}
      </UBadge>
      <span class="min-w-0 flex-1 truncate font-mono text-nexa-mono-small text-default">{{ row.path }}</span>
      <span v-if="row.detail" class="shrink-0 text-nexa-caption text-dimmed">{{ row.detail }}</span>
    </div>
  </div>
</template>
