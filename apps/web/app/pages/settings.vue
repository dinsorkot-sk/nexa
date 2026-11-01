<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' });

const { t } = useI18n();
const { colorMode, setLanguage, setRadius } = useNexa();
const settings = ref(structuredClone(fixtureSettings));
const toast = useToast();

const themeItems = [
  { label: t('settings.themeLight'), value: 'light' },
  { label: t('settings.themeDark'), value: 'dark' },
  { label: t('settings.themeSystem'), value: 'system' },
];

const { membershipOrgs } = useOrgFixtures();
const orgOptions = computed(() => membershipOrgs.value.map((o) => ({ label: o.name, value: o.name })));

function save() {
  localStorage.setItem('nexa:locale', settings.value.language);
  setLanguage(settings.value.language as 'th' | 'en');
  colorMode.preference = settings.value.theme;
  setRadius(settings.value.radius as 'compact' | 'default' | 'comfortable' | 'round');
  toast.add({ title: t('settings.saved'), color: 'success' });
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <NxPageHeader icon="i-lucide-settings" :title="t('settings.title')" :description="t('settings.description')" />

    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
      <div class="flex flex-col gap-5">
        <UFormField :label="t('settings.language')" required>
          <UTabs v-model="settings.language" variant="pill" size="md" :items="[{ label: 'ไทย', value: 'th' }, { label: 'English', value: 'en' }]" class="max-w-xs" />
        </UFormField>

        <UFormField :label="t('settings.calendar')">
          <USelect v-model="settings.calendar" :items="[{ label: t('settings.calendarBuddhist'), value: 'buddhist' }, { label: t('settings.calendarGregorian'), value: 'gregorian' }]" class="max-w-xs" />
        </UFormField>

        <UFormField :label="t('settings.numberFormat')">
          <USelect v-model="settings.numberFormat" :items="[{ label: t('settings.numberFormatTh'), value: 'th-TH' }, { label: t('settings.numberFormatEn'), value: 'en-US' }]" class="max-w-xs" />
        </UFormField>

        <UFormField :label="t('settings.theme')">
          <USelectMenu v-model="settings.theme" :items="themeItems" class="max-w-xs" />
        </UFormField>

        <USeparator />

        <UFormField :label="t('settings.displayName')" required>
          <UInput v-model="settings.displayName" class="max-w-sm" />
        </UFormField>

        <UFormField :label="t('settings.email')" :hint="t('settings.emailReadonly')">
          <UInput :model-value="settings.email" disabled class="max-w-sm" />
        </UFormField>

        <UFormField :label="t('settings.defaultOrg')">
          <USelect v-model="settings.defaultOrg" :items="orgOptions" class="max-w-xs" />
        </UFormField>

        <USeparator />

        <UFormField :label="t('settings.formDensity')">
          <USelect v-model="settings.formDensity" :items="[{ label: t('settings.densityComfortable'), value: 'comfortable' }, { label: t('settings.densityCompact'), value: 'compact' }]" class="max-w-xs" />
        </UFormField>

        <UFormField :label="t('settings.radiusMode')">
          <USelect v-model="settings.radius" :items="[{ label: t('settings.radiusCompact'), value: 'compact' }, { label: t('settings.radiusDefault'), value: 'default' }, { label: t('settings.radiusComfortable'), value: 'comfortable' }, { label: t('settings.radiusRound'), value: 'round' }]" class="max-w-xs" />
        </UFormField>

        <div class="flex items-center justify-between">
          <UCheckbox v-model="settings.compactTable" :label="t('settings.compactTable')" />
        </div>

        <div class="flex justify-end gap-2">
          <UButton color="primary" :label="t('common.save')" @click="save" />
        </div>
      </div>
    </UCard>
  </div>
</template>
