<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
useHead({ title: t('auth.forgotTitle') });
</script>

<template>
  <div class="flex w-full flex-col items-center">
    <NxEmptyState icon="i-lucide-key-round" :title="t('auth.pendingDesign')" :description="t('auth.forgotPending')">
      <template #actions>
        <UButton variant="outline" :label="t('auth.backToLogin')" to="/login" />
      </template>
    </NxEmptyState>
  </div>
</template>
