<script setup lang="ts">
import { NxButton } from '@nexa/ui';

import { useSession } from '~/composables/useSession';

const { session, logout } = useSession();

async function signOut() {
  await logout();
  await navigateTo('/login');
}
</script>

<template>
  <main class="min-h-screen bg-ui-bg p-8 text-ui-text">
    <header class="flex items-center justify-between">
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
  </main>
</template>
