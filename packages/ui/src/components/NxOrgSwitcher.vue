<script setup lang="ts">
import { Check, ChevronsUpDown } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import NxAvatar from './NxAvatar.vue';
import type { NxSelectOption } from './NxSelect.vue';

/**
 * The mockup's OrgSwitcher section: the active organization as an avatar and name with a chevrons trigger, opening
 * a menu of the memberships the user belongs to.
 */
const props = withDefaults(defineProps<{
  modelValue: string;
  organizations: NxSelectOption[];
  label: string;
  /** Overrides the label of the selected membership. */
  name?: string;
  /** Logo URL for the active organization (a safe http(s) URL, see lib/safe-url). */
  logo?: string;
  disabled?: boolean;
}>(), {
  name: undefined,
  logo: undefined,
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [organizationId: string] }>();
const open = ref(false);
const current = computed(() => props.organizations.find((organization) => organization.value === props.modelValue));
const displayName = computed(() => props.name ?? current.value?.label ?? '');

function toggle() {
  if (!props.disabled) open.value = !open.value;
}

function select(organization: NxSelectOption) {
  if (organization.disabled) return;
  emit('update:modelValue', organization.value);
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}
</script>

<template>
  <div
    class="relative inline-block w-54"
    @keydown="onKeydown"
  >
    <button
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="label"
      :disabled="disabled"
      class="flex w-full items-center gap-2.5 rounded-ui-lg border border-ui-border bg-ui-bg px-2.5 py-2 text-left outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
      @click="toggle"
    >
      <NxAvatar
        size="sm"
        color="primary"
        :src="logo"
        :name="displayName"
      />
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-ui-text-highlighted">{{ displayName }}</span>
      <ChevronsUpDown
        class="size-4 shrink-0 text-ui-text-dimmed"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="open"
      role="menu"
      :aria-label="label"
      class="absolute left-0 z-40 mt-1 w-full min-w-54 rounded-ui-lg border border-ui-border bg-ui-bg p-1 shadow-md"
    >
      <li
        v-for="organization in organizations"
        :key="organization.value"
        role="none"
      >
        <button
          type="button"
          role="menuitemradio"
          :aria-checked="organization.value === modelValue"
          :disabled="organization.disabled"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
          @click="select(organization)"
        >
          <span class="flex-1 truncate text-ui-text-highlighted">{{ organization.label }}</span>
          <Check
            v-if="organization.value === modelValue"
            class="size-4 shrink-0 text-ui-primary-text"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
