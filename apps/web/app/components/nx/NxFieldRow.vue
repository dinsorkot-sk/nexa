<script setup lang="ts">
import type { FieldSpec } from '@nexa/types';

withDefaults(defineProps<{
  field: FieldSpec;
  selected?: boolean;
  error?: string;
}>(), { selected: false, error: '' });
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-md border px-3 py-2 transition-colors"
    :class="[
      error ? 'border-error/50 bg-error/5' : selected ? 'border-[--ui-primary] bg-[--ui-primary-soft]' : 'border-default bg-default hover:bg-[--ui-bg-muted]',
    ]"
  >
    <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-dimmed" />
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-1.5 text-nexa-body-medium text-highlighted">
        <span class="truncate">{{ field.label }}</span>
        <span v-if="field.required" class="text-error">*</span>
      </p>
      <p class="truncate font-mono text-nexa-mono-small text-dimmed">{{ field.name }}</p>
    </div>
    <UBadge color="neutral" variant="soft" size="sm" class="shrink-0">{{ field.logicalType }}</UBadge>
    <UIcon v-if="field.unique" name="i-lucide-key" class="size-3.5 shrink-0 text-muted" />
    <UIcon v-if="field.hidden" name="i-lucide-eye-off" class="size-3.5 shrink-0 text-muted" />
    <UIcon v-if="field.readOnly" name="i-lucide-lock" class="size-3.5 shrink-0 text-muted" />
    <slot />
  </div>
</template>
