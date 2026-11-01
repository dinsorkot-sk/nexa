<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const { user, logout } = useAuth();
const { slug } = useTenant();
const { colorMode, locale, setLanguage } = useNexa();

const collapsed = useLocalStorage<boolean>('nexa:builder-sidebar-collapsed', false);
const paletteOpen = ref(false);
const orgMenuOpen = ref(false);
const userMenuOpen = ref(false);
const { membershipOrgs } = useOrgFixtures();

useShortcut(['ctrl', 'k'], () => { paletteOpen.value = true; });

const moduleId = computed(() => route.params.moduleId as string | undefined);
const inModule = computed(() => Boolean(moduleId.value));

const workspaceNav = [
  { label: t('nav.modules'), icon: 'i-lucide-box', to: '/builder/modules', active: route.path.startsWith('/builder/modules') && !inModule.value },
  { label: t('nav.templates'), icon: 'i-lucide-layout-template', to: '/builder/templates', active: route.path.startsWith('/builder/templates') },
];

const moduleNav = [
  { label: t('nav.overview'), icon: 'i-lucide-layout-grid', to: `/builder/modules/${moduleId.value}` },
  { label: t('nav.entities'), icon: 'i-lucide-table-2', to: `/builder/modules/${moduleId.value}/entities` },
  { label: t('nav.relations'), icon: 'i-lucide-share-2', to: `/builder/modules/${moduleId.value}/relations` },
  { label: t('nav.viewsForms'), icon: 'i-lucide-eye', to: `/builder/modules/${moduleId.value}/views` },
  { label: t('nav.workflows'), icon: 'i-lucide-git-branch', to: `/builder/modules/${moduleId.value}/workflows` },
  { label: t('nav.automations'), icon: 'i-lucide-zap', to: `/builder/modules/${moduleId.value}/automations` },
  { label: t('nav.reports'), icon: 'i-lucide-bar-chart-3', to: `/builder/modules/${moduleId.value}/reports` },
  { label: t('nav.dashboardsNav'), icon: 'i-lucide-layout-dashboard', to: `/builder/modules/${moduleId.value}/dashboards` },
  { label: t('nav.permissions'), icon: 'i-lucide-shield-check', to: `/builder/modules/${moduleId.value}/permissions` },
  { label: t('nav.packages'), icon: 'i-lucide-package', to: `/builder/modules/${moduleId.value}/versions` },
];

const adminNav = [
  { label: t('nav.organization'), icon: 'i-lucide-building-2', to: '/admin/organization' },
  { label: t('nav.members'), icon: 'i-lucide-users', to: '/admin/members' },
  { label: t('nav.roles'), icon: 'i-lucide-shield', to: '/admin/roles' },
  { label: t('nav.audit'), icon: 'i-lucide-scroll-text', to: '/admin/audit' },
  { label: t('nav.events'), icon: 'i-lucide-activity', to: '/admin/events' },
  { label: t('nav.operations'), icon: 'i-lucide-cog', to: '/admin/operations' },
];

const crumbs = computed(() => buildBreadcrumb(route, []));

