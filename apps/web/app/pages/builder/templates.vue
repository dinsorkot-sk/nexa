<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const toast = useToast();

const templates = computed(() => [
  { key: 'inventory', name: t('builder.templates.inventory'), description: t('builder.templates.inventoryDesc'), entities: 4, fields: 23, workflows: 2 },
  { key: 'crm', name: t('builder.templates.crm'), description: t('builder.templates.crmDesc'), entities: 3, fields: 18, workflows: 1 },
  { key: 'person', name: t('builder.templates.person'), description: t('builder.templates.personDesc'), entities: 2, fields: 12, workflows: 0 },
]);

function install(key: string) {
  toast.add({ title: t('builder.templates.installedToast', { key }), color: 'success' });
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-layout-template" :title="t('nav.templates')" :description="t('builder.templates.description')" />
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <UCard v-for="tpl in templates" :key="tpl.key" class="cursor-pointer rounded-xl transition-shadow hover:shadow-[--ui-shadow-sm]" :ui="{ body: { padding: 'p-4' } }" @click="install(tpl.key)">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-nexa-subheading text-highlighted">{{ tpl.name }}</p>
            <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted" />
          </div>
          <p class="text-nexa-small line-clamp-2 text-muted">{{ tpl.description }}</p>
          <div class="flex gap-2 border-t border-default pt-2">
            <UBadge color="neutral" variant="soft" size="sm">{{ tpl.entities }} {{ t('builder.templates.entities') }}</UBadge>
            <UBadge color="neutral" variant="soft" size="sm">{{ tpl.fields }} {{ t('builder.templates.fields') }}</UBadge>
            <UBadge color="neutral" variant="soft" size="sm">{{ tpl.workflows }} {{ t('builder.templates.workflows') }}</UBadge>
          </div>
          <p class="text-nexa-caption text-dimmed">{{ t('builder.templates.installHint') }}</p>
        </div>
      </UCard>
    </div>
  </div>
</template>
