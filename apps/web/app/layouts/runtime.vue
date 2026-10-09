<script setup lang="ts">
const auth = useAuth();
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800 bg-slate-900">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <NuxtLink to="/app" class="text-lg font-semibold">Nexa Runtime</NuxtLink>
        <div class="flex items-center gap-3 text-sm">
          <NuxtLink to="/modules" class="text-slate-400 hover:text-slate-200">Builder</NuxtLink>
          <button type="button" class="text-slate-400 hover:text-slate-200" @click="auth.logout()">
            Sign out
          </button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
