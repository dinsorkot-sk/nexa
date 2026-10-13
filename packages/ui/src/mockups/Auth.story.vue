<script setup lang="ts">
/**
 * Mockup: Auth. Mirrors the real flow: sign in → (409 ORGANIZATION_REQUIRED) choose organization.
 * Sign up exists only outside production, so it carries an explicit notice. No API calls.
 */
import { ref } from 'vue';
import { Boxes, Building2, Check, Link2, ShieldCheck } from 'lucide-vue-next';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiAlert from '../components/UiAlert.vue';
import UiFieldWrapper from '../components/UiFieldWrapper.vue';

const email = ref('sakda@example.com');
const password = ref('');
const org = ref('dinsorkot-labs');
const busy = ref(false);
// Sample-only: submitting never calls the API, so the outcome is stated instead of implied.
const notice = ref(false);

function fake() {
  busy.value = true;
  notice.value = false;
  setTimeout(() => {
    busy.value = false;
    notice.value = true;
  }, 700);
}

const orgs = [
  { slug: 'dinsorkot-labs', name: 'Dinsorkot Labs', role: 'Owner' },
  { slug: 'fleet-ops', name: 'Fleet Ops', role: 'Member' },
];
const points = [
  { icon: Boxes, text: 'Model your business as modules, entities, and fields.' },
  { icon: Link2, text: 'Connect records with typed relations.' },
  { icon: ShieldCheck, text: 'Every change is audited and scoped to your organization.' },
];
</script>

