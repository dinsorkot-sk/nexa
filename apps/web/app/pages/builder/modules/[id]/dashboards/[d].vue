<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const cols = 12;
const widgets = ref([
  { id: 'w1', title: 'ยานพาหนะทั้งหมด', type: 'stat', x: 0, y: 0, w: 3, h: 2 },
  { id: 'w2', title: 'ตามยี่ห้อ', type: 'bar', x: 3, y: 0, w: 5, h: 4 },
  { id: 'w3', title: 'ตามสถานะ', type: 'donut', x: 8, y: 0, w: 4, h: 4 },
  { id: 'w4', title: 'ซ่อมบำรุง', type: 'stat', x: 0, y: 2, w: 3, h: 2 },
]);

const availableReports = [{ label: 'จำนวนยานพาหนะตามยี่ห้อ', value: 'rep_brand' }, { label: 'ค่าซ่อมบำรุงรวม', value: 'rep_cost' }];

function onDrop(event: { added?: { element: { newIndex: number } } }) {
  if (event.added) toast.add({ title: t('builder.dashBuilder.widgetAdded'), color: 'success' });
}
const toast = useToast();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
    <NxPageHeader icon="i-lucide-layout-dashboard" :title="t('builder.dashBuilder.title')" :description="t('builder.dashBuilder.description')">
      <template #actions>
        <UBadge color="info" variant="soft" size="md">{{ t('builder.dashBuilder.grid12') }}</UBadge>
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-12 gap-3">
      <div
        v-for="w in widgets" :key="w.id"
        class="rounded-xl border border-default bg-default"
        :class="`col-span-${w.w} row-span-${w.h}`"
      >
        <div class="flex items-center justify-between border-b border-default px-3 py-2">
          <p class="text-nexa-body-medium text-highlighted">{{ w.title }}</p>
          <UIcon name="i-lucide-grip-vertical" class="size-4 text-dimmed" />
        </div>
        <div class="flex h-full min-h-24 items-center justify-center p-3">
          <NxStatCard v-if="w.type === 'stat'" :title="w.title" :value="342" />
          <div v-else class="flex h-full w-full items-center justify-center text-nexa-caption text-dimmed">{{ w.type }}</div>
        </div>
      </div>
      <div class="col-span-12 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-default text-nexa-body text-dimmed xl:col-span-4">
        {{ t('builder.dashBuilder.dropHint') }}
      </div>
    </div>

    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
      <template #header>
        <p class="text-nexa-subheading text-highlighted">{{ t('builder.dashBuilder.widgetSettings') }}</p>
      </template>
      <div class="grid grid-cols-2 gap-3">
        <UFormField :label="t('builder.dashBuilder.name')"><UInput model-value="ตามยี่ห้อ" /></UFormField>
        <UFormField :label="t('builder.dashBuilder.report')">
          <USelect :items="availableReports" model-value="rep_brand" />
        </UFormField>
        <UFormField :label="t('builder.dashBuilder.display')">
          <USelect :items="['bar', 'line', 'donut', 'table']" model-value="bar" />
        </UFormField>
        <UFormField :label="t('builder.dashBuilder.width')">
          <UInputNumber :model-value="5" :min="1" :max="12" />
        </UFormField>
        <UFormField :label="t('builder.dashBuilder.height')">
          <UInputNumber :model-value="4" :min="1" :max="8" />
        </UFormField>
        <UCheckbox :model-value="true" :label="t('builder.dashBuilder.followRange')" />
      </div>
      <UAlert color="info" variant="soft" :description="t('builder.dashBuilder.permissionHint')" class="mt-2" />
    </UCard>
  </div>
</template>
