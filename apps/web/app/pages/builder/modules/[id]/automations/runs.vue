<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const search = ref('');
const page = ref(1);
const testOpen = ref(false);

const rows = computed(() => fixtureAutomationRuns.filter((r) => !search.value || r.deliveryId.includes(search.value)));
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-activity" :title="t('builder.runs.title')" :description="t('builder.runs.description')">
      <template #actions>
        <UButton color="primary" icon="i-lucide-flask-conical" :label="t('builder.runs.testRun')" @click="testOpen = true" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <NxStatCard :title="t('builder.runs.runs24h')" :value="1240" icon="i-lucide-play" />
      <NxStatCard :title="t('builder.runs.successRate')" :value="t('builder.runs.successRateValue')" trend="{ dir: 'up', text: '+0.4%' }" icon="i-lucide-check-circle-2" />
      <NxStatCard :title="t('builder.runs.failed')" :value="3" trend="{ dir: 'down', text: '-2' }" icon="i-lucide-x-circle" />
      <NxStatCard :title="t('builder.runs.pendingOutbox')" :value="7" icon="i-lucide-inbox" />
    </div>

    <div class="flex items-center gap-2">
      <UInput v-model="search" :placeholder="t('builder.runs.searchDeliveryId')" class="w-64" clearable>
        <template #leading><UIcon name="i-lucide-search" class="size-4" /></template>
      </UInput>
    </div>

    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="min-w-full">
        <thead>
          <tr class="border-b border-default bg-[--ui-bg-muted]">
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.status') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.automations.trigger') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.runs.count') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.runs.lastError') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.runs.deliveryId') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.time') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
            <td class="px-3 py-2">
              <UBadge :color="r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : 'warning'" variant="soft" size="sm">{{ r.status }}</UBadge>
            </td>
            <td class="px-3 py-2 text-nexa-body">{{ r.trigger }}</td>
            <td class="px-3 py-2 text-nexa-body">{{ r.count }}</td>
            <td class="max-w-48 truncate px-3 py-2 text-nexa-small text-error">{{ r.error || '—' }}</td>
            <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ r.deliveryId }}</td>
            <td class="px-3 py-2 text-nexa-small text-muted">{{ r.at ? formatRelativeTime(r.at) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <USlideover v-model="testOpen" :title="t('builder.runs.testRun')">
      <div class="flex flex-col gap-4 p-4">
        <UAlert color="info" variant="soft" :description="t('builder.runs.testRunHint')" />
        <div class="flex flex-col gap-2">
          <div v-for="step in [
            { label: 'trigger', ms: '2 ms' },
            { label: 'condition', ms: '1 ms' },
            { label: 'notification', ms: '120 ms' },
            { label: 'webhook', ms: '10.0 s' },
          ]" :key="step.label" class="flex items-center gap-3 rounded-lg border border-default px-3 py-2">
            <UIcon name="i-lucide-check-circle-2" class="size-4 text-success" />
            <span class="font-mono text-nexa-mono-small text-default">{{ step.label }}</span>
            <span class="ms-auto font-mono text-nexa-mono-small text-dimmed">{{ step.ms }}</span>
          </div>
        </div>
        <NxCodeBlock :code="{ automation: 'aut_1', trigger: 'workflow.transition', record: 'rec_vh1', result: 'ok' }" language="json" />
      </div>
    </USlideover>
  </div>
</template>
