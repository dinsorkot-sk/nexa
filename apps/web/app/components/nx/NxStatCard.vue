<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string;
  value: string | number;
  trend?: { dir: 'up' | 'down' | 'none'; text: string };
  icon?: string;
}>(), { trend: undefined, icon: undefined });

const trendColor = computed(() => (props.trend?.dir === 'up' ? 'success' : props.trend?.dir === 'down' ? 'error' : 'neutral'));
const trendIcon = computed(() => (props.trend?.dir === 'up' ? 'i-lucide-arrow-up-right' : props.trend?.dir === 'down' ? 'i-lucide-arrow-down-right' : 'i-lucide-minus'));
</script>

<template>
  <UCard class="flex flex-col gap-2" :ui="{ body: { padding: 'p-4' }, root: 'rounded-xl' }">
    <div class="flex items-center justify-between gap-2">
      <p class="text-nexa-body-medium text-muted">{{ title }}</p>
      <UIcon v-if="icon" :name="icon" class="size-4 text-dimmed" />
    </div>
    <div class="flex items-end justify-between gap-2">
      <p class="text-nexa-title text-highlighted">{{ value }}</p>
      <UBadge v-if="trend" :color="trendColor" variant="soft" size="sm">
        <template #leading>
          <UIcon :name="trendIcon" class="size-3" />
        </template>
        {{ trend.text }}
      </UBadge>
    </div>
  </UCard>
</template>
