<script setup lang="ts">
defineOptions({ name: 'HomePage' })

import type { ComputedRef } from 'vue'
import type { MenuNode } from '~/utils/engine'

const menus = inject<ComputedRef<MenuNode[]>>('menus', computed(() => []))

/** First-level apps with the actions reachable below them. */
const apps = computed(() => menus.value.map((m) => {
  const links: { name: string; to: string }[] = []
  const walk = (n: MenuNode) => {
    if (n.action) links.push({ name: n.name, to: `/a/${n.action}` })
    n.children.forEach(walk)
  }
  walk(m)
  return { name: m.name, links }
}))
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <h1 class="text-2xl font-semibold text-highlighted">Home</h1>
    <div v-if="!apps.length" class="rounded-lg border border-dashed border-default p-8 text-center">
      <p class="font-medium text-highlighted">No apps available yet</p>
      <p class="mt-1 text-sm text-muted">You do not have access to any menu. Ask an administrator to grant you a group.</p>
    </div>
    <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="app in apps" :key="app.name">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">{{ app.name }}</h2>
          </template>
          <ul class="space-y-1">
            <li v-for="l in app.links" :key="l.to">
              <ULink :to="l.to" class="text-primary hover:underline">{{ l.name }}</ULink>
            </li>
          </ul>
        </UCard>
      </li>
    </ul>
  </div>
</template>
