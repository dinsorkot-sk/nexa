<template>
  <NuxtLayout name="auth">
    <UiCard class="text-center">
      <div class="mx-auto mb-4 h-3 w-3 rounded-full bg-emerald-500" />
      <h1 class="text-2xl font-semibold">Nexa Builder</h1>
      <p class="mt-2 text-sm text-slate-400">Create and manage metadata-driven modules.</p>
      <div class="mt-6 flex justify-center gap-3">
        <UiButton @click="navigateTo('/modules')">Open builder</UiButton>
        <UiButton variant="secondary" @click="navigateTo('/app')">Open runtime</UiButton>
        <UiButton variant="ghost" @click="navigateTo('/login')">Sign in</UiButton>
      </div>
    </UiCard>
  </NuxtLayout>
</template>
