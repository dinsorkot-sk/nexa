<script setup lang="ts" generic="S extends FormSchema">
import type { FormData, FormEmits, FormSchema, FormSlots, FormState } from '@nuxt/ui'

const props = defineProps<{
  schema: S
  state: FormState<S>
  disabled?: boolean
}>()

const emit = defineEmits<FormEmits<S>>()

defineSlots<FormSlots>()

function submit(event: SubmitEvent & { data: FormData<S> }) {
  emit('submit', event)
}
</script>

<template>
  <UForm
    :schema="props.schema"
    :state="props.state"
    :disabled="props.disabled"
    class="space-y-4"
    @submit="submit"
    @error="emit('error', $event)"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </UForm>
</template>
