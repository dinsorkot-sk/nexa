<script setup lang="ts">
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
  <div class="overflow-x-auto rounded-ui border border-ui-border">
    <table class="w-full border-collapse text-sm">
      <caption class="sr-only">
        {{ label }}
      </caption>
      <thead class="bg-ui-bg-muted text-xs text-ui-text-muted">
        <tr>
          <th
            scope="col"
            class="px-3 py-2 text-left"
          >
            Permission
          </th>
          <th
            v-for="role in roles"
            :key="role.id"
            scope="col"
            class="px-3 py-2 text-center font-medium"
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
            class="px-3 py-2 text-left font-medium text-ui-text-highlighted"
          >
            {{ permission.label }}
          </th>
          <td
            v-for="role in roles"
            :key="role.id"
            class="px-3 py-2 text-center"
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
</template>
