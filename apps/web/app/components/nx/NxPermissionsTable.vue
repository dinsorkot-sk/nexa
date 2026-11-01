<script setup lang="ts">
withDefaults(defineProps<{
  roles: { id: string; name: string; count: number }[];
  permissions: string[];
  matrix: Record<string, Record<string, 'allowed' | 'denied' | 'locked'>>;
  fieldLevel?: { field: string; [role: string]: string }[];
}>(), { fieldLevel: undefined });

const { t } = useI18n();

const cellIcon = (state: 'allowed' | 'denied' | 'locked') =>
  state === 'allowed' ? 'i-lucide-check' : state === 'denied' ? 'i-lucide-x' : 'i-lucide-lock';

const cellClass = (state: 'allowed' | 'denied' | 'locked') =>
  state === 'allowed'
    ? 'text-success'
    : state === 'denied'
      ? 'text-error'
      : 'text-dimmed';
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="overflow-x-auto rounded-xl border border-default">
      <UTable :columns="[{ key: 'role', label: t('builder.permissions.role') }, ...permissions.map((p) => ({ key: p, label: p, class: 'text-center' }))]" :rows="roles" :ui="{ base: 'min-w-full' }">
        <template #role-data="{ row }">
          <div class="flex items-center gap-2">
            <span class="text-nexa-body-strong">{{ row.name }}</span>
            <UBadge color="neutral" variant="soft" size="sm">{{ row.count }}</UBadge>
          </div>
        </template>
        <template #[`${p}-data`]="{ row }" v-for="p in permissions" :key="p">
          <div class="flex justify-center">
            <UIcon :name="cellIcon(matrix[row.id]?.[p] ?? 'denied')" :class="['size-4', cellClass(matrix[row.id]?.[p] ?? 'denied')]" />
          </div>
        </template>
      </UTable>
    </div>

    <div v-if="fieldLevel" class="flex flex-col gap-2">
      <h3 class="text-nexa-subheading text-highlighted">{{ t('builder.permissions.fieldLevel') }}</h3>
      <div class="overflow-x-auto rounded-xl border border-default">
        <UTable :columns="[{ key: 'field', label: t('builder.permissions.field') }, ...roles.map((r) => ({ key: r.id, label: r.name, class: 'text-center' }))]" :rows="fieldLevel" :ui="{ base: 'min-w-full' }">
          <template #[`${r.id}-data`]="{ row }" v-for="r in roles" :key="r.id">
            <div class="flex justify-center">
              <UIcon :name="cellIcon(row[r.id] ?? 'locked')" :class="['size-4', cellClass(row[r.id] ?? 'locked')]" />
            </div>
          </template>
        </UTable>
      </div>
    </div>
  </div>
</template>
