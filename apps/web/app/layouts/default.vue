<script setup lang="ts">
import { useLocalStorage, useMediaQuery, useMagicKeys, computedAsync } from '@vueuse/core';

const { t } = useI18n();
const route = useRoute();
const { modules } = useMetadata();
const { user, logout } = useAuth();
const { slug, setTenant } = useTenant();
const { colorMode, locale, setLanguage } = useNexa();
const { membershipOrgs } = useOrgFixtures();

const collapsed = useLocalStorage<boolean>('nexa:sidebar-collapsed', false);
const paletteOpen = ref(false);
const notificationsOpen = ref(false);
const expanded = ref<string[]>([]);
const orgMenuOpen = ref(false);
const userMenuOpen = ref(false);

const keys = useMagicKeys();
watch(() => keys['Control_K'], (v) => { if (v) paletteOpen.value = true; });

const isMobile = useMediaQuery('(max-width: 767px)');
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
const railMode = computed(() => collapsed.value || isTablet.value);

const mainNav = computed(() => [
  { label: t('nav.home'), icon: 'i-lucide-home', to: '/', active: route.path === '/' },
  { label: t('nav.dashboards'), icon: 'i-lucide-layout-dashboard', to: '/dashboards', active: route.path.startsWith('/dashboards') },
]);

function expandModule(key: string) {
  expanded.value = expanded.value.includes(key) ? expanded.value.filter((k) => k !== key) : [...expanded.value, key];
}

const crumbs = computed(() => buildBreadcrumb(route, modules.value));

function onLogout() {
  userMenuOpen.value = false;
  logout();
}

