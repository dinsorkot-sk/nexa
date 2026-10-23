<script setup lang="ts">
import { NxAlert, NxButton, NxCard, NxFormField, NxInput } from '@nexa/ui';

import { ApiError } from '~/composables/useApi';
import { useSession, type Organization } from '~/composables/useSession';

const { login } = useSession();
const email = ref('');
const password = ref('');
const organizations = ref<Organization[]>([]);
const error = ref('');
const busy = ref(false);

async function submit(organizationId?: string) {
  error.value = '';
  busy.value = true;
  try {
    const choices = await login(email.value, password.value, organizationId);
    if (choices) organizations.value = choices;
    else await navigateTo('/');
  } catch (caught) {
    error.value = caught instanceof ApiError && caught.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-ui-bg p-4 text-ui-text">
    <NxCard class="w-full max-w-sm p-6">
      <h1 class="mb-4 text-xl font-bold">
        เข้าสู่ระบบ Nexa
      </h1>
      <NxAlert
        v-if="error"
        color="error"
        :description="error"
        :dismissible="false"
        class="mb-4"
      />
      <section v-if="organizations.length">
        <p class="mb-2 text-sm">
          เลือกองค์กร
        </p>
        <ul class="flex flex-col gap-2">
          <li
            v-for="organization in organizations"
            :key="organization.id"
          >
            <NxButton
              variant="outline"
              class="w-full"
              :loading="busy"
              @click="submit(organization.id)"
            >
              {{ organization.name }}
            </NxButton>
          </li>
        </ul>
      </section>
      <form
        v-else
        class="flex flex-col gap-4"
        @submit.prevent="submit()"
      >
        <NxFormField
          id="login-email"
          label="อีเมล"
          required
        >
          <NxInput
            id="login-email"
            v-model="email"
            type="email"
          />
        </NxFormField>
        <NxFormField
          id="login-password"
          label="รหัสผ่าน"
          required
        >
          <NxInput
            id="login-password"
            v-model="password"
            type="password"
          />
        </NxFormField>
        <NxButton
          type="submit"
          :loading="busy"
        >
          เข้าสู่ระบบ
        </NxButton>
      </form>
    </NxCard>
  </main>
</template>
