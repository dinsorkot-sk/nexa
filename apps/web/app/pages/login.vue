<template>
  <NuxtLayout name="auth">
    <UiCard>
      <h1 class="text-2xl font-semibold">Sign in</h1>
      <p class="mt-2 text-sm text-slate-400">Sign in to manage your Nexa modules.</p>
      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div><UiLabel for="email">Email</UiLabel><UiInput id="email" v-model="email" type="email" autocomplete="email" required /></div>
        <div><UiLabel for="password">Password</UiLabel><UiInput id="password" v-model="password" type="password" autocomplete="current-password" required /></div>
        <BuilderError :error="error" />
        <UiButton type="submit" class="w-full" :loading="busy">Sign in</UiButton>
      </form>
      <p class="mt-5 text-sm text-slate-400">New to Nexa? <NuxtLink class="text-emerald-400 hover:underline" to="/signup">Create an account</NuxtLink></p>
    </UiCard>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
const route = useRoute();
const { login } = useAuth();
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    await login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/modules';
    await navigateTo(redirect);
  } catch (caught) {
    error.value = normalizeApiError(caught);
  } finally {
    busy.value = false;
  }
}
</script>