<template>
  <Story
    title="Mockups/Auth"
    group="Mockups"
  >
    <template
      v-for="v in [
        { title: 'Sign in', mode: 'login' },
        { title: 'Choose organization', mode: 'org' },
        { title: 'Sign in — error', mode: 'error' },
        { title: 'Sign up (non-production)', mode: 'signup' },
      ]"
      :key="v.mode"
    >
      <Variant :title="v.title">
        <div class="grid min-h-[640px] overflow-hidden rounded-xl border border-border bg-background text-foreground lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <!-- Brand panel: intentionally quiet, hidden on narrow screens -->
          <aside class="hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
            <div class="flex items-center gap-3">
              <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">N</span>
              <span class="text-lg font-semibold tracking-tight">Nexa</span>
            </div>
            <div>
              <h2 class="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
                Build the business apps you actually need.
              </h2>
              <ul class="mt-8 space-y-4">
                <li
                  v-for="p in points"
                  :key="p.text"
                  class="flex items-start gap-3 text-sm text-foreground-muted"
                >
                  <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-success-soft text-success-soft-foreground"><component
                    :is="p.icon"
                    class="size-4"
                    aria-hidden="true"
                  /></span>{{ p.text }}
                </li>
              </ul>
            </div>
            <p class="text-xs text-foreground-subtle">
              Mockup · sample data only
            </p>
          </aside>

          <main class="flex items-center justify-center p-6 sm:p-10">
            <div class="w-full max-w-sm space-y-6">
              <div class="flex items-center gap-3 lg:hidden">
                <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">N</span>
                <span class="text-lg font-semibold">Nexa</span>
              </div>

              <!-- Sign in -->
              <template v-if="v.mode === 'login' || v.mode === 'error'">
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">
                    Sign in
                  </h1>
                  <p class="mt-1 text-sm text-foreground-muted">
                    Use the email you registered with.
                  </p>
                </div>
                <UiAlert
                  v-if="v.mode === 'error'"
                  tone="danger"
                >
                  Email or password is incorrect.
                </UiAlert>
                <form
                  class="space-y-4"
                  @submit.prevent="fake"
                >
                  <UiFieldWrapper
                    label="Email"
                    required
                  >
                    <template #default="{ id, describedBy }">
                      <UiInput
                        :id="id"
                        v-model="email"
                        type="email"
                        autocomplete="email"
                        :aria-describedby="describedBy"
                      />
                    </template>
                  </UiFieldWrapper>
                  <UiFieldWrapper
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
                    size="lg"
                    :loading="busy"
                  >
                    Sign in
                  </UiButton>
                </form>
                <UiAlert
                  v-if="notice"
                  tone="neutral"
                >
                  Sample only: nothing was sent and no session was created.
                </UiAlert>
                <p class="text-sm text-foreground-muted">
                  New here? <span class="font-medium text-foreground-subtle">Create an account (see the sign-up variant)</span>
                </p>
              </template>

              <!-- Organization picker (server answered 409 ORGANIZATION_REQUIRED) -->
              <template v-else-if="v.mode === 'org'">
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">
                    Choose an organization
                  </h1>
                  <UiAlert
                    v-if="notice"
                    tone="neutral"
                    class="mt-3"
                  >
                    Sample only: nothing was sent and no organization was selected.
                  </UiAlert>
                  <p class="mt-1 text-sm text-foreground-muted">
                    Your account belongs to more than one. You can switch later.
                  </p>
                </div>
                <form
                  class="space-y-4"
                  @submit.prevent="fake"
                >
                  <fieldset class="space-y-2">
                    <legend class="sr-only">
                      Organization
                    </legend>
                    <label
                      v-for="o in orgs"
                      :key="o.slug"
                      :class="[
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                        org === o.slug ? 'border-primary bg-success-soft' : 'border-border bg-surface hover:border-border-strong',
                      ]"
                    >
                      <input
                        v-model="org"
                        type="radio"
                        name="org"
                        :value="o.slug"
                        class="sr-only"
                      >
                      <span class="flex size-9 items-center justify-center rounded-lg bg-surface-muted"><Building2
                        class="size-4"
                        aria-hidden="true"
                      /></span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium">{{ o.name }}</span>
                        <span class="block text-xs text-foreground-muted">{{ o.slug }} · {{ o.role }}</span>
                      </span>
                      <Check
                        v-if="org === o.slug"
                        class="size-4 text-primary"
                        aria-hidden="true"
                      />
                    </label>
                  </fieldset>
                  <UiButton
                    type="submit"
                    class="w-full"
                    size="lg"
                    :loading="busy"
                  >
                    Continue
                  </UiButton>
                </form>
              </template>

              <!-- Sign up -->
              <template v-else>
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">
                    Create your workspace
                  </h1>
                  <p class="mt-1 text-sm text-foreground-muted">
                    You become the owner of a new organization.
                  </p>
                </div>
                <UiAlert tone="warning">
                  Public sign up is available in development only. In production, accounts are created by invitation.
                </UiAlert>
                <form
                  class="space-y-4"
                  @submit.prevent="fake"
                >
                  <UiFieldWrapper label="Your name">
                    <template #default="{ id }">
                      <UiInput
                        :id="id"
                        autocomplete="name"
                      />
                    </template>
                  </UiFieldWrapper>
                  <UiFieldWrapper
                    label="Organization name"
                    required
                  >
                    <template #default="{ id }">
                      <UiInput
                        :id="id"
                        autocomplete="organization"
                      />
                    </template>
                  </UiFieldWrapper>
                  <UiFieldWrapper
                    label="Email"
                    required
                  >
                    <template #default="{ id }">
                      <UiInput
                        :id="id"
                        type="email"
                        autocomplete="email"
                      />
                    </template>
                  </UiFieldWrapper>
                  <UiFieldWrapper
                    label="Password"
                    required
                    help-text="Use a long passphrase you do not use elsewhere."
                  >
                    <template #default="{ id, describedBy }">
                      <UiInput
                        :id="id"
                        type="password"
                        autocomplete="new-password"
                        :aria-describedby="describedBy"
                      />
                    </template>
                  </UiFieldWrapper>
                  <UiButton
                    type="submit"
                    class="w-full"
                    size="lg"
                    :loading="busy"
                  >
                    Create account
                  </UiButton>
                </form>
                <UiAlert
                  v-if="notice"
                  tone="neutral"
                >
                  Sample only: nothing was sent and no account was created.
                </UiAlert>
                <p class="text-sm text-foreground-muted">
                  Already registered? <span class="font-medium text-foreground-subtle">Sign in (see the sign-in variant)</span>
                </p>
              </template>
            </div>
          </main>
        </div>
      </Variant>
    </template>
  </Story>
</template>
