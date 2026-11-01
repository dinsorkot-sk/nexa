<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' });

const { t } = useI18n();
const { user } = useAuth();
const { modules } = useMetadata();
const { membershipOrgs } = useOrgFixtures();

const hour = new Date().getHours();
const greetingKey = hour < 12 ? 'home.greetingMorning' : hour < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';
const today = computed(() => new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(new Date()));

const moduleCards = computed(() => modules.value.map((m) => ({
  ...m,
  recordCount: m.entities.reduce((sum, e) => sum + e.recordCount, 0),
  entityCount: m.entities.length,
})));

const pending = fixtureHome.pending;
const recent = fixtureHome.recentRecords;
</script>

<template>
  <div class="flex flex-col gap-5">
    <NxPageHeader :icon="'i-lucide-home'" :title="t(greetingKey, { name: user?.name?.split(' ')[0] ?? '' })">
      <template #actions>
        <UButton icon="i-lucide-plus" :label="t('home.newRecord')" color="primary" @click="navigateTo('/m/vehicle/vehicle/new')" />
      </template>
    </NxPageHeader>

    <p class="-mt-3 text-nexa-body text-muted">{{ today }}</p>

    <UAlert color="info" variant="soft" :title="t('home.pendingTitle', { n: fixtureHome.pendingCount })" />

    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="m in moduleCards" :key="m.id" class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
        <NuxtLink :to="`/m/${m.key}/${m.entities[0]?.name ?? ''}`" class="flex flex-col gap-3">
          <span class="inline-flex size-10 items-center justify-center rounded-lg bg-[--ui-primary-soft] text-[--ui-primary-text]">
            <UIcon :name="m.icon" class="size-5" />
          </span>
          <div>
            <p class="text-nexa-subheading text-highlighted">{{ m.name }}</p>
            <p class="text-nexa-small text-muted">
              {{ t('home.moduleStats', { records: formatNumber(m.recordCount), entities: m.entityCount }) }}
            </p>
          </div>
        </NuxtLink>
      </UCard>
    </section>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
        <template #header>
          <div class="flex items-center justify-between border-b border-default px-4 py-3">
            <h2 class="text-nexa-subheading text-highlighted">{{ t('home.pendingList') }}</h2>
            <UBadge color="warning" variant="soft" size="sm">{{ pending.length }}</UBadge>
          </div>
        </template>
        <div class="flex flex-col">
          <div v-for="p in pending" :key="p.id" class="flex items-center gap-3 border-b border-default px-4 py-3 last:border-b-0">
            <span class="inline-flex size-8 items-center justify-center rounded-md bg-[--ui-warning-soft] text-[--ui-warning-text]">
              <UIcon name="i-lucide-circle-dot" class="size-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-nexa-body-medium text-highlighted">{{ p.label }}</p>
              <p class="text-nexa-caption text-dimmed">{{ formatRelativeTime(p.at) }}</p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
          </div>
        </div>
      </UCard>

      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
        <template #header>
          <div class="flex items-center justify-between border-b border-default px-4 py-3">
            <h2 class="text-nexa-subheading text-highlighted">{{ t('home.recent') }}</h2>
            <UBadge color="neutral" variant="soft" size="sm">{{ recent.length }}</UBadge>
          </div>
        </template>
        <div class="flex flex-col">
          <div v-for="r in recent" :key="r.id" class="flex items-center gap-3 border-b border-default px-4 py-3 last:border-b-0">
            <span class="inline-flex size-8 items-center justify-center rounded-md bg-[--ui-bg-accented] text-muted">
              <UIcon name="i-lucide-history" class="size-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-nexa-body-medium text-highlighted">{{ r.label }}</p>
              <p class="text-nexa-caption text-dimmed">{{ r.entity }} · {{ formatRelativeTime(r.at) }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <section>
      <h2 class="mb-3 text-nexa-subheading text-highlighted">{{ t('home.shortcuts') }}</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <UButton v-for="s in fixtureHome.shortcuts" :key="s.label" :to="s.to" variant="outline" class="h-auto justify-start p-3" :label="s.label">
          <template #leading>
            <UIcon :name="s.icon" class="size-4" />
          </template>
        </UButton>
      </div>
    </section>
  </div>
</template>
