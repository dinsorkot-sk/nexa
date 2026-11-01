<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' });

const route = useRoute();
const { t } = useI18n();
const { entity, modules, recordLabel } = useMetadata();
const toast = useToast();

const moduleKey = route.params.module as string;
const entityName = route.params.entity as string;
const recordId = route.params.id as string;

const meta = computed(() => entity(moduleKey, entityName));
const record = computed(() => meta.value?.records.find((r) => r.id === recordId));

const tab = computed({
  get: () => (route.query.tab as string) ?? 'fields',
  set: (v) => navigateTo({ query: { ...route.query, tab: v } }, { replace: true }),
});

const moduleName = computed(() => modules.value.find((m) => m.key === moduleKey)?.name ?? moduleKey);
const statusField = computed(() => meta.value?.fields.find((f) => f.name === 'status'));
const statusOption = computed(() => statusField.value?.options?.find((o) => o.value === record.value?.status));

const transitionOpen = ref(false);
const conflict = computed(() => route.query.conflict === '1');
const conflictOpen = computed(() => conflict.value && record.value !== undefined);
const targetStatus = ref('');
const comment = ref('');
const transitionError = ref('');

const allowedTransitions = computed(() => fixtureWorkflow.transitions.filter((tr) => tr.from === record.value?.status));

const transitionMeta = computed(() => {
  const tr = allowedTransitions.value.find((x) => x.to === targetStatus.value);
  return tr ?? null;
});

const guardBlocked = computed(() => {
  const tr = transitionMeta.value;
  if (!tr?.guard) return false;
  if (tr.guard.includes('assignedDriverId')) return !record.value?.assignedDriverId;
  return false;
});

function confirmTransition() {
  if (guardBlocked.value) {
    transitionError.value = t('detail.guardFailed', { reason: transitionMeta.value?.guardReason ?? '' });
    return;
  }
  transitionOpen.value = false;
  toast.add({ title: t('detail.transitionToast', { from: statusOption.value?.label ?? '', to: targetStatus.value }), color: 'success' });
}

const related = computed(() => {
  if (entityName === 'vehicle') {
    return [
      { entity: 'maintenance', label: t('detail.related.maintenance'), records: fixtureMaintenanceEntity().records.filter((r) => r.vehicleId === recordId) },
      { entity: 'fuel', label: t('detail.related.fuel'), records: fixtureFuelEntity().records.filter((r) => r.vehicleId === recordId) },
    ];
  }
  return [];
});

const conflictFields = computed(() => (meta.value?.fields ?? []).filter((f) => ['plateNo', 'brand', 'year'].includes(f.name)).slice(0, 3));
const conflictChoice = ref<Record<string, 'mine' | 'server'>>({});

function resolveConflict() {
  toast.add({ title: t('detail.conflictResolved'), color: 'success' });
  navigateTo({ query: {} }, { replace: true });
}

const activityKindIcon: Record<string, string> = {
  transition: 'i-lucide-arrow-right-left',
  update: 'i-lucide-pencil',
  automation: 'i-lucide-zap',
  comment: 'i-lucide-message-square',
};
const activityKindColor: Record<string, string> = {
  transition: 'info',
  update: 'neutral',
  automation: 'secondary',
  comment: 'primary',
};
</script>

