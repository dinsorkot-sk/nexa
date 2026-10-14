<template>
  <UApp :locale="th">
    <main class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 class="text-2xl font-semibold">
        Nexa UI playground
      </h1>
      <div class="flex flex-wrap gap-3">
        <UButton>Primary</UButton>
        <UButton variant="outline">
          Outline
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
        >
          Ghost
        </UButton>
        <UButton color="error">
          Delete
        </UButton>
      </div>
      <UInput placeholder="ชื่อ / Name" />
      <UBadge>Badge</UBadge>
    </main>
  </UApp>
</template>

<script setup lang="ts">
import { th } from '@nuxt/ui/locale';
</script>
