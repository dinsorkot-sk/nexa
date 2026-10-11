<template>
  <div :class="cn('flex flex-col items-center gap-1 px-4 py-8 text-center', props.class)">
    <p class="text-sm font-medium text-foreground">
      <slot>{{ t('common.noResults') }}</slot>
    </p>
    <p
      v-if="$slots.description"
      class="text-sm text-foreground-muted"
    >
      <slot name="description" />
    </p>
    <div
      v-if="$slots.action"
      class="mt-3"
    >
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { cn } from '../cn';

const props = defineProps<{ class?: string }>();
const { t } = useI18n();
</script>
