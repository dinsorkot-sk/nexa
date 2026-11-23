<script setup lang="ts">
defineOptions({ name: 'DevLoginPage' })

import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: false })

const schema = z.object({
  tenant: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, digits, - or _.'),
  uid: z.coerce.number().int('Enter a whole number.').min(2, 'User ids start at 2 (the administrator is usually 2).'),
})
type Input = z.output<typeof schema>

const state = reactive({ tenant: 'dev', uid: '2' })
const submitting = ref(false)
const failure = ref<string | null>(null)
const { signIn, signOut } = useSession()
const engine = useEngine()
const route = useRoute()

async function submit(e: FormSubmitEvent<Input>) {
  submitting.value = true
  failure.value = null
  signIn({ tenant: e.data.tenant, uid: e.data.uid })
  try {
    await engine.menus() // verifies the tenant and the user
    // same-site paths only: '/x' but never '//host' or '/host'
    const next = typeof route.query.next === 'string' && /^\/(?![/\\])/.test(route.query.next) ? route.query.next : '/'
    await navigateTo(next)
  } catch (err) {
    signOut()
    failure.value = err instanceof ApiError && err.forbidden
      ? 'That tenant or user does not exist, or the user is archived.'
      : (err as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer as="main" class="flex min-h-dvh max-w-md flex-col justify-center gap-6 py-12">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold text-highlighted">Sign in to Nexa</h1>
      <p class="text-sm text-muted">
        Development sign-in: choose a tenant and a user id. This works only when the API runs with NEXA_DEV_AUTH=1.
      </p>
    </header>
    <UAlert v-if="failure" color="error" variant="subtle" title="Could not sign in" :description="failure" role="alert" />
    <NexaForm :schema="schema" :state="state" :disabled="submitting" @submit="submit">
      <UFormField label="Tenant" name="tenant" required>
        <UInput v-model="state.tenant" autocomplete="organization" class="w-full" />
      </UFormField>
      <UFormField label="User id" name="uid" required help="The administrator created by the base module is user 2.">
        <UInput v-model="state.uid" type="number" inputmode="numeric" min="2" class="w-full" />
      </UFormField>
      <UButton type="submit" label="Sign in" :loading="submitting" block />
    </NexaForm>
  </UContainer>
</template>
