<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { setTenant } = useTenant();
const { membershipOrgs } = useOrgFixtures();

useHead({ title: t('auth.selectOrgTitle') });

const empty = computed(() => useRoute().query.empty === '1');
const orgs = computed(() => (empty.value ? [] : membershipOrgs));

function choose(slug: string) {
  setTenant(slug);
  navigateTo('/');
}
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <h1 class="text-nexa-title text-highlighted">{{ t('auth.selectOrgTitle') }}</h1>

    <div v-if="orgs.length === 0" class="flex flex-col items-center">
      <NxEmptyState
        :icon="'i-lucide-building-2'"
        :title="t('auth.noOrgsTitle')"
        :description="t('auth.noOrgsHint')"
      >
        <template #actions>
          <UButton color="primary" :label="t('auth.createOrg')" icon="i-lucide-plus" />
        </template>
      </NxEmptyState>
    </div>

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UCard
        v-for="o in orgs"
        :key="o.slug"
        class="cursor-pointer rounded-xl transition-shadow hover:shadow-[--ui-shadow-sm]"
        :ui="{ body: { padding: 'p-4' } }"
        @click="choose(o.slug)"
      >
        <div class="flex items-start gap-3">
          <UAvatar size="lg" :text="o.name.charAt(0)" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-nexa-body-strong text-highlighted">
              <span class="truncate">{{ o.name }}</span>
              <UBadge v-if="o.current" color="primary" variant="soft" size="sm">{{ t('auth.currentOrg') }}</UBadge>
            </p>
            <p class="text-nexa-small text-muted">
              {{ t('shell.org.members', { n: o.memberCount }) }} · {{ t('shell.org.modules', { n: o.moduleCount }) }} · {{ t(`shell.role.${o.role}`) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
