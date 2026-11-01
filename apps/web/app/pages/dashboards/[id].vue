<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' });

const { t } = useI18n();
const range = ref('30d');

const brands = ['Ford', 'Toyota', 'Honda', 'BYD', 'Isuzu', 'Mitsubishi', 'MG'];
const brandValues = [96, 88, 64, 32, 28, 22, 12];
const statusLabels = ['ใช้งานอยู่', 'ว่าง', 'จองแล้ว', 'ซ่อมบำรุง', 'ปลดประจำการ'];
const statusValues = [289, 12, 5, 24, 12];

const topVehicles = computed(() => (fixtureVehicleEntity().records ?? []).slice(0, 4));
</script>

<template>
  <div class="flex flex-col gap-4">
    <NxPageHeader icon="i-lucide-layout-dashboard" :title="t('dashboard.title')" :description="t('dashboard.updated')">
      <template #actions>
        <UTabs v-model="range" variant="pill" size="sm" :items="[
          { label: t('dashboard.range7'), value: '7d' },
          { label: t('dashboard.range30'), value: '30d' },
          { label: t('dashboard.range90'), value: '90d' },
        ]" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <NxStatCard v-for="w in fixtureDashboardWidgets.filter((w) => w.kind === 'stat')" :key="w.id" :title="w.title" :value="formatNumber(w.value)" :trend="w.trend" />
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <NxChartCard :title="t('dashboard.byBrand')" :description="t('dashboard.vehicleCount')">
        <div class="h-64">
          <NxBarChart :labels="brands" :values="brandValues" :title="t('dashboard.vehicleCount')" />
        </div>
      </NxChartCard>

      <NxChartCard :title="t('dashboard.byStatus')" :description="t('dashboard.vehicleCount')">
        <div class="h-64">
          <NxDonutChart :labels="statusLabels" :values="statusValues" :title="t('dashboard.vehicleCount')" />
        </div>
      </NxChartCard>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <UCard class="rounded-xl xl:col-span-2" :ui="{ body: { padding: 'p-0' } }">
        <template #header>
          <div class="border-b border-default px-4 py-3">
            <h2 class="text-nexa-subheading text-highlighted">{{ t('dashboard.topVehicles') }}</h2>
          </div>
        </template>
        <table class="min-w-full">
          <thead>
            <tr class="border-b border-default bg-[--ui-bg-muted]">
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('fields.plateNo') }}</th>
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('fields.brand') }}</th>
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('fields.status') }}</th>
              <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('dashboard.odometer') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in topVehicles" :key="r.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
              <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ r.code }}</td>
              <td class="px-3 py-2 text-nexa-body">{{ r.brand }} {{ r.model }}</td>
              <td class="px-3 py-2">
                <UBadge color="neutral" variant="soft" size="sm">{{ r.status }}</UBadge>
              </td>
              <td class="px-3 py-2 text-nexa-body">{{ formatNumber(85000) }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <UCard class="flex flex-col items-center justify-center gap-3 rounded-xl p-8 text-center" :ui="{ body: { padding: 'p-8' } }">
        <span class="inline-flex size-10 items-center justify-center rounded-lg bg-[--ui-bg-accented] text-muted">
          <UIcon name="i-lucide-lock" class="size-5" />
        </span>
        <p class="text-nexa-subheading text-highlighted">{{ t('dashboard.noPermissionTitle') }}</p>
        <p class="max-w-xs text-nexa-body text-muted">{{ t('dashboard.noPermissionHint') }}</p>
      </UCard>
    </div>
  </div>
</template>
