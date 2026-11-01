<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const actionFilter = ref('all');
const entityFilter = ref('all');
const actorFilter = ref('');
const detail = ref<null | (typeof fixtureAudit)[number]>(null);

const rows = computed(() => fixtureAudit.filter((a) =>
  (actionFilter.value === 'all' || a.action === actionFilter.value)
  && (entityFilter.value === 'all' || a.entity.includes(entityFilter.value)),
));
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-scroll-text" :title="t('nav.audit')" :description="t('admin.audit.description')" />

    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="actionFilter" :items="[{ label: t('common.all'), value: 'all' }, { label: 'create', value: 'create' }, { label: 'update', value: 'update' }, { label: 'delete', value: 'delete' }]" class="w-40" />
      <USelect v-model="entityFilter" :items="[{ label: t('common.all'), value: 'all' }, { label: 'vehicle', value: 'vehicle' }]" class="w-40" />
      <UInput v-model="actorFilter" :placeholder="t('admin.audit.actorPlaceholder')" class="w-48" clearable />
      <span class="ms-auto text-nexa-caption text-dimmed">{{ t('admin.audit.maxPerPage') }}</span>
    </div>

    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="min-w-full">
        <thead>
          <tr class="border-b border-default bg-[--ui-bg-muted]">
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.time') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.audit.actor') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.audit.action') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.audit.target') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.id" class="cursor-pointer border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]" @click="detail = a">
            <td class="px-3 py-2 text-nexa-small text-muted">{{ formatDateTime(a.at) }}</td>
            <td class="px-3 py-2 text-nexa-body">{{ a.actor }}</td>
            <td class="px-3 py-2"><UBadge color="neutral" variant="soft" size="sm">{{ a.action }}</UBadge></td>
            <td class="px-3 py-2 text-nexa-body">{{ a.target }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <USlideover v-model="detail" :title="t('admin.audit.detailTitle')">
      <div class="flex flex-col gap-4 p-4">
        <div v-if="detail">
          <div class="flex flex-col gap-1 text-nexa-small">
            <p class="text-muted">{{ t('admin.audit.actor') }}: <span class="text-default">{{ detail.actor }}</span></p>
            <p class="text-muted">{{ t('admin.audit.action') }}: <span class="text-default">{{ detail.action }}</span></p>
            <p class="text-muted">{{ t('admin.audit.target') }}: <span class="text-default">{{ detail.target }}</span></p>
            <p class="text-muted">{{ t('detail.version') }}: <span class="font-mono">{{ detail.version }}</span></p>
          </div>
          <USeparator class="my-3" />
          <p class="mb-1 text-nexa-caption font-medium text-dimmed uppercase">{{ t('admin.audit.changes') }}</p>
          <div class="overflow-x-auto rounded-lg border border-default">
            <table class="min-w-full">
              <thead>
                <tr class="border-b border-default bg-[--ui-bg-muted]">
                  <th class="px-2 py-1.5 text-start text-nexa-caption text-muted">{{ t('common.field') }}</th>
                  <th class="px-2 py-1.5 text-start text-nexa-caption text-muted">{{ t('detail.before') }}</th>
                  <th class="px-2 py-1.5 text-start text-nexa-caption text-muted">{{ t('detail.after') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-default last:border-b-0">
                  <td class="px-2 py-1.5 font-mono text-nexa-mono-small">mileage</td>
                  <td class="px-2 py-1.5 text-nexa-small">84,200</td>
                  <td class="px-2 py-1.5 text-nexa-small">85,000</td>
                </tr>
                <tr class="border-b border-default last:border-b-0">
                  <td class="px-2 py-1.5 font-mono text-nexa-mono-small">salary</td>
                  <td class="px-2 py-1.5 text-nexa-small text-dimmed italic">{{ t('admin.audit.redacted') }}</td>
                  <td class="px-2 py-1.5 text-nexa-small text-dimmed italic">{{ t('admin.audit.redacted') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <USeparator class="my-3" />
          <NxCodeBlock :code="{ action: detail.action, entity: 'vehicle', version: '12 → 13', requestId: detail.requestId }" language="json" />
        </div>
      </div>
    </USlideover>
  </div>
</template>
