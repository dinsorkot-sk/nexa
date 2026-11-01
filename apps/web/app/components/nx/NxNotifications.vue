<script setup lang="ts">
import { fixtureNotifications } from '../../data/fixtures';

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const tab = ref<'all' | 'unread'>('all');
const items = ref(structuredClone(fixtureNotifications));

const unreadCount = computed(() => items.value.filter((n) => !n.read).length);
const filtered = computed(() => (tab.value === 'unread' ? items.value.filter((n) => !n.read) : items.value));

const kindIcon: Record<string, string> = {
  automation: 'i-lucide-zap',
  invitation: 'i-lucide-mail-plus',
  sync: 'i-lucide-refresh-cw',
  import: 'i-lucide-file-up',
  system: 'i-lucide-info',
};

function markAllRead() {
  items.value.forEach((n) => { n.read = true; });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-2 border-b border-default px-4 py-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('notifications.title') }}</h2>
      <UBadge v-if="unreadCount > 0" color="error" size="sm">{{ unreadCount }}</UBadge>
      <UButton icon="i-lucide-x" variant="ghost" size="sm" square class="ms-auto" :aria-label="t('common.close')" @click="emit('close')" />
    </div>
    <div class="flex items-center gap-2 border-b border-default px-4 py-2">
      <UTabs v-model="tab" variant="pill" size="sm" :items="[{ label: t('common.all'), value: 'all' }, { label: t('common.unread'), value: 'unread' }]" />
      <UButton icon="i-lucide-check-check" variant="ghost" size="sm" class="ms-auto" :label="t('notifications.markAllRead')" @click="markAllRead" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="filtered.length === 0" class="flex h-full items-center justify-center p-8 text-center">
        <NxEmptyState :icon="'i-lucide-bell-off'" :title="t('notifications.empty')" />
      </div>
      <div v-for="n in filtered" :key="n.id" class="flex items-start gap-3 border-b border-default px-4 py-3">
        <span class="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[--ui-bg-accented] text-muted">
          <UIcon :name="kindIcon[n.kind] ?? 'i-lucide-bell'" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-nexa-body-medium text-highlighted">
            <span class="truncate">{{ n.title }}</span>
            <span v-if="!n.read" class="size-1.5 shrink-0 rounded-full bg-[--ui-primary]" />
          </p>
          <p class="truncate text-nexa-body text-muted">{{ n.body }}</p>
          <p class="mt-0.5 text-nexa-caption text-dimmed">{{ n.actor }} · {{ formatRelativeTime(n.createdAt) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
