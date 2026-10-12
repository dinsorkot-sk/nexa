<script setup lang="ts">
/**
 * Mockup: Auth / Login page
 * Purpose: Show sign-in screen using `@nexa/ui` primitives. Uses mock credentials
 * only — no API calls.
 */
import { ref } from 'vue';
import UiCard from '../components/UiCard.vue';
import UiInput from '../components/UiInput.vue';
import UiButton from '../components/UiButton.vue';
import UiFieldWrapper from '../components/UiFieldWrapper.vue';

const email = ref('demo@example.com');
const password = ref('demo-password');
const busy = ref(false);
const error = ref<string | null>(null);
const showOrgPicker = ref(false);

function mockLogin() {
  busy.value = true;
  error.value = null;
  setTimeout(() => {
    busy.value = false;
    showOrgPicker.value = true;
  }, 600);
}

function mockPickOrg() {
  busy.value = true;
  setTimeout(() => (busy.value = false), 600);
}
</script>

<template>
  <Story
    title="Mockups/Auth"
    group="Mockups"
  >
    <Variant title="Login">
      <div class="flex min-h-[60vh] items-center justify-center bg-background p-4">
        <UiCard class="w-full max-w-md space-y-6 p-6">
          <div>
            <h1 class="text-2xl font-semibold">Sign in to Nexa</h1>
            <p class="mt-2 text-sm text-foreground-muted">Use your organization email to continue.</p>
          </div>

          <form
            v-if="!showOrgPicker"
            class="space-y-4"
            @submit.prevent="mockLogin"
          >
            <UiFieldWrapper
              id="email"
              label="Email"
              required
              :error="error ?? undefined"
            >
              <template #default="{ id, describedBy, invalid }">
                <UiInput
                  :id="id"
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  :invalid="invalid"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="password"
              label="Password"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiButton
              type="submit"
              class="w-full"
              :loading="busy"
            >
              Sign in
            </UiButton>
          </form>

          <form
            v-else
            class="space-y-4"
            @submit.prevent="mockPickOrg"
          >
            <h2 class="text-lg font-semibold">Choose an organization</h2>
            <p class="text-sm text-foreground-muted">You belong to multiple organizations.</p>

            <ul class="space-y-2">
              <li>
                <label class="flex items-center justify-between rounded-lg border border-border bg-surface-muted p-3">
                  <span class="text-sm">Dinsorkot Labs <span class="text-foreground-muted">(dinsorkot-labs)</span></span>
                  <input
                    name="org"
                    type="radio"
                    checked
                    class="h-4 w-4"
                  >
                </label>
              </li>
              <li>
                <label class="flex items-center justify-between rounded-lg border border-border p-3">
                  <span class="text-sm">Fleet Ops <span class="text-foreground-muted">(fleet-ops)</span></span>
                  <input
                    name="org"
                    type="radio"
                    class="h-4 w-4"
                  >
                </label>
              </li>
            </ul>

            <UiButton
              type="submit"
              class="w-full"
              :loading="busy"
            >
              Continue
            </UiButton>
          </form>

          <p class="text-sm text-foreground-muted">
            Don't have an account? <span class="text-primary underline underline-offset-2">Create one</span>
          </p>
        </UiCard>
      </div>
    </Variant>

    <Variant title="Signup">
      <div class="flex min-h-[70vh] items-center justify-center bg-background p-4">
        <UiCard class="w-full max-w-md space-y-6 p-6">
          <div>
            <h1 class="text-2xl font-semibold">Create your account</h1>
            <p class="mt-2 text-sm text-foreground-muted">Start building metadata-driven modules.</p>
          </div>

          <form class="space-y-4">
            <UiFieldWrapper
              id="display-name"
              label="Name"
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  value="Dinsorkot"
                  autocomplete="name"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="org-name"
              label="Organization name"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  value="Dinsorkot Labs"
                  autocomplete="organization"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="org-slug"
              label="Organization slug"
              required
              help-text="Used in your organization URL. Use 3–50 lowercase letters, numbers, or hyphens."
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  value="dinsorkot-labs"
                  autocomplete="off"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="signup-email"
              label="Email"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  value="sk.dinsorkot@gmail.com"
                  type="email"
                  autocomplete="email"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="signup-password"
              label="Password"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  value="••••••••"
                  type="password"
                  autocomplete="new-password"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiButton
              type="submit"
              class="w-full"
            >
              Create account
            </UiButton>
          </form>

          <p class="text-sm text-foreground-muted">
            Already registered? <span class="text-primary underline underline-offset-2">Sign in</span>
          </p>
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>
