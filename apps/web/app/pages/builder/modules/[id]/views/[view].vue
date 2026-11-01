<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const vehicle = fixtureVehicleEntity();
const viewTypes = ['table', 'kanban', 'calendar', 'gallery', 'detail'];
const viewType = ref('table');
const selectedColumns = ref(vehicle.fields.slice(0, 6).map((f) => f.name));
const sortBy = ref('plateNo');
const perPage = ref(20);
const density = ref('default');

const columnOptions = computed(() => vehicle.fields.map((f) => ({ label: f.label, value: f.name })));
</script>

<template>
  <div class="flex h-full min-h-0 gap-4 overflow-y-auto p-6">
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge v-for="vt in viewTypes" :key="vt" :color="vt === viewType ? 'primary' : 'neutral'" :variant="vt === viewType ? 'soft' : 'outline'" size="sm" class="cursor-pointer" @click="viewType = vt">
          {{ t(`records.views.${vt}`) }}
        </UBadge>
      </div>
      <div class="flex-1 rounded-xl border border-default bg-default p-4">
        <div class="flex flex-col gap-2">
          <div class="grid gap-1" :class="density === 'compact' ? 'gap-0' : 'gap-1'">
            <div v-for="f in vehicle.fields.filter((x) => selectedColumns.includes(x.name))" :key="f.id" class="flex items-center gap-2 rounded-md border border-default px-3 py-2">
              <span class="text-nexa-body-medium text-highlighted">{{ f.label }}</span>
              <span class="font-mono text-nexa-mono-small text-dimmed">{{ f.name }}</span>
              <UBadge color="neutral" variant="soft" size="sm" class="ms-auto">{{ f.logicalType }}</UBadge>
            </div>
          </div>
        </div>
      </div>
      <p class="text-nexa-caption text-dimmed">{{ t('builder.views.livePreview') }}</p>
    </div>

    <div class="flex w-72 shrink-0 flex-col gap-3">
      <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.designer.properties') }}</p>
      <UFormField :label="t('builder.views.type')">
        <USelect v-model="viewType" :items="viewTypes.map((vt) => ({ label: t(`records.views.${vt}`), value: vt }))" />
      </UFormField>
      <UFormField :label="t('builder.views.columns')">
        <USelectMenu v-model="selectedColumns" :items="columnOptions" multiple />
      </UFormField>
      <UFormField :label="t('builder.views.sortBy')">
        <USelect v-model="sortBy" :items="vehicle.fields.slice(0, 8).map((f) => ({ label: f.label, value: f.name }))" />
      </UFormField>
      <UFormField :label="t('builder.views.perPage')">
        <UInputNumber v-model="perPage" :min="5" :max="200" />
      </UFormField>
      <UFormField :label="t('builder.views.density')">
        <USelect v-model="density" :items="[{ label: t('builder.views.densityDefault'), value: 'default' }, { label: t('builder.views.densityCompact'), value: 'compact' }]" />
      </UFormField>
    </div>
  </div>
</template>