<template>
  <div v-if="!meta || !record" class="flex flex-col gap-3">
    <NxErrorScreen status="404" :title="t('errors.notFoundTitle')" :description="t('errors.notFoundHint')" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <NxPageHeader :icon="modules.find((m) => m.key === moduleKey)?.icon ?? 'i-lucide-box'" :title="String(record[meta.displayField] ?? record.id)">
      <template #actions>
        <UButton variant="outline" icon="i-lucide-pencil" :label="t('common.edit')" :to="`/m/${moduleKey}/${entityName}/${recordId}/edit`" />
        <UButton v-if="allowedTransitions.length" color="primary" icon="i-lucide-arrow-right-left" :label="t('detail.transition')" @click="transitionOpen = true" />
      </template>
    </NxPageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <UBadge v-if="statusOption" :color="(statusOption.color as 'primary') ?? 'neutral'" variant="soft" size="md">{{ statusOption.label }}</UBadge>
      <span class="font-mono text-nexa-mono text-muted">{{ record.code ?? recordId }}</span>
      <span class="text-nexa-small text-dimmed">
        {{ t('detail.updatedBy', { user: 'Somchai J.', version: record.version }) }} · {{ formatRelativeTime(record.updatedAt) }}
      </span>
    </div>

    <UTabs v-model="tab" variant="underline" size="md" :items="[
      { label: t('detail.tabs.fields'), value: 'fields' },
      { label: t('detail.tabs.related'), value: 'related' },
      { label: t('detail.tabs.activity'), value: 'activity' },
    ]" />

    <!-- fields -->
    <div v-if="tab === 'fields'" class="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
      <div v-for="f in meta.fields" :key="f.id" class="flex flex-col gap-1 border-b border-default pb-3">
        <p class="text-nexa-small text-muted">{{ f.label }}</p>
        <div class="flex items-center gap-2">
          <NxFieldValue :field="f" :value="record[f.name]" view="detail" :module-key="moduleKey" />
          <UIcon v-if="f.logicalType === 'formula' || f.logicalType === 'computed'" name="i-lucide-function-square" class="size-4 shrink-0 text-muted" />
        </div>
        <p v-if="f.formula" class="font-mono text-nexa-mono-small text-dimmed">ƒx {{ f.formula }}</p>
      </div>
    </div>

    <!-- related -->
    <div v-else-if="tab === 'related'" class="flex flex-col gap-4">
      <div v-for="rel in related" :key="rel.entity" class="flex flex-col gap-2">
        <h2 class="text-nexa-subheading text-highlighted">{{ rel.label }}</h2>
        <p class="text-nexa-small text-muted">{{ t('detail.cardinalityNote') }}</p>
        <div class="overflow-x-auto rounded-xl border border-default">
          <table class="min-w-full">
            <thead>
              <tr class="border-b border-default bg-[--ui-bg-muted]">
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.code') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.type') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.status') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.cost') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rel.records" :key="r.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
                <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ r.code }}</td>
                <td class="px-3 py-2 text-nexa-body">{{ r.type ?? '—' }}</td>
                <td class="px-3 py-2 text-nexa-body">{{ r.status ?? '—' }}</td>
                <td class="px-3 py-2 text-nexa-body">{{ r.cost ? formatCurrency(r.cost as number) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-nexa-caption text-dimmed">{{ t('detail.cardinality409') }}</p>
      </div>
    </div>

    <!-- activity -->
    <div v-else-if="tab === 'activity'" class="max-w-2xl">
      <UTimeline :items="fixtureActivity.map((a) => ({
        icon: activityKindIcon[a.kind] ?? 'i-lucide-circle',
        color: activityKindColor[a.kind] ?? 'neutral',
        title: a.summary,
        description: `${a.user} · ${formatRelativeTime(a.at)}`,
      }))" />
      <UAlert color="neutral" variant="subtle" :description="t('detail.hiddenFieldNote')" class="mt-4" />
    </div>

    <!-- transition modal -->
    <UModal v-model="transitionOpen" :title="t('detail.transitionModalTitle')" :ui="{ content: 'max-w-md' }">
      <div class="flex flex-col gap-4">
        <p class="text-nexa-body text-muted">
          {{ t('detail.transitionModalHint', { from: statusOption?.label ?? record.status ?? '', to: targetStatus }) }}
        </p>
        <UFormField :label="t('detail.targetStatus')" required>
          <USelect v-model="targetStatus" :items="allowedTransitions.map((tr) => ({ label: tr.to, value: tr.to }))" class="w-full" />
        </UFormField>
        <div v-if="transitionMeta" class="flex flex-col gap-2 rounded-lg border border-default bg-[--ui-bg-muted] p-3">
          <p class="text-nexa-small text-muted">{{ t('detail.guardLabel') }}: {{ transitionMeta.guard ?? t('common.none') }}</p>
          <p v-if="guardBlocked" class="flex items-center gap-1.5 text-nexa-small text-error">
            <UIcon name="i-lucide-circle-alert" class="size-4" />
            {{ t('detail.guardFailed', { reason: transitionMeta.guardReason ?? '' }) }}
          </p>
          <p class="text-nexa-small text-muted">{{ t('detail.actionsLabel') }}: {{ transitionMeta.actions.join(', ') }}</p>
          <p class="text-nexa-caption text-dimmed">{{ t('detail.afterCommit') }}</p>
        </div>
        <UFormField :label="t('detail.comment')">
          <UTextarea v-model="comment" :placeholder="t('detail.commentOptional')" />
        </UFormField>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" @click="transitionOpen = false" />
          <UButton color="primary" :label="t('common.confirm')" :disabled="!targetStatus" @click="confirmTransition" />
        </div>
      </template>
    </UModal>

    <!-- conflict 409 modal -->
    <UModal v-model="conflictOpen" :title="t('detail.conflictTitle')" :ui="{ content: 'max-w-lg' }">
      <div class="flex flex-col gap-4">
        <p class="text-nexa-body text-muted">{{ t('detail.conflictHint', { serverVersion: (record.version ?? 0) + 1, version: record.version ?? 0 }) }}</p>
        <div class="overflow-x-auto rounded-xl border border-default">
          <table class="min-w-full">
            <thead>
              <tr class="border-b border-default bg-[--ui-bg-muted]">
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.field') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('detail.yours') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('detail.serverLatest') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in conflictFields" :key="f.name" class="border-b border-default last:border-b-0">
                <td class="px-3 py-2 text-nexa-body-medium">{{ f.label }}</td>
                <td class="px-3 py-2">
                  <label class="flex items-center gap-2 text-nexa-body">
                    <URadio v-model="conflictChoice[f.name]" value="mine" />
                    {{ String(record[f.name] ?? '—') }}
                  </label>
                </td>
                <td class="px-3 py-2">
                  <label class="flex items-center gap-2 text-nexa-body">
                    <URadio v-model="conflictChoice[f.name]" value="server" />
                    {{ f.name === 'year' ? 2019 : `${String(record[f.name] ?? '')} ${t('detail.serverSuffix')}` }}
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" @click="navigateTo({ query: {} })" />
          <UButton color="primary" :label="t('common.confirm')" :disabled="Object.keys(conflictChoice).length < conflictFields.length" @click="resolveConflict" />
        </div>
      </template>
    </UModal>
  </div>
</template>
