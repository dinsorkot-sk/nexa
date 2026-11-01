<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const search = ref('');
const statusFilter = ref('all');
const newOpen = ref(false);
const archiveTarget = ref<null | { id: string; name: string }>(null);
const archiveConfirm = ref('');
const toast = useToast();

const modules = computed(() => fixtureModules().filter((m) => {
  if (statusFilter.value !== 'all' && m.status !== statusFilter.value) return false;
  if (search.value && !m.name.toLowerCase().includes(search.value.toLowerCase())) return false;
  return true;
}));

const statusBadge: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'error'> = {
  draft: 'neutral', review: 'warning', published: 'info', enabled: 'success', disabled: 'neutral', archived: 'neutral',
};

const newModule = ref({ option: 'blank', name: '', key: '', icon: 'i-lucide-box', description: '' });

function createModule() {
  newOpen.value = false;
  toast.add({ title: t('builder.modules.createdToast'), color: 'success' });
}

function confirmArchive() {
  if (archiveConfirm.value !== archiveTarget.value?.name) return;
  archiveTarget.value = null;
  archiveConfirm.value = '';
  toast.add({ title: t('builder.modules.archivedToast'), color: 'success' });
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-box" :title="t('nav.modules')" :description="t('builder.modules.description')">
      <template #actions>
        <UButton color="primary" icon="i-lucide-plus" :label="t('builder.modules.newModule')" @click="newOpen = true" />
      </template>
    </NxPageHeader>

    <div class="flex items-center gap-2">
      <UInput v-model="search" :placeholder="t('common.search')" class="w-56" clearable>
        <template #leading><UIcon name="i-lucide-search" class="size-4" /></template>
      </UInput>
      <UTabs v-model="statusFilter" variant="pill" size="sm" :items="[
        { label: t('common.all'), value: 'all' },
        { label: t('builder.status.draft'), value: 'draft' },
        { label: t('builder.status.review'), value: 'review' },
        { label: t('builder.status.published'), value: 'published' },
        { label: t('builder.status.enabled'), value: 'enabled' },
      ]" />
    </div>

    <UAlert color="info" variant="soft" :title="t('builder.modules.fromTemplateTitle')" :description="t('builder.modules.fromTemplateHint')">
      <template #actions>
        <UButton variant="outline" size="sm" :label="t('nav.templates')" to="/builder/templates" />
      </template>
    </UAlert>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard v-for="m in modules" :key="m.id" class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
        <div class="flex flex-col gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="inline-flex size-9 items-center justify-center rounded-lg bg-[--ui-primary-soft] text-[--ui-primary-text]">
                <UIcon :name="m.icon" class="size-5" />
              </span>
              <div>
                <p class="text-nexa-body-strong text-highlighted">{{ m.name }}</p>
                <p class="font-mono text-nexa-mono-small text-dimmed">v{{ m.version }} · {{ m.key }}</p>
              </div>
            </div>
            <UBadge :color="statusBadge[m.status] ?? 'neutral'" variant="soft" size="sm">{{ t(`builder.status.${m.status}`) }}</UBadge>
          </div>
          <p class="text-nexa-small line-clamp-2 text-muted">{{ m.description }}</p>
          <div class="mt-1 flex items-center justify-between border-t border-default pt-2">
            <p class="text-nexa-caption text-dimmed">{{ m.owner }} · {{ formatRelativeTime(m.updatedAt) }}</p>
            <div class="flex gap-1">
              <UButton icon="i-lucide-pencil" variant="ghost" size="xs" square :aria-label="t('common.edit')" :to="`/builder/modules/${m.id}`" />
              <UButton icon="i-lucide-archive" variant="ghost" size="xs" square color="error" :aria-label="t('builder.modules.archive')" @click="archiveTarget = { id: m.id, name: m.name }" />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model="newOpen" :title="t('builder.modules.newModule')" :ui="{ content: 'max-w-md' }">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-2">
          <UButton v-for="opt in ['blank', 'template', 'import']" :key="opt" :variant="newModule.option === opt ? 'solid' : 'outline'" :color="newModule.option === opt ? 'primary' : 'neutral'" size="sm" @click="newModule.option = opt">
            {{ t(`builder.modules.options.${opt}`) }}
          </UButton>
        </div>
        <UFormField :label="t('builder.modules.name')" required>
          <UInput v-model="newModule.name" />
        </UFormField>
        <UFormField :label="t('builder.modules.key')" :hint="t('builder.modules.keyHint')" required>
          <UInput v-model="newModule.key" />
        </UFormField>
        <UFormField :label="t('builder.modules.icon')">
          <UInput v-model="newModule.icon" />
        </UFormField>
        <UFormField :label="t('builder.modules.description')">
          <UTextarea v-model="newModule.description" />
        </UFormField>
        <p class="text-nexa-caption text-dimmed">{{ t('builder.modules.draftVersion') }}</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" @click="newOpen = false" />
          <UButton color="primary" :label="t('common.create')" @click="createModule" />
        </div>
      </template>
    </UModal>

    <UModal v-model="archiveTarget" :title="t('builder.modules.archiveTitle')" :ui="{ content: 'max-w-md' }">
      <div v-if="archiveTarget" class="flex flex-col gap-3">
        <p class="text-nexa-body text-muted">{{ t('builder.modules.archiveHint', { name: archiveTarget.name }) }}</p>
        <ul class="list-disc ps-5 text-nexa-body text-muted">
          <li>{{ t('builder.modules.archiveImpact1', { n: 24 }) }}</li>
          <li>{{ t('builder.modules.archiveImpact2', { n: 342 }) }}</li>
          <li>{{ t('builder.modules.archiveImpact3', { n: 3 }) }}</li>
        </ul>
        <UFormField :label="t('builder.modules.archiveConfirmLabel')" required>
          <UInput v-model="archiveConfirm" :placeholder="archiveTarget.name" />
        </UFormField>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" @click="archiveTarget = null" />
          <UButton color="error" :disabled="archiveConfirm !== archiveTarget?.name" :label="t('builder.modules.archive')" @click="confirmArchive" />
        </div>
      </template>
    </UModal>
  </div>
</template>
