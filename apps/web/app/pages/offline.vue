<script setup lang="ts">
definePageMeta({ layout: 'default' });

const { t } = useI18n();
useHead({ title: t('errors.offlineTitle') });
</script>

<template>
  <div class="flex flex-col gap-5">
    <NxOfflineBanner />
    <NxPageHeader icon="i-lucide-wifi-off" :title="t('errors.offlineTitle')" :description="t('errors.offlineDescription')" />
    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
      <template #header>
        <div class="border-b border-default px-4 py-3">
          <h2 class="text-nexa-subheading text-highlighted">{{ t('records.table') }}</h2>
        </div>
      </template>
      <UTable :columns="[{ key: 'plateNo', label: t('fields.plateNo') }, { key: 'brand', label: t('fields.brand') }, { key: 'model', label: t('fields.model') }]" :rows="fixtureVehicleEntity().records" :ui="{ base: 'min-w-full' }" />
    </UCard>
    <div class="flex gap-2">
      <UButton color="primary" :label="t('common.save')" disabled />
      <UButton variant="outline" :label="t('common.cancel')" disabled />
    </div>
  </div>
</template>
