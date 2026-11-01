<script setup lang="ts">
const { t } = useI18n();
const { colorMode, locale } = useNexa();
const { isAuthenticated } = useAuth();

definePageMeta({ middleware: 'guest' });

useHead({ title: t('auth.loginTitle') });
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-default text-default">
    <!-- Brand panel 640px -->
    <div class="hidden w-[640px] flex-col gap-7 bg-[--ui-bg-muted] p-16 lg:flex" :style="{ padding: '64px' }">
      <NxLogo type="full" size="lg" />
      <h1 class="text-nexa-display text-highlighted">{{ t('auth.brandHeadline') }}</h1>
      <p class="max-w-[480px] text-nexa-body-lg text-muted">{{ t('auth.brandDescription') }}</p>
      <ul class="flex flex-col gap-4">
        <li v-for="feature in ['auth.feature1', 'auth.feature2', 'auth.feature3']" :key="feature" class="flex items-start gap-3">
          <span class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[--ui-primary-soft] text-[--ui-primary-text]">
            <UIcon name="i-lucide-check" class="size-3.5" />
          </span>
          <span class="text-nexa-body text-default">{{ t(feature) }}</span>
        </li>
      </ul>
    </div>

    <!-- Form side -->
    <div class="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto p-12" :style="{ padding: '48px' }">
      <div class="w-full max-w-[420px]">
        <div class="flex lg:hidden mb-6 justify-center"><NxLogo type="full" size="md" /></div>
        <UCard class="w-full" :ui="{ body: { padding: 'p-8' }, root: 'rounded-xl' }">
          <div class="flex flex-col gap-4">
            <slot />
          </div>
        </UCard>
        <div class="mt-4 flex items-center justify-center gap-2">
          <UTabs v-model="locale" :items="[{ label: 'ไทย', value: 'th' }, { label: 'EN', value: 'en' }]" variant="pill" size="sm" />
          <UButton icon="i-lucide-sun" variant="ghost" size="sm" square :aria-label="t('shell.theme')" @click="colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'">
            <template #leading><UIcon :name="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-4" /></template>
          </UButton>
        </div>
        <p v-if="isAuthenticated" class="mt-4 text-center text-nexa-caption text-muted">
          {{ t('auth.loggedInHint') }}
        </p>
      </div>
    </div>
  </div>
</template>