watch(locale, (next) => {
  document.documentElement.lang = next;
});
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-default text-default">
    <!-- Mobile app bar -->
    <div class="fixed inset-x-0 top-0 z-30 flex h-[45px] items-center gap-2 border-b border-default bg-default px-4 md:hidden">
      <NxLogo type="mark" size="sm" />
      <span class="text-nexa-body-strong">{{ membershipOrgs.find((o) => o.slug === slug)?.name ?? slug }}</span>
      <div class="ms-auto flex items-center gap-1">
        <UButton icon="i-lucide-bell" variant="ghost" size="sm" square aria-label="Notifications" @click="notificationsOpen = true" />
        <UButton icon="i-lucide-menu" variant="ghost" size="sm" square aria-label="Menu" />
      </div>
    </div>

    <!-- Sidebar: icon rail on tablet, full on desktop, collapsible -->
    <aside
      class="fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-default bg-default transition-[width] duration-200 md:flex"
      :class="railMode.value ? 'w-16' : 'w-[248px]'"
      :style="{ padding: '14px 12px 12px 12px' }"
    >
      <div class="flex items-center gap-2">
        <NxLogo :type="railMode.value ? 'mark' : 'full'" size="md" class="shrink-0" />
        <UButton v-if="!railMode.value" icon="i-lucide-panel-left-close" variant="ghost" size="sm" square class="ms-auto" :aria-label="t('shell.collapse')" @click="collapsed = true" />
        <UButton v-else icon="i-lucide-panel-left-open" variant="ghost" size="sm" square class="ms-auto" :aria-label="t('shell.expand')" @click="collapsed = false" />
      </div>

      <div class="mt-4">
        <NxOrgSwitcher v-model:open="orgMenuOpen" :orgs="membershipOrgs" :current="slug" :collapsed="railMode.value" @switch="setTenant" />
      </div>

      <div class="mt-4">
        <UButton variant="outline" size="md" class="w-full justify-start" :label="railMode.value ? '' : t('shell.search')" @click="paletteOpen = true">
          <template #leading>
            <UIcon name="i-lucide-search" class="size-4" />
          </template>
          <template v-if="!railMode.value" #trailing>
            <UKbd>Ctrl K</UKbd>
          </template>
        </UButton>
      </div>

      <nav class="mt-4 flex flex-col gap-0.5">
        <UButton
          v-for="item in mainNav"
          :key="item.to"
          :to="item.to"
          :variant="item.active ? 'soft' : 'ghost'"
          :color="item.active ? 'primary' : 'neutral'"
          size="md"
          class="w-full justify-start"
          :class="railMode.value ? 'px-0' : ''"
        >
          <template #leading>
            <UIcon :name="item.icon" class="size-5" />
          </template>
          <template #default>
            <span v-if="!railMode.value">{{ item.label }}</span>
          </template>
        </UButton>
      </nav>

      <div class="mt-6 flex-1 overflow-y-auto">
        <p v-if="!railMode.value" class="px-2 pb-1 text-nexa-caption text-muted">{{ t('nav.apps') }}</p>
        <div v-for="mod in modules" :key="mod.key" class="flex flex-col gap-0.5">
          <UButton variant="ghost" size="md" class="w-full justify-start" :class="railMode.value ? 'px-0' : ''" @click="expandModule(mod.key)">
            <template #leading>
              <UIcon :name="mod.icon" class="size-5" />
            </template>
            <template #default>
              <span v-if="!railMode.value" class="truncate">{{ mod.name }}</span>
            </template>
            <template #trailing>
              <UIcon v-if="!railMode.value" :name="expanded.includes(mod.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5 text-muted" />
            </template>
          </UButton>
          <template v-if="expanded.includes(mod.key) && !railMode.value">
            <UButton
              v-for="entity in mod.entities"
              :key="entity.id"
              :to="`/m/${mod.key}/${entity.name}`"
              variant="ghost"
              size="md"
              class="w-full justify-start ps-9"
              :active="route.path.startsWith(`/m/${mod.key}/${entity.name}`)"
            >
              {{ entity.label }}
            </UButton>
          </template>
        </div>
      </div>

      <div class="flex flex-col gap-0.5 border-t border-default pt-2">
        <UButton to="/builder/modules" variant="ghost" size="md" class="w-full justify-start" :class="railMode.value ? 'px-0' : ''">
          <template #leading>
            <UIcon name="i-lucide-hammer" class="size-5" />
          </template>
          <template #default>
            <span v-if="!railMode.value">{{ t('nav.openBuilder') }}</span>
          </template>
          <template #trailing>
            <UIcon v-if="!railMode.value" name="i-lucide-arrow-up-right" class="size-3.5 text-muted" />
          </template>
        </UButton>
        <UButton to="/settings" variant="ghost" size="md" class="w-full justify-start" :class="railMode.value ? 'px-0' : ''">
          <template #leading>
            <UIcon name="i-lucide-settings" class="size-5" />
          </template>
          <template #default>
            <span v-if="!railMode.value">{{ t('nav.settings') }}</span>
          </template>
        </UButton>

        <div v-if="!railMode.value" class="flex items-center gap-1 px-1 pt-2">
          <UTabs v-model="locale" :items="[{ label: 'ไทย', value: 'th' }, { label: 'EN', value: 'en' }]" variant="pill" size="sm" class="flex-1" />
          <UButton icon="i-lucide-sun" variant="ghost" size="sm" square @click="colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'">
            <template #leading>
              <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-4" />
            </template>
          </UButton>
        </div>

        <UDropdownMenu v-model:open="userMenuOpen" :items="[[
          { label: t('shell.userMenu.profile'), icon: 'i-lucide-user', onSelect: () => navigateTo('/settings') },
          { label: t('shell.userMenu.logout'), icon: 'i-lucide-log-out', onSelect: onLogout },
        ]]">
          <UButton variant="ghost" size="md" class="w-full justify-start" :class="railMode.value ? 'px-0' : ''">
            <template #leading>
              <UAvatar size="sm" :text="user?.name?.charAt(0) ?? 'N'" />
            </template>
            <template #default>
              <template v-if="!railMode.value">
                <span class="block truncate text-left">
                  <span class="block text-nexa-body-medium">{{ user?.name }}</span>
                  <span class="block text-nexa-caption text-muted">{{ user?.email }}</span>
                </span>
              </template>
            </template>
            <template #trailing>
              <UIcon v-if="!railMode.value" name="i-lucide-chevrons-up-down" class="size-3.5 text-muted" />
            </template>
          </UButton>
        </UDropdownMenu>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex min-w-0 flex-1 flex-col pt-[45px] md:pt-0">
      <header class="hidden h-14 shrink-0 items-center gap-3 border-b border-default px-6 md:flex">
        <UButton icon="i-lucide-panel-left" variant="ghost" size="sm" square :aria-label="t('shell.toggleSidebar')" @click="collapsed = !collapsed" />
        <UBreadcrumb :links="crumbs" />
        <div class="ms-auto flex items-center gap-2">
          <UButton icon="i-lucide-bell" variant="ghost" size="sm" square :aria-label="t('shell.notifications')" @click="notificationsOpen = true" />
          <UAvatar size="sm" :text="user?.name?.charAt(0) ?? 'N'" />
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto">
        <div class="flex flex-col gap-5 p-6 lg:px-8 lg:py-6 pb-24 md:pb-6">
          <slot />
        </div>
      </main>
    </div>

    <!-- Mobile bottom tab bar -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden">
      <UButton to="/" variant="ghost" size="sm" class="flex-1 flex-col gap-0.5" :active="route.path === '/'">
        <template #leading><UIcon name="i-lucide-home" class="size-5" /></template>
        {{ t('nav.home') }}
      </UButton>
      <UButton to="/m/vehicle/vehicle" variant="ghost" size="sm" class="flex-1 flex-col gap-0.5" :active="route.path.startsWith('/m/')">
        <template #leading><UIcon name="i-lucide-table" class="size-5" /></template>
        {{ t('nav.records') }}
      </UButton>
      <UButton to="/dashboards/dash_vehicle" variant="ghost" size="sm" class="flex-1 flex-col gap-0.5" :active="route.path.startsWith('/dashboards')">
        <template #leading><UIcon name="i-lucide-layout-dashboard" class="size-5" /></template>
        {{ t('nav.tasks') }}
      </UButton>
      <UButton to="/settings" variant="ghost" size="sm" class="flex-1 flex-col gap-0.5" :active="route.path.startsWith('/settings')">
        <template #leading><UIcon name="i-lucide-user" class="size-5" /></template>
        {{ t('nav.me') }}
      </UButton>
    </nav>

    <NxCommandPalette v-model:open="paletteOpen" />
    <USlideover v-model="notificationsOpen" :ui="{ content: 'max-h-none' }" side="right" class="w-full sm:w-[420px]">
      <NxNotifications @close="notificationsOpen = false" />
    </USlideover>
  </div>
</template>
