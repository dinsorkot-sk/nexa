<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { computed, reactive, ref } from 'vue'
import { z } from 'zod'
import { getStudioApiErrorMessage, useStudioApi } from '../composables/useStudioApi'

defineOptions({ name: 'StudioApplicationLayout' })

const route = useRoute()
const studioApi = useStudioApi()
const navigation = [
  { label: 'Studio', icon: 'i-lucide-panels-top-left', to: '/studio' },
]
const title = computed(() => {
  if (route.path.startsWith('/studio/models/')) return String(route.params.name ?? 'Model designer')
  return 'Studio'
})
const pending = ref(false)
const loginError = ref('')
const loginErrorTitle = ref('Unable to sign in')
const credentials = reactive({ tenant: '', login: '', password: '' })
const loginSchema = z.object({
  tenant: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, 'Enter a valid tenant identifier.'),
  login: z.string().min(1, 'Enter your login.').max(120),
  password: z.string().min(1, 'Enter your password.').max(1024),
})

async function signIn(event: FormSubmitEvent<z.infer<typeof loginSchema>>) {
  pending.value = true
  loginError.value = ''
  loginErrorTitle.value = 'Unable to sign in'
  try {
    await studioApi.login(event.data)
    credentials.password = ''
  } catch (error) {
    loginError.value = getStudioApiErrorMessage(error)
  } finally {
    pending.value = false
  }
}

async function signOut() {
  loginError.value = ''
  try {
    await studioApi.logout()
  } catch (error) {
    loginError.value = getStudioApiErrorMessage(error)
    loginErrorTitle.value = 'Sign out could not be confirmed'
  }
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <div class="flex items-center justify-between gap-2 px-2">
          <NuxtLink to="/studio" class="font-semibold text-highlighted">
            Nexa Studio
          </NuxtLink>
          <UDashboardSidebarCollapse />
        </div>
      </template>
      <UNavigationMenu :items="navigation" orientation="vertical" />
      <template #footer>
        <div v-if="studioApi.session.value" class="space-y-3">
          <p class="truncate px-2 text-xs text-muted">
            {{ studioApi.session.value.login }} · {{ studioApi.session.value.tenant }}
          </p>
          <UAlert
            v-if="loginError"
            color="error"
            variant="subtle"
            title="Sign out failed"
            :description="loginError"
          />
          <UButton
            label="Sign out"
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            block
            @click="signOut"
          />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="title" />
      </template>
      <template #body>
        <main class="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
          <UCard v-if="!studioApi.session.value" class="mx-auto w-full max-w-lg">
            <template #header>
              <div>
                <h1 class="text-lg font-semibold text-highlighted">
                  Sign in to Studio
                </h1>
                <p class="mt-1 text-sm text-muted">
                  Use a Settings administrator account for this tenant.
                </p>
              </div>
            </template>
            <UAlert
              v-if="loginError"
              color="error"
              variant="subtle"
              :title="loginErrorTitle"
              :description="loginError"
              class="mb-4"
            />
            <UForm :schema="loginSchema" :state="credentials" class="space-y-4" @submit="signIn">
              <UFormField label="Tenant" name="tenant" required>
                <UInput v-model="credentials.tenant" autocomplete="organization" class="w-full" />
              </UFormField>
              <UFormField label="Login" name="login" required>
                <UInput v-model="credentials.login" autocomplete="username" class="w-full" />
              </UFormField>
              <UFormField label="Password" name="password" required>
                <UInput
                  v-model="credentials.password"
                  type="password"
                  autocomplete="current-password"
                  class="w-full"
                />
              </UFormField>
              <UButton type="submit" label="Sign in" :loading="pending" block />
            </UForm>
            <p class="mt-4 text-xs text-muted">
              The session stays in memory and ends when this page is refreshed or you sign out.
            </p>
          </UCard>
          <slot v-else />
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
