<template>
  <NuxtLayout name="auth">
    <UiCard>
      <h1 class="text-2xl font-semibold">Create your account</h1>
      <p class="mt-2 text-sm text-slate-400">Start building metadata-driven modules.</p>
      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div><UiLabel for="display-name">Name</UiLabel><UiInput id="display-name" v-model="displayName" autocomplete="name" /></div>
        <div><UiLabel for="email">Email</UiLabel><UiInput id="email" v-model="email" type="email" autocomplete="email" required /></div>
        <div><UiLabel for="password">Password</UiLabel><UiInput id="password" v-model="password" type="password" autocomplete="new-password" minlength="8" required /></div>
        <BuilderError :error="error" />
        <UiButton type="submit" class="w-full" :loading="busy">Create account</UiButton>
      </form>
      <p class="mt-5 text-sm text-slate-400">Already registered? <NuxtLink class="text-emerald-400 hover:underline" to="/login">Sign in</NuxtLink></p>
    </UiCard>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
const { signup } = useAuth();
const displayName = ref('');
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    await signup(email.value, password.value, displayName.value || undefined);
    await navigateTo('/modules');
  } catch (caught) {
    error.value = normalizeApiError(caught);
  } finally {
    busy.value = false;
  }
}
</script>
