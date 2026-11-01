<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const importJson = ref('');
const toast = useToast();

function importPackage() {
  if (!importJson.value.trim()) return;
  toast.add({ title: t('builder.versions.importedToast'), color: 'success' });
  importJson.value = '';
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-package" :title="t('nav.packages')" :description="t('builder.versions.description')">
      <template #actions>
        <UButton color="primary" icon="i-lucide-upload" :label="t('builder.versions.import')" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div class="flex flex-col gap-2">
        <UCard v-for="v in fixtureVersions" :key="v.version" class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <div class="flex items-center justify-between gap-2">
            <p class="font-mono text-nexa-body-strong text-highlighted">{{ v.version }}</p>
            <UBadge :color="v.version === 'working copy' ? 'warning' : 'success'" variant="soft" size="sm">{{ t(`builder.versions.${v.version === 'working copy' ? 'workingCopy' : 'published'}`) }}</UBadge>
          </div>
          <p class="text-nexa-small text-muted">{{ v.changes }} {{ t('builder.versions.changes') }}</p>
          <p v-if="v.note" class="text-nexa-caption text-dimmed">{{ v.note }}</p>
        </UCard>
      </div>

      <div class="flex flex-col gap-4">
        <NxPackageDiff :rows="fixturePackageDiff" />
        <UAlert color="warning" variant="soft" :title="t('builder.versions.removeWarningTitle')" :description="t('builder.versions.removeWarningHint')" />
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('builder.versions.importPreview') }}</p>
          </template>
          <UTextarea v-model="importJson" :placeholder="t('builder.versions.importPlaceholder')" class="font-mono" />
          <div class="mt-2 flex justify-end">
            <UButton color="primary" size="sm" :label="t('builder.versions.import')" @click="importPackage" />
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
