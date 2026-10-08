<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div><NuxtLink to="/modules" class="text-sm text-slate-400 hover:text-white">← Modules</NuxtLink><h1 class="mt-3 text-3xl font-semibold">Create module</h1><p class="mt-2 text-slate-400">Start with a name, stable ID, and semantic version.</p></div>
    <UiCard><ModuleForm @saved="created" /></UiCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' });
function created(module: { id: string }) { return navigateTo(`/modules/${encodeURIComponent(module.id)}`); }
</script>
