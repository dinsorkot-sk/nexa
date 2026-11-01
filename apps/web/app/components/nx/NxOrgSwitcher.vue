<script setup lang="ts">
import type { MembershipOrg } from '../../composables/useOrgFixtures';

const props = withDefaults(defineProps<{
  orgs: MembershipOrg[];
  current: string;
  collapsed?: boolean;
}>(), { collapsed: false });

const emit = defineEmits<{ switch: [slug: string] }>();
const { t } = useI18n();

const items = computed(() => props.orgs.map((o) => ({
  label: o.name,
  description: `${t('shell.org.members', { n: o.memberCount })} · ${t('shell.org.modules', { n: o.moduleCount })} · ${t(`shell.role.${o.role}`)}`,
  icon: o.current ? 'i-lucide-check' : undefined,
  onSelect: () => emit('switch', o.slug),
})));
</script>

<template>
  <UDropdownMenu :items="[items]">
    <UButton variant="ghost" size="md" class="w-full justify-start" :class="collapsed ? 'px-0' : ''">
      <template #leading>
        <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[--ui-primary-soft] text-[--ui-primary-text]">
          <UIcon name="i-lucide-building-2" class="size-4" />
        </span>
      </template>
      <template #default>
        <span v-if="!collapsed" class="block min-w-0 text-left">
          <span class="block truncate text-nexa-body-medium">{{ orgs.find((o) => o.slug === current)?.name ?? current }}</span>
          <span class="block truncate text-nexa-caption text-muted">{{ t('shell.org.roleSuffix', { role: t(`shell.role.${orgs.find((o) => o.slug === current)?.role ?? 'member'}`) }) }}</span>
        </span>
      </template>
      <template #trailing>
        <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-3.5 shrink-0 text-muted" />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
