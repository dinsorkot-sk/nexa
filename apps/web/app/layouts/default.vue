<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header v-if="principal" class="border-b border-slate-800">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <NuxtLink to="/modules" class="flex items-center space-x-2">
          <div class="h-2 w-2 rounded-full bg-emerald-500"></div>
          <span class="text-lg font-bold tracking-tight">Nexa Builder</span>
        </NuxtLink>
        <div class="flex items-center space-x-4">
          <NuxtLink to="/app" class="text-sm text-slate-400 hover:text-slate-200">Runtime</NuxtLink>
          <span class="text-sm text-slate-400">{{ principal.name || principal.userId }}</span>
          <UiButton variant="ghost" size="sm" @click="logout">Sign out</UiButton>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { principal, logout } = useAuth();
</script>
