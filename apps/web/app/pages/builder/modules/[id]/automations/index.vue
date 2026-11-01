<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-zap" :title="t('nav.automations')" :description="t('builder.automations.description')">
      <template #actions>
        <UButton color="primary" icon="i-lucide-plus" :label="t('common.new')" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <UCard v-for="a in fixtureAutomations" :key="a.id" class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <p class="text-nexa-body-strong text-highlighted">{{ a.name }}</p>
            <USwitch :model-value="a.enabled" :label="a.enabled ? t('common.enabled') : t('common.disabled')" />
          </div>
          <div class="flex flex-col gap-1.5 text-nexa-small">
            <p class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-play" class="size-3.5" />
              <span class="font-medium text-default">{{ t('builder.automations.trigger') }}:</span> {{ a.trigger }}
            </p>
            <p v-if="a.condition" class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-git-fork" class="size-3.5" />
              <span class="font-medium text-default">{{ t('builder.automations.condition') }}:</span>
              <span class="font-mono">{{ a.condition }}</span>
            </p>
            <div class="flex flex-col gap-1 ps-5">
              <p v-for="(action, i) in a.actions" :key="i" class="flex items-center gap-2 text-muted">
                <UIcon name="i-lucide-arrow-right" class="size-3.5" /> {{ action }}
              </p>
            </div>
          </div>
          <p class="border-t border-default pt-2 text-nexa-caption text-dimmed">
            {{ a.lastRun ? t('builder.automations.lastRun') : t('builder.automations.neverRun') }}
            {{ a.lastRun ? formatRelativeTime(a.lastRun) : '' }}
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>
