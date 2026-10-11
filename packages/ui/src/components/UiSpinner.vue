<template>
  <span
    role="status"
    :class="cn('inline-flex items-center gap-2 text-sm text-foreground-muted', props.class)"
  >
    <span
      class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <span :class="label ? '' : 'sr-only'">{{ label ?? t('common.loading') }}</span>
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { cn } from '../cn';

const props = defineProps<{ label?: string; class?: string }>();
const { t } = useI18n();
</script>
