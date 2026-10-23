<script setup lang="ts">
import type { EntityDefinition } from '@nexa/meta';
import { NxAlert, NxCard, NxEmptyState, NxSpinner } from '@nexa/ui';

import { api } from '~/composables/useApi';

const route = useRoute();
const moduleId = String(route.params.moduleId);
const entities = ref<EntityDefinition[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    entities.value = await api<EntityDefinition[]>(`/modules/${moduleId}/entities`);
  } catch {
    error.value = 'โหลดข้อมูลไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <NuxtLink
      to="/"
      class="text-sm text-ui-text-muted"
    >
      ← โมดูล
    </NuxtLink>
    <NxAlert
      v-if="error"
      color="error"
      :description="error"
      :dismissible="false"
      class="mt-4"
    />
    <NxSpinner v-else-if="loading" />
    <NxEmptyState
      v-else-if="!entities.length"
      title="โมดูลนี้ยังไม่มีเอนทิตี"
    />
    <ul
      v-else
      class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="entity in entities"
        :key="entity.id"
      >
        <NuxtLink :to="`/modules/${moduleId}/entities/${entity.id}`">
          <NxCard class="p-4 font-semibold">
            {{ entity.label }}
          </NxCard>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
