<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { login } = useAuth();
const { colorMode } = useNexa();

useHead({ title: t('auth.loginTitle') });

const schema = z.object({
  email: z.string().email(t('auth.errors.email')),
  password: z.string().min(1, t('auth.errors.passwordRequired')),
});
type Schema = z.output<typeof schema>;

const state = ref<Schema>({ email: '', password: '' });
const rememberMe = ref(false);
const error = ref('');
const fieldError = ref('');
const attemptsLeft = ref(3);
const rateLimited = ref(false);
const countdown = ref(292);
const loading = ref(false);

let timer: ReturnType<typeof setInterval> | undefined;
onBeforeUnmount(() => clearInterval(timer));

function startRateLimit() {
  rateLimited.value = true;
  countdown.value = 292;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      rateLimited.value = false;
      attemptsLeft.value = 3;
    }
  }, 1000);
}

const countdownLabel = computed(() => {
  const m = Math.floor(countdown.value / 60);
  const s = countdown.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

async function submit() {
  error.value = '';
  fieldError.value = '';
  loading.value = true;
  try {
    await login(state.value.email, state.value.password, rememberMe.value);
    navigateTo('/');
  } catch (e) {
    attemptsLeft.value -= 1;
    if (attemptsLeft.value <= 0) {
      startRateLimit();
    } else {
      error.value = t('auth.loginFailed');
      fieldError.value = t('auth.attemptsLeft', { n: attemptsLeft.value });
    }
  } finally {
    loading.value = false;
  }
}

const route = useRoute();
if (route.query.demo === 'rate') startRateLimit();
</script>

<template>
  <UForm :schema="schema" :state="state" class="flex flex-col gap-4" @submit="submit">
    <UAlert v-if="error" color="error" variant="soft" :title="error" :description="fieldError" />
    <UAlert v-if="rateLimited" color="warning" variant="soft" :title="t('auth.rateLimitedTitle')" :description="t('auth.rateLimitedHint', { countdown: countdownLabel })" />

    <UFormField :label="t('auth.email')" name="email" required>
      <UInput v-model="state.email" type="email" :placeholder="t('auth.emailPlaceholder')" :disabled="loading || rateLimited" autocomplete="email" />
    </UFormField>

    <UFormField :label="t('auth.password')" name="password" :hint="t('auth.passwordHint')" required>
      <UInput v-model="state.password" type="password" :placeholder="t('auth.passwordPlaceholder')" :disabled="loading || rateLimited" autocomplete="current-password" />
    </UFormField>

    <div class="flex items-center justify-between">
      <UCheckbox v-model="rememberMe" :label="t('auth.rememberMe')" :disabled="loading || rateLimited" />
      <ULink to="/forgot-password" class="text-nexa-body text-primary">{{ t('auth.forgotPassword') }}</ULink>
    </div>

    <UButton type="submit" color="primary" size="lg" block :loading="loading" :disabled="rateLimited" :label="loading ? t('auth.signingIn') : t('auth.loginButton')" />

    <USeparator>{{ t('auth.orContinueWith') }}</USeparator>

    <UButton variant="outline" size="lg" block disabled>
      <template #leading>
        <UIcon name="i-lucide-key-round" class="size-4" />
      </template>
      {{ t('auth.sso') }}
    </UButton>

    <p class="text-center text-nexa-body text-muted">
      {{ t('auth.noAccount') }}
      <ULink to="/register" class="text-primary">{{ t('auth.signupLink') }}</ULink>
    </p>
  </UForm>
</template>
