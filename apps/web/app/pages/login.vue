<template>
  <NuxtLayout name="auth">
    <UiCard>
      <h1 class="text-2xl font-semibold">Sign in</h1>
      <p class="mt-2 text-sm text-slate-400">{{ organizations ? 'Select an organization to continue.' : 'Sign in to manage your Nexa modules.' }}</p>

      <form v-if="!organizations" class="mt-6 space-y-4" @submit.prevent="submit">
        <div><UiLabel for="email">Email</UiLabel><UiInput id="email" v-model="email" type="email" autocomplete="email" required /></div>
        <div><UiLabel for="password">Password</UiLabel><UiInput id="password" v-model="password" type="password" autocomplete="current-password" required /></div>
        <BuilderError :error="error" />
        <UiButton type="submit" class="w-full" :loading="busy">Sign in</UiButton>
      </form>

      <div v-else class="mt-6 space-y-2" role="radiogroup" aria-label="Organization">
        <button
          v-for="organization in organizations"
          :key="organization.id"
          type="button"
          role="radio"
          :aria-checked="selectedOrganizationId === organization.id"
          class="w-full rounded-md border px-4 py-3 text-left transition"
          :class="selectedOrganizationId === organization.id ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-700 hover:border-slate-500'"
          @click="selectedOrganizationId = organization.id"
        >
          <span class="block text-sm font-medium">{{ organization.name }}</span>
          <span class="block text-xs text-slate-400">{{ organization.slug }}</span>
        </button>
        <p v-if="error" role="alert" class="text-sm text-rose-400">{{ error.message }}</p>
        <UiButton type="button" class="w-full" :loading="busy" :disabled="!selectedOrganizationId" @click="submitSelected">Continue</UiButton>
        <UiButton variant="ghost" class="w-full" :disabled="busy" @click="backToCredentials">Use a different account</UiButton>
      </div>

      <p v-if="!organizations" class="mt-5 text-sm text-slate-400">New to Nexa? <NuxtLink class="text-emerald-400 hover:underline" to="/signup">Create an account</NuxtLink></p>
    </UiCard>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
import type { LoginOrganization } from '../utils/auth-controller';
const route = useRoute();
const { login } = useAuth();
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);
const organizations = ref<LoginOrganization[] | null>(null);
const selectedOrganizationId = ref('');

const redirectTarget = () => (typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/modules');

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    await login(email.value, password.value);
    await navigateTo(redirectTarget());
  } catch (caught) {
    const normalized = normalizeApiError(caught);
    // 409 ORGANIZATION_REQUIRED: details carries the membership list.
    if (normalized.code === 'ORGANIZATION_REQUIRED' && Array.isArray(normalized.details) && normalized.details.length) {
      organizations.value = normalized.details as LoginOrganization[];
      selectedOrganizationId.value = organizations.value[0]?.id ?? '';
    } else {
      error.value = normalized;
    }
  } finally {
    busy.value = false;
  }
}

async function submitSelected() {
  if (!selectedOrganizationId.value) return;
  busy.value = true;
  error.value = null;
  try {
    await login(email.value, password.value, selectedOrganizationId.value);
    await navigateTo(redirectTarget());
  } catch (caught) {
    error.value = normalizeApiError(caught);
  } finally {
    busy.value = false;
  }
}

function backToCredentials() {
  organizations.value = null;
  selectedOrganizationId.value = '';
  password.value = '';
  error.value = null;
}
</script>
