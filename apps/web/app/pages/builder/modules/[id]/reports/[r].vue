<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const vehicle = fixtureVehicleEntity();
const sourceEntity = ref('vehicle');
const measure = ref('count');
const groupBy = ref('brand');
const sortBy = ref('brand');
const limit = ref(1000);
const filters = ref('');
const previewMode = ref<'chart' | 'table'>('chart');

const measureOptions = [
  { label: t('builder.reports.count'), value: 'count' },
  { label: t('builder.reports.sum'), value: 'sum' },
  { label: t('builder.reports.avg'), value: 'avg' },
];
const groupOptions = computed(() => [
  ...vehicle.fields.slice(0, 10).map((f) => ({ label: f.label, value: f.name })),
  { label: t('builder.reports.groupRelation', { field: 'vehicle.brand' }), value: 'brand' },
]);

const chartLabels = ['Ford', 'Toyota', 'Honda', 'BYD', 'Isuzu'];
const chartValues = [96, 88, 64, 32, 28];
</script>

<template>
  <div class="flex h-full min-h-0 gap-4 overflow-y-auto p-6">
    <UCard class="w-80 shrink-0 rounded-xl" :ui="{ body: { padding: 'p-4' } }">
      <div class="flex flex-col gap-3">
        <UFormField :label="t('builder.reports.source')">
          <USelect v-model="sourceEntity" :items="[{ label: t('builder.reports.vehicle'), value: 'vehicle' }, { label: t('builder.reports.maintenance'), value: 'maintenance' }]" />
        </UFormField>
        <UFormField :label="t('builder.reports.measure')">
          <USelect v-model="measure" :items="measureOptions" />
        </UFormField>
        <UFormField :label="t('builder.reports.groupBy')">
          <USelect v-model="groupBy" :items="groupOptions" />
        </UFormField>
        <UFormField :label="t('builder.reports.sort')">
          <USelect v-model="sortBy" :items="groupOptions" />
        </UFormField>
        <UFormField :label="t('builder.reports.limit')" :hint="t('builder.reports.limitHint')">
          <UInputNumber v-model="limit" :max="1000" />
        </UFormField>
        <UFormField :label="t('builder.reports.filters')">
          <UTextarea v-model="filters" placeholder="year >= 2018" />
        </UFormField>
      </div>
    </UCard>

    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex items-center justify-between">
        <UTabs v-model="previewMode" variant="pill" size="sm" :items="[{ label: t('builder.reports.chart'), value: 'chart' }, { label: t('builder.reports.table'), value: 'table' }]" />
        <UButton color="primary" :label="t('common.save')" />
      </div>
      <div v-if="previewMode === 'chart'" class="h-80 rounded-xl border border-default bg-default p-4">
        <NxBarChart :labels="chartLabels" :values="chartValues" :title="t('builder.reports.preview')" />
      </div>
      <div v-else class="overflow-x-auto rounded-xl border border-default">
        <table class="min-w-full">
          <thead>
            <tr class="border-b border-default bg-[--ui-bg-muted]">
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ groupBy }}</th>
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ measure }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(label, i) in chartLabels" :key="label" class="border-b border-default last:border-b-0">
              <td class="px-3 py-2 text-nexa-body">{{ label }}</td>
              <td class="px-3 py-2 text-nexa-body">{{ chartValues[i] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
