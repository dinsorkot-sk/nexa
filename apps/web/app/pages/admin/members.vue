<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const search = ref('');
const roleFilter = ref('all');
const inviteOpen = ref(false);
const emails = ref('');
const inviteRole = ref('member');
const toast = useToast();

const members = computed(() => fixtureMembers.filter((m) =>
  (roleFilter.value === 'all' || m.role === roleFilter.value)
  && (!search.value || m.name.toLowerCase().includes(search.value.toLowerCase()) || m.email.includes(search.value.toLowerCase())),
));

function sendInvites() {
  inviteOpen.value = false;
  emails.value = '';
  toast.add({ title: t('admin.members.invitedToast'), color: 'success' });
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <NxPageHeader icon="i-lucide-users" :title="t('nav.members')" :description="t('admin.members.headerHint', { members: 24, pending: 3 })">
      <template #actions>
        <UButton color="primary" icon="i-lucide-mail-plus" :label="t('admin.members.invite')" @click="inviteOpen = true" />
      </template>
    </NxPageHeader>

    <div class="flex items-center gap-2">
      <UInput v-model="search" :placeholder="t('common.search')" class="w-56" clearable>
        <template #leading><UIcon name="i-lucide-search" class="size-4" /></template>
      </UInput>
      <USelect v-model="roleFilter" :items="[{ label: t('common.all'), value: 'all' }, ...fixtureRoles.map((r) => ({ label: r.name, value: r.id }))]" class="w-40" />
    </div>

    <div class="overflow-x-auto rounded-xl border border-default">
      <table class="min-w-full">
        <thead>
          <tr class="border-b border-default bg-[--ui-bg-muted]">
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.members.member') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.role') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('common.status') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.members.modules') }}</th>
            <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('admin.members.lastActive') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in members" :key="m.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <UAvatar size="sm" :text="m.name.charAt(0)" />
                <div>
                  <p class="text-nexa-body-medium text-highlighted">{{ m.name }}</p>
                  <p class="text-nexa-caption text-dimmed">{{ m.email }}</p>
                </div>
              </div>
            </td>
            <td class="px-3 py-2"><UBadge color="neutral" variant="soft" size="sm">{{ m.role }}</UBadge></td>
            <td class="px-3 py-2">
              <UBadge :color="m.status === 'active' ? 'success' : 'warning'" variant="soft" size="sm">{{ m.status === 'active' ? t('common.active') : t('common.invited') }}</UBadge>
            </td>
            <td class="px-3 py-2 text-nexa-small text-muted">{{ m.modules }}</td>
            <td class="px-3 py-2 text-nexa-small text-muted">{{ m.lastActive ? formatRelativeTime(m.lastActive) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
      <template #header>
        <p class="text-nexa-subheading text-highlighted">{{ t('admin.members.pendingInvitations', { n: fixtureInvitations.length }) }}</p>
      </template>
      <div class="flex flex-col">
        <div v-for="inv in fixtureInvitations" :key="inv.id" class="flex items-center gap-3 border-b border-default py-2 last:border-b-0">
          <UIcon name="i-lucide-mail" class="size-4 text-muted" />
          <p class="text-nexa-body text-default">{{ inv.email }}</p>
          <UBadge color="neutral" variant="soft" size="sm">{{ inv.role }}</UBadge>
          <span class="text-nexa-caption text-dimmed">{{ t('admin.members.expiresIn', { time: inv.expiresIn }) }}</span>
          <div class="ms-auto flex gap-1">
            <UButton icon="i-lucide-send" variant="ghost" size="xs" square :aria-label="t('admin.members.resend')" @click="toast.add({ title: t('admin.members.resent'), color: 'success' })" />
            <UButton icon="i-lucide-x" variant="ghost" size="xs" square color="error" :aria-label="t('common.cancel')" />
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model="inviteOpen" :title="t('admin.members.invite')" :ui="{ content: 'max-w-md' }">
      <div class="flex flex-col gap-4">
        <UFormField :label="t('admin.members.emails')" required>
          <UTextarea v-model="emails" :placeholder="t('admin.members.emailsPlaceholder')" />
        </UFormField>
        <UFormField :label="t('common.role')" required>
          <USelect v-model="inviteRole" :items="fixtureRoles.map((r) => ({ label: `${r.name} — ${r.description}`, value: r.id }))" />
        </UFormField>
        <UAlert color="info" variant="soft" :description="t('admin.members.linkExpiry')" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :label="t('common.cancel')" @click="inviteOpen = false" />
          <UButton color="primary" :label="t('admin.members.sendInvitations')" :disabled="!emails.trim()" @click="sendInvites" />
        </div>
      </template>
    </UModal>
  </div>
</template>