function onLogout() {
  userMenuOpen.value = false;
  logout();
}
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-default text-default">
    <!-- Sidebar: always dark (Rule 2) — .dark subtree resolves --ui-* to dark set -->
    <aside class="dark hidden w-16 flex-col border-r border-[--ui-border-inverted] bg-[#0f172b] text-white transition-[width] duration-200 md:flex lg:w-[232px]" :class="collapsed ? 'lg:w-16' : ''" :style="{ padding: '16px 12px 12px 12px' }">
      <div class="flex items-center gap-2">
        <NxLogo type="mark" size="md" class="shrink-0 text-white" />
        <UBadge v-if="!collapsed" color="neutral" variant="soft" size="sm" class="bg-white/10 text-white">{{ t('nav.builder') }}</UBadge>
        <UButton icon="i-lucide-panel-left-close" variant="ghost" size="sm" square class="ms-auto text-white/70" :aria-label="t('shell.collapse')" @click="collapsed = true" />
      </div>

      <nav class="mt-6 flex flex-col gap-0.5">
        <p v-if="!collapsed" class="px-2 pb-1 text-nexa-caption text-white/50">{{ t('nav.workspace') }}</p>
        <UButton v-for="item in workspaceNav" :key="item.to" :to="item.to" variant="ghost" size="md" class="w-full justify-start text-white/80 hover:bg-white/10" :class="collapsed ? 'px-0' : ''" :active="item.active">
          <template #leading><UIcon :name="item.icon" class="size-5" /></template>
          <template #default><span v-if="!collapsed">{{ item.label }}</span></template>
        </UButton>
      </nav>

      <nav v-if="inModule" class="mt-6 flex flex-col gap-0.5">
        <p v-if="!collapsed" class="px-2 pb-1 text-nexa-caption text-white/50">{{ t('nav.currentModule') }}</p>
        <UButton v-for="item in moduleNav" :key="item.to" :to="item.to" variant="ghost" size="md" class="w-full justify-start text-white/80 hover:bg-white/10" :class="collapsed ? 'px-0' : ''" :active="route.path === item.to">
          <template #leading><UIcon :name="item.icon" class="size-5" /></template>
          <template #default><span v-if="!collapsed" class="truncate">{{ item.label }}</span></template>
        </UButton>
      </nav>

      <nav class="mt-6 flex flex-col gap-0.5">
        <p v-if="!collapsed" class="px-2 pb-1 text-nexa-caption text-white/50">{{ t('nav.administration') }}</p>
        <UButton v-for="item in adminNav" :key="item.to" :to="item.to" variant="ghost" size="md" class="w-full justify-start text-white/80 hover:bg-white/10" :class="collapsed ? 'px-0' : ''" :active="item.active">
          <template #leading><UIcon :name="item.icon" class="size-5" /></template>
          <template #default><span v-if="!collapsed">{{ item.label }}</span></template>
        </UButton>
      </nav>

      <div class="mt-auto flex flex-col gap-2 border-t border-white/10 pt-2">
        <div v-if="!collapsed" class="flex items-center gap-1 px-1">
          <UTabs v-model="locale" :items="[{ label: 'ไทย', value: 'th' }, { label: 'EN', value: 'en' }]" variant="pill" size="sm" class="flex-1" />
          <UButton icon="i-lucide-sun" variant="ghost" size="sm" square class="text-white/70" @click="colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'">
            <template #leading><UIcon :name="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-4" /></template>
          </UButton>
        </div>
        <UDropdownMenu v-model:open="userMenuOpen" :items="[[
          { label: t('shell.userMenu.profile'), icon: 'i-lucide-user', onSelect: () => navigateTo('/settings') },
          { label: t('shell.userMenu.logout'), icon: 'i-lucide-log-out', onSelect: onLogout },
        ]]">
          <UButton variant="ghost" size="md" class="w-full justify-start text-white/80 hover:bg-white/10" :class="collapsed ? 'px-0' : ''">
            <template #leading><UAvatar size="sm" :text="user?.name?.charAt(0) ?? 'N'" /></template>
            <template #default>
              <template v-if="!collapsed">
                <span class="block truncate text-left">
                  <span class="block text-nexa-body-medium text-white">{{ user?.name }}</span>
                  <span class="block text-nexa-caption text-white/50">{{ user?.role }} · {{ slug }}</span>
                </span>
              </template>
            </template>
          </UButton>
        </UDropdownMenu>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-[60px] shrink-0 items-center gap-3 border-b border-default px-6">
        <UBreadcrumb :links="crumbs" />
        <div class="ms-auto flex items-center gap-2">
          <slot name="actions" />
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </main>
    </div>

    <NxCommandPalette v-model:open="paletteOpen" />
  </div>
</template>
