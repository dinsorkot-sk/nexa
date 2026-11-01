<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { register } = useAuth();

useHead({ title: t('auth.signupTitle') });

const isProduction = computed(() => useRoute().query.env === 'production');

const schema = z.object({
  name: z.string().min(1, t('auth.errors.nameRequired')),
  email: z.string().email(t('auth.errors.email')),
  password: z.string().min(12, t('auth.errors.passwordMin')),
  organization: z.string().min(1, t('auth.errors.orgRequired')),
});
type Schema = z.output<typeof schema>;

const state = ref<Schema>({ name: '', email: '', password: '', organization: '' });
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await register(state.value.name, state.value.email, state.value.password, state.value.organization);
    navigateTo('/select-org');
  } catch (e) {
    error.value = t('auth.signupFailed');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UBanner v-if="!isProduction" color="info" variant="soft" :title="t('auth.devEnvironment')" />

    <UAlert v-if="isProduction" color="warning" variant="soft" :title="t('auth.signupDisabledTitle')" :description="t('auth.signupDisabledHint')" />

    <UForm v-else :schema="schema" :state="state" class="flex flex-col gap-4" @submit="submit">
      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UFormField :label="t('auth.displayName')" name="name" required>
        <UInput v-model="state.name" :placeholder="t('auth.displayNamePlaceholder')" :disabled="loading" autocomplete="name" />
      </UFormField>

      <UFormField :label="t('auth.email')" name="email" required>
        <UInput v-model="state.email" type="email" :placeholder="t('auth.emailPlaceholder')" :disabled="loading" autocomplete="email" />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password" :hint="t('auth.passwordMinHint')" required>
        <UInput v-model="state.password" type="password" :placeholder="t('auth.passwordPlaceholder')" :disabled="loading" autocomplete="new-password" />
      </UFormField>

      <UFormField :label="t('auth.organization')" name="organization" required>
        <UInput v-model="state.organization" :placeholder="t('auth.organizationPlaceholder')" :disabled="loading" />
      </UFormField>

      <p class="text-nexa-small text-muted">{{ t('auth.firstAccountOwner') }}</p>

      <UButton type="submit" color="primary" size="lg" block :loading="loading" :label="t('auth.signupButton')" />
    </UForm>

    <p class="text-center text-nexa-body text-muted">
      {{ t('auth.hasAccount') }}
      <ULink to="/login" class="text-primary">{{ t('auth.loginLink') }}</ULink>
    </p>
  </div>
</template>
