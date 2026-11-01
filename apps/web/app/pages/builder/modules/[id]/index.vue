<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const route = useRoute();
const { t } = useI18n();
const moduleId = computed(() => route.params.id as string);

const lifecycle = ['draft', 'review', 'published', 'enabled'];
const current = ref('enabled');
const lifecycleOpen = ref(false);
const toast = useToast();

const lifecycleActions = computed(() => [
  { label: t('builder.lifecycle.toReview'), icon: 'i-lucide-send', disabled: current.value !== 'draft', reason: t('builder.lifecycle.reason.published') },
  { label: t('builder.lifecycle.publish'), icon: 'i-lucide-upload-cloud', disabled: current.value !== 'review', reason: t('builder.lifecycle.reason.review') },
  { label: t('builder.lifecycle.enable'), icon: 'i-lucide-power', disabled: current.value !== 'published', reason: t('builder.lifecycle.reason.publish') },
  { label: t('builder.lifecycle.disable'), icon: 'i-lucide-power-off', disabled: current.value !== 'enabled', reason: '' },
  { label: t('builder.lifecycle.archive'), icon: 'i-lucide-archive', disabled: false, reason: '' },
]);

const readiness = [
  { label: t('builder.readiness.fields'), state: 'pass' as const },
  { label: t('builder.readiness.formula'), state: 'pass' as const },
  { label: t('builder.readiness.workflow'), state: 'warn' as const },
  { label: t('builder.readiness.automation'), state: 'pass' as const },
];

const statCards = [
  { title: t('builder.overview.entities'), value: 4, icon: 'i-lucide-table-2' },
  { title: t('builder.overview.fields'), value: 61, icon: 'i-lucide-list' },
  { title: t('builder.overview.records'), value: 1083, icon: 'i-lucide-database' },
  { title: t('builder.overview.automations'), value: 1, icon: 'i-lucide-zap', tone: 'error' as const },
];
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-y-auto p-6">
    <UAlert v-if="current === 'enabled'" color="info" variant="soft" :title="t('builder.overview.enabledBannerTitle')" :description="t('builder.overview.enabledBannerHint', { version: '1.3.0' })" />

    <NxPageHeader icon="i-lucide-truck" :title="t('home.moduleVehicle')" :description="`v1.2.0 · ${t('builder.overview.userModule')}`">
      <template #actions>
        <UDropdownMenu v-model:open="lifecycleOpen" :items="[lifecycleActions.map((a) => ({ label: a.label, icon: a.icon, disabled: a.disabled, onSelect: () => { current = 'draft'; toast.add({ title: t('builder.overview.sentToReview'), color: 'success' }); } }))]">
          <UButton icon="i-lucide-chevrons-up-down" variant="outline" :label="t(`builder.status.${current}`)" />
        </UDropdownMenu>
      </template>
    </NxPageHeader>

    <!-- lifecycle bar -->
    <div class="flex items-center gap-1">
      <template v-for="(s, i) in lifecycle" :key="s">
        <UBadge :color="s === current ? 'primary' : 'neutral'" :variant="s === current ? 'solid' : 'soft'" size="md">
          {{ t(`builder.status.${s}`) }}
        </UBadge>
        <UIcon v-if="i < lifecycle.length - 1" name="i-lucide-chevron-right" class="size-4 text-dimmed" />
      </template>
      <UBadge color="neutral" variant="outline" size="md" class="ms-2">{{ t('builder.status.archived') }}</UBadge>
    </div>

    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <NxStatCard v-for="s in statCards" :key="s.title" :title="s.title" :value="formatNumber(s.value)" :icon="s.icon" :trend="s.tone === 'error' ? { dir: 'none', text: '1 failing' } : undefined" />
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
        <template #header>
          <div class="border-b border-default px-4 py-3">
            <h2 class="text-nexa-subheading text-highlighted">{{ t('builder.overview.entities') }}</h2>
          </div>
        </template>
        <UTable :columns="[{ key: 'name', label: t('builder.overview.entityName') }, { key: 'fields', label: t('builder.overview.fieldCount') }, { key: 'records', label: t('common.records') }]" :rows="[
          { name: 'ยานพาหนะ', fields: 24, records: 342 },
          { name: 'คนขับ', fields: 12, records: 24 },
          { name: 'งานซ่อมบำรุง', fields: 14, records: 128 },
          { name: 'บันทึกน้ำมัน', fields: 11, records: 611 },
        ]" :ui="{ base: 'min-w-full' }" />
      </UCard>

      <div class="flex flex-col gap-4">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('builder.overview.readiness', { version: '1.3.0' }) }}</p>
          </template>
          <div class="flex flex-col gap-2">
            <div v-for="r in readiness" :key="r.label" class="flex items-center gap-2">
              <UIcon :name="r.state === 'pass' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-triangle'" :class="r.state === 'pass' ? 'text-success' : 'text-warning'" />
              <span class="text-nexa-body text-default">{{ r.label }}</span>
            </div>
          </div>
        </UCard>
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
          <template #header>
            <div class="border-b border-default px-4 py-3">
              <h2 class="text-nexa-subheading text-highlighted">{{ t('builder.overview.activity') }}</h2>
            </div>
          </template>
          <UTimeline :items="fixtureActivity.map((a) => ({ icon: 'i-lucide-circle', color: 'neutral', title: a.summary, description: `${a.user} · ${formatRelativeTime(a.at)}` }))" class="p-4" />
        </UCard>
      </div>
    </div>
  </div>
</template>
