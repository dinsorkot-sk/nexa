<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { MenuNode } from '~/utils/engine'

defineOptions({ name: 'DefaultLayout' })

const engine = useEngine()
const { session, signOut } = useSession()
const menuOpen = ref(false)

const { data, error, status, refresh } = await useAsyncData('menus', () => engine.menus(), { server: false })

function toItems(nodes: MenuNode[]): NavigationMenuItem[] {
  return nodes.map((m) => ({
    label: m.name,
    ...(m.action ? { to: `/a/${m.action}` } : {}),
    ...(m.children.length ? { children: toItems(m.children), defaultOpen: true } : {}),
  }))
}
const items = computed(() => toItems(data.value?.menus ?? []))
provide('menus', computed(() => data.value?.menus ?? []))

const route = useRoute()
watch(() => route.fullPath, () => { menuOpen.value = false })

async function leave() {
  signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-dvh bg-default">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-default focus:p-2">
      Skip to content
    </a>
    <header class="flex items-center gap-3 border-b border-default px-4 py-2">
      <UButton
        class="lg:hidden"
        icon="i-lucide-menu"
        color="neutral"
        variant="ghost"
        aria-label="Open navigation"
        @click="menuOpen = true"
      />
      <NuxtLink to="/" class="font-semibold text-highlighted">Nexa</NuxtLink>
      <NuxtLink to="/studio" class="text-sm text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-offset-2">Studio</NuxtLink>
      <span class="ms-auto text-sm text-muted" aria-label="Signed in as">
        {{ session?.tenant }} · user #{{ session?.uid }}
      </span>
      <UButton label="Sign out" color="neutral" variant="outline" size="sm" @click="leave" />
    </header>

    <div class="flex">
      <nav aria-label="Main" class="hidden w-60 shrink-0 border-e border-default p-3 lg:block">
        <USkeleton v-if="status === 'pending'" class="h-24 w-full" />
        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          title="Menu unavailable"
          :description="error.message"
          :actions="[{ label: 'Retry', onClick: () => refresh() }]"
        />
        <UNavigationMenu v-else orientation="vertical" :items="items" />
      </nav>

      <USlideover v-model:open="menuOpen" side="left" title="Navigation">
        <template #body>
          <UNavigationMenu orientation="vertical" :items="items" />
        </template>
      </USlideover>

      <main id="main" class="min-w-0 flex-1 p-4 sm:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
