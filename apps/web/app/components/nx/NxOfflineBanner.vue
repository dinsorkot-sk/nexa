<script setup lang="ts">
import { useOnline } from '@vueuse/core';

const { t } = useI18n();
const online = useOnline();
</script>

<template>
  <UBanner v-if="!online" color="warning" variant="soft" :title="t('errors.offline')" :description="t('errors.offlineHint')" class="rounded-none border-x-0 border-t-0" />
</template>
