<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const privileged = ['definition:read', 'workflow:transition', 'action:execute', 'automation:manage', 'report:read', 'report:manage', 'members:invite'];
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-shield" :title="t('nav.roles')" :description="t('admin.roles.description')" />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="r in fixtureRoles" :key="r.id" class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <p class="font-mono text-nexa-body-strong text-highlighted">{{ r.name }}</p>
            <UBadge color="neutral" variant="soft" size="sm">{{ r.count }}</UBadge>
          </div>
          <p class="text-nexa-small text-muted">{{ r.description }}</p>
        </div>
      </UCard>
    </div>

    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
      <template #header>
        <div class="border-b border-default px-4 py-3">
          <h2 class="text-nexa-subheading text-highlighted">{{ t('admin.roles.privileged') }}</h2>
        </div>
      </template>
      <UTable :columns="[{ key: 'permission', label: t('admin.roles.permission') }, { key: 'roles', label: t('nav.administration') }]" :rows="privileged.map((p) => ({ permission: p, roles: t('admin.roles.whoCan', { roles: 'owner, admin' }) }))" :ui="{ base: 'min-w-full' }" />
    </UCard>

    <UAlert color="info" variant="soft" :description="t('admin.roles.moduleLevelHint')" />
  </div>
</template>
