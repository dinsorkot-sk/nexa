<script setup lang="ts">
import type { ModalSlots } from '@nuxt/ui'

const props = defineProps<{
  title: string
  description?: string
}>()

const open = defineModel<boolean>('open', { required: true })

defineSlots<Pick<ModalSlots, 'default' | 'body' | 'footer'>>()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
    :ui="{ footer: 'justify-end' }"
  >
    <template v-if="$slots.default" #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
    <template v-if="$slots.body" #body="slotProps">
      <slot name="body" v-bind="slotProps" />
    </template>
    <template v-if="$slots.footer" #footer="slotProps">
      <slot name="footer" v-bind="slotProps" />
    </template>
  </UModal>
</template>
