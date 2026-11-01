<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();

const outboxLabels = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00'];
const delivered = [4, 6, 3, 5, 8, 12, 18, 24, 31, 28, 19, 12];
const failed = [0, 1, 0, 0, 2, 1, 0, 1, 0, 2, 1, 0];
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-cog" :title="t('nav.operations')" :description="t('admin.operations.description')" />

    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <NxStatCard :title="t('admin.operations.modules')" :value="6" icon="i-lucide-box" />
      <NxStatCard :title="t('admin.operations.recordsToday')" :value="1284" trend="{ dir: 'up', text: '+12%' }" icon="i-lucide-database" />
      <NxStatCard :title="t('admin.operations.auditEvents')" :value="3421" icon="i-lucide-scroll-text" />
      <NxStatCard :title="t('admin.operations.failedAutomations')" :value="3" trend="{ dir: 'up', text: '+3' }" icon="i-lucide-zap" />
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <NxChartCard :title="t('admin.operations.outbox')" :description="t('admin.operations.outboxHint')">
        <div class="h-64">
          <NxBarChart :labels="outboxLabels" :values="delivered" :title="t('admin.operations.delivered')" />
        </div>
        <template #footer>
          <p class="text-nexa-caption text-dimmed">{{ t('admin.operations.failedLabel') }}: {{ failed.join(', ') }}</p>
        </template>
      </NxChartCard>

      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
        <template #header>
          <div class="border-b border-default px-4 py-3">
            <h2 class="text-nexa-subheading text-highlighted">{{ t('admin.operations.recentEvents') }}</h2>
          </div>
        </template>
        <UTimeline :items="fixtureEvents.slice(0, 4).map((e) => ({ icon: 'i-lucide-circle', color: e.type.includes('failed') ? 'error' : 'neutral', title: e.type, description: `${e.module} · ${e.record} · ${formatRelativeTime(e.at)}` }))" />
      </UCard>
    </div>
  </div>
</template>
