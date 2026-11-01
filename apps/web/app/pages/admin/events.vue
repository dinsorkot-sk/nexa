<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const typeFilter = ref('all');
const moduleFilter = ref('all');
const recordQuery = ref('');

const rows = computed(() => fixtureEvents.filter((e) =>
  (typeFilter.value === 'all' || e.type.startsWith(typeFilter.value))
  && (moduleFilter.value === 'all' || e.module === moduleFilter.value)
  && (!recordQuery.value || e.record.toLowerCase().includes(recordQuery.value.toLowerCase())),
));
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-activity" :title="t('nav.events')" :description="t('admin.events.description')" />

    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="typeFilter" :items="[{ label: t('common.all'), value: 'all' }, { label: 'vehicle.reserved', value: 'vehicle' }, { label: 'record.created', value: 'record' }, { label: 'invitation.accepted', value: 'invitation' }, { label: 'webhook.failed', value: 'webhook' }]" class="w-48" />
      <USelect v-model="moduleFilter" :items="[{ label: t('common.all'), value: 'all' }, { label: 'vehicle', value: 'vehicle' }, { label: 'platform', value: 'platform' }]" class="w-40" />
      <UInput v-model="recordQuery" :placeholder="t('admin.events.searchRecordId')" class="w-52" clearable />
    </div>

    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="min-w-full">
        <thead>
          <tr class="border-b border-default bg-[--ui-bg-muted]">
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.time') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.events.type') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.events.module') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.events.record') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.events.actor') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.events.forwarded') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in rows" :key="e.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
            <td class="px-3 py-2 text-nexa-small text-muted">{{ formatRelativeTime(e.at) }}</td>
            <td class="px-3 py-2"><UBadge color="info" variant="soft" size="sm">{{ e.type }}</UBadge></td>
            <td class="px-3 py-2 text-nexa-body">{{ e.module }}</td>
            <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ e.record }}</td>
            <td class="px-3 py-2 text-nexa-small text-muted">{{ e.actor }}</td>
            <td class="px-3 py-2 text-nexa-small text-muted">{{ e.forwarded }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
