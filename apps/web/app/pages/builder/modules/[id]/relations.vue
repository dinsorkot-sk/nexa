<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const cardinality = ref<'oneToOne' | 'oneToMany' | 'manyToMany'>('oneToMany');

const nodes = [
  { id: 'vehicle', type: 'step', label: 'ยานพาหนะ' },
  { id: 'driver', type: 'step', label: 'คนขับ' },
  { id: 'maintenance', type: 'step', label: 'งานซ่อมบำรุง' },
  { id: 'fuel', type: 'step', label: 'บันทึกน้ำมัน' },
];
const edges = [
  { id: 'e1', source: 'driver', target: 'vehicle', guard: 'assignedDriverId' },
  { id: 'e2', source: 'vehicle', target: 'maintenance', guard: null },
  { id: 'e3', source: 'vehicle', target: 'fuel', guard: null },
];
</script>

<template>
  <div class="flex h-full min-h-0">
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between border-b border-default px-4 py-2">
        <p class="text-nexa-caption text-dimmed">{{ t('builder.relations.zoomLabel', { level: 100 }) }}</p>
        <div class="flex gap-1">
          <UButton icon="i-lucide-zoom-in" variant="ghost" size="sm" square />
          <UButton icon="i-lucide-zoom-out" variant="ghost" size="sm" square />
          <UButton icon="i-lucide-maximize" variant="ghost" size="sm" square />
        </div>
      </div>
      <div class="h-[calc(100%-41px)]">
        <NxWorkflowCanvas :nodes="nodes" :edges="edges" />
      </div>
    </div>
    <div class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-default p-4">
      <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.relations.properties') }}</p>
      <UFormField :label="t('builder.relations.name')" required>
        <UInput model-value="vehicleDrivers" />
      </UFormField>
      <UFormField :label="t('builder.relations.from')">
        <USelect model-value="vehicle" :items="[{ label: 'ยานพาหนะ', value: 'vehicle' }]" />
      </UFormField>
      <UFormField :label="t('builder.relations.to')">
        <USelect model-value="driver" :items="[{ label: 'คนขับ', value: 'driver' }]" />
      </UFormField>
      <UFormField :label="t('builder.relations.cardinality')">
        <UTabs v-model="cardinality" variant="pill" size="sm" :items="[
          { label: '1:1', value: 'oneToOne' },
          { label: '1:N', value: 'oneToMany' },
          { label: 'N:N', value: 'manyToMany' },
        ]" />
      </UFormField>
      <UFormField :label="t('builder.relations.inverseName')">
        <UInput model-value="vehicles" />
      </UFormField>
      <UCheckbox model-value="false" :label="t('builder.relations.required')" />
      <UAlert color="neutral" variant="soft" :description="t('builder.relations.cardinality409')" />
    </div>
  </div>
</template>
