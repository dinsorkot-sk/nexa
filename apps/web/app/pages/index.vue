<script setup lang="ts">
import type { ModuleDefinition } from '@nexa/meta';
import { NxAlert, NxButton, NxCard, NxEmptyState, NxSpinner } from '@nexa/ui';

import { api } from '~/composables/useApi';
import { useSession } from '~/composables/useSession';

const { session, logout } = useSession();
const modules = ref<ModuleDefinition[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    modules.value = await api<ModuleDefinition[]>('/modules?status=enabled');
  } catch {
    error.value = 'โหลดโมดูลไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
});

async function signOut() {
  await logout();
  await navigateTo('/login');
}
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <header class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Nexa
      </h1>
      <div class="flex items-center gap-3">
        <span class="text-sm">{{ session?.name }}</span>
        <NxButton
          variant="outline"
          size="sm"
          @click="signOut"
        >
          ออกจากระบบ
        </NxButton>
      </div>
    </header>
    <NxAlert
      v-if="error"
      color="error"
      :description="error"
      :dismissible="false"
    />
    <NxSpinner v-else-if="loading" />
    <NxEmptyState
      v-else-if="!modules.length"
      title="ยังไม่มีโมดูลที่เปิดใช้งาน"
    />
    <ul
      v-else
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="module in modules"
        :key="module.id"
      >
        <NuxtLink :to="`/modules/${module.id}`">
          <NxCard class="p-4">
            <h2 class="font-semibold">
              {{ module.name }}
            </h2>
            <p class="text-sm text-ui-text-muted">
              {{ module.description }}
            </p>
          </NxCard>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
