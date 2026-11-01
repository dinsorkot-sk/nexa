<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const org = reactive(structuredClone(fixtureOrganization));
const toast = useToast();

function save() {
  toast.add({ title: t('admin.organization.saved'), color: 'success' });
}

const quotaItems = computed(() => [
  { label: t('admin.organization.quotaMembers'), used: org.quota.members.used, limit: org.quota.members.limit },
  { label: t('admin.organization.quotaModules'), used: org.quota.modules.used, limit: org.quota.modules.limit },
  { label: t('admin.organization.quotaRecords'), used: org.quota.records.used, limit: org.quota.records.limit },
]);
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-building-2" :title="t('nav.organization')" />

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
        <template #header>
          <p class="text-nexa-subheading text-highlighted">{{ t('admin.organization.general') }}</p>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('admin.organization.logoUrl')">
            <UInput v-model="org.logoUrl" placeholder="https://…" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField :label="t('admin.organization.name')" required><UInput v-model="org.name" /></UFormField>
            <UFormField :label="t('admin.organization.slug')" required><UInput v-model="org.slug" /></UFormField>
          </div>
          <UFormField :label="t('admin.organization.defaultLanguage')">
            <USelect v-model="org.defaultLanguage" :items="[{ label: 'ไทย', value: 'th' }, { label: 'English', value: 'en' }]" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField :label="t('admin.organization.timezone')">
              <USelect v-model="org.timezone" :items="['Asia/Bangkok', 'UTC']" />
            </UFormField>
            <UFormField :label="t('admin.organization.dateFormat')">
              <USelect v-model="org.dateFormat" :items="[{ label: t('settings.calendarBuddhist'), value: 'buddhist' }, { label: t('settings.calendarGregorian'), value: 'gregorian' }]" />
            </UFormField>
          </div>
          <UFormField :label="t('admin.organization.currency')">
            <USelect v-model="org.currency" :items="['THB', 'USD']" />
          </UFormField>
          <div class="flex justify-end">
            <UButton color="primary" :label="t('common.save')" @click="save" />
          </div>
        </div>
      </UCard>

      <div class="flex flex-col gap-4">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('admin.organization.quota') }}</p>
          </template>
          <div class="flex flex-col gap-4">
            <div v-for="q in quotaItems" :key="q.label" class="flex flex-col gap-1">
              <div class="flex items-center justify-between text-nexa-small">
                <span class="text-default">{{ q.label }}</span>
                <span class="text-muted">{{ formatNumber(q.used) }} / {{ formatNumber(q.limit) }}</span>
              </div>
              <UProgress :model-value="Math.round((q.used / q.limit) * 100)" size="sm" />
            </div>
          </div>
        </UCard>

        <UAlert color="error" variant="soft" :title="t('admin.organization.dangerZone')">
          <template #actions>
            <UButton color="error" variant="outline" size="sm" :label="t('admin.organization.transferOwner')" />
            <UButton color="error" variant="solid" size="sm" :label="t('admin.organization.deleteOrg')" />
          </template>
        </UAlert>
      </div>
    </div>
  </div>
</template>
