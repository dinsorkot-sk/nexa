<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const boundField = ref('status');
const vehicleStatusFieldOptions = computed(() =>
  (fixtureVehicleEntity().fields.find((f) => f.name === 'status')?.options ?? []).map((o) => ({ label: o.label, value: o.value })),
);

const transitionRows = fixtureWorkflow.transitions.map((tr) => ({
  from: tr.from,
  to: tr.to,
  roles: tr.roles.join(', '),
  guard: tr.guard ?? '—',
  actions: tr.actions.length,
}));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
    <NxPageHeader icon="i-lucide-git-branch" :title="fixtureWorkflow.name" :description="t('builder.workflow.boundTo')">
      <template #actions>
        <UBadge color="info" variant="soft" size="md">{{ t('builder.workflow.forwardOnly') }}</UBadge>
        <USelect v-model="boundField" :items="vehicleStatusFieldOptions" class="w-48" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div class="h-80 rounded-xl border border-default xl:col-span-2">
        <NxWorkflowCanvas :nodes="[
          { id: 'start', type: 'start', label: 'เริ่มต้น' },
          ...fixtureWorkflow.states.map((s) => ({ id: s, type: 'step', label: s, count: fixtureWorkflow.transitions.filter((tr) => tr.to === s).length })),
          { id: 'end', type: 'end', label: 'สิ้นสุด' },
        ]" :edges="fixtureWorkflow.transitions.map((tr, i) => ({ id: `e${i}`, source: tr.from, target: tr.to, guard: tr.guard, guardReason: tr.guardReason }))" />
      </div>

      <div class="flex flex-col gap-3">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('builder.workflow.transitionPanel') }}</p>
          </template>
          <div class="flex flex-col gap-2">
            <UFormField :label="t('builder.workflow.buttonLabel')">
              <UInput :model-value="t('builder.workflow.buttonLabelExample')" />
            </UFormField>
            <UFormField :label="t('builder.workflow.roles')">
              <USelectMenu model-value="['admin', 'member']" :items="['owner', 'admin', 'member', 'viewer']" multiple />
            </UFormField>
            <UFormField :label="t('builder.workflow.guard')">
              <UInput model-value="{assignedDriverId} != null" class="font-mono" />
            </UFormField>
            <UAlert v-if="true" color="warning" variant="soft" :description="t('builder.workflow.guardReason', { reason: 'Assign a driver first' })" />
          </div>
        </UCard>
      </div>
    </div>

    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="min-w-full">
        <thead>
          <tr class="border-b border-default bg-[--ui-bg-muted]">
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.workflow.from') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.workflow.to') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.workflow.roles') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.workflow.guard') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('builder.workflow.actionCount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in transitionRows" :key="`${row.from}-${row.to}`" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
            <td class="px-3 py-2 text-nexa-body">{{ row.from }}</td>
            <td class="px-3 py-2 text-nexa-body">
              <span class="inline-flex items-center gap-1">{{ row.from }} <UIcon name="i-lucide-arrow-right" class="size-3 text-dimmed" /> {{ row.to }}</span>
            </td>
            <td class="px-3 py-2 text-nexa-body text-muted">{{ row.roles }}</td>
            <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ row.guard }}</td>
            <td class="px-3 py-2 text-nexa-body">{{ row.actions }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
