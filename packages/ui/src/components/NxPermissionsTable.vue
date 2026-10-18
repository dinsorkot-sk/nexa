<script setup lang="ts">
import { useNxMessages } from '../lib/locale';
import NxPermissionCell from './NxPermissionCell.vue';

export interface NxPermissionRole {
  id: string;
  label: string;
}

export interface NxPermission {
  id: string;
  label: string;
}

const props = defineProps<{
  roles: NxPermissionRole[];
  permissions: NxPermission[];
  modelValue: Record<string, Record<string, boolean>>;
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, Record<string, boolean>>];
  change: [roleId: string, permissionId: string, value: boolean];
}>();

const messages = useNxMessages();

function update(roleId: string, permissionId: string, value: boolean) {
  const next = Object.fromEntries(
    Object.entries(props.modelValue).map(([key, permissions]) => [key, { ...permissions }]),
  );
  next[roleId] = { ...next[roleId], [permissionId]: value };
  emit('update:modelValue', next);
  emit('change', roleId, permissionId, value);
}
</script>

<template>
  <div class="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-bg">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <caption class="sr-only">
          {{ label }}
        </caption>
        <thead class="bg-ui-bg-muted text-ui-text-muted">
          <tr class="border-b border-ui-border">
            <th
              scope="col"
              class="h-10 pl-4 pr-3 text-left text-xs font-medium"
            >
              {{ messages.permission }}
            </th>
            <th
              v-for="role in roles"
              :key="role.id"
              scope="col"
              class="h-10 w-22 px-3 text-center text-xs font-medium"
            >
              {{ role.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ui-border">
          <tr
            v-for="permission in permissions"
            :key="permission.id"
          >
            <th
              scope="row"
              class="h-11 pl-4 pr-3 text-left font-mono text-sm font-normal text-ui-text-highlighted"
            >
              {{ permission.label }}
            </th>
            <td
              v-for="role in roles"
              :key="role.id"
              class="h-11 w-22 px-3 text-center"
            >
              <NxPermissionCell
                :model-value="modelValue[role.id]?.[permission.id] ?? false"
                :label="`${role.label}: ${permission.label}`"
                :disabled="disabled"
                @update:model-value="update(role.id, permission.id, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
