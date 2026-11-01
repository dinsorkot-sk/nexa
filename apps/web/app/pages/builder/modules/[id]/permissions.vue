<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-4 overflow-y-auto p-6">
    <NxPageHeader icon="i-lucide-shield-check" :title="t('nav.permissions')" :description="t('builder.permissions.description')" />

    <UAlert color="warning" variant="soft" :title="t('builder.permissions.defaultDeny')" :description="t('builder.permissions.defaultDenyHint')" />

    <NxPermissionsTable
      :roles="fixturePermissions.roles.map((r) => ({ id: r.id, name: r.name, count: r.count }))"
      :permissions="fixturePermissions.permissions"
      :matrix="fixturePermissions.matrix"
      :field-level="fixturePermissions.fieldLevel"
    />

    <UAlert color="info" variant="soft" :description="t('builder.permissions.hiddenNote')" />
  </div>
</template>
