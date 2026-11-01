<script setup lang="ts">
const { t } = useI18n();
const error = useError();

const is401 = computed(() => error.value?.statusCode === 401);

function clear() {
  clearError({ redirect: is401.value ? '/login' : '/' });
}
</script>

<template>
  <div class="flex min-h-svh flex-col items-center justify-center bg-default p-6">
    <NxErrorScreen
      :status="error?.statusCode ?? 500"
      :title="is401 ? t('errors.sessionExpiredTitle') : t(`errors.title${error?.statusCode ?? 500}`)"
      :description="is401 ? t('errors.sessionExpiredHint') : t(`errors.description${error?.statusCode ?? 500}`)"
      :request-id="(error?.data as { requestId?: string } | undefined)?.requestId ?? null"
    >
      <template #actions>
        <UButton color="primary" :label="is401 ? t('errors.loginAgain') : t('errors.backHome')" @click="clear" />
      </template>
    </NxErrorScreen>
  </div>
</template>
