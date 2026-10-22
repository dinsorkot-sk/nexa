<script setup lang="ts">
import { Check, ChevronsUpDown } from 'lucide-vue-next';
import { computed, ref, useId } from 'vue';
import { useMenuKeyboard } from '../lib/menu';
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
const menuId = useId();
const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const current = computed(() => props.organizations.find((organization) => organization.value === props.modelValue));
const displayName = computed(() => props.name ?? current.value?.label ?? '');

function toggle() {
  if (!props.disabled) open.value = !open.value;
}

function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) triggerRef.value?.focus();
}

function select(organization: NxSelectOption) {
  if (organization.disabled) return;
  emit('update:modelValue', organization.value);
  close(true);
}

const { activeValue, onMenuKeydown, onTriggerKeydown, onFocusout } = useMenuKeyboard({
  entries: () => props.organizations.map((organization) => ({
    ...organization,
    selected: organization.value === props.modelValue,
  })),
  isOpen: () => open.value,
  open: () => { open.value = true; },
  close,
  rootRef,
  menuRef,
  triggerRef,
});
</script>

<template>
  <div
    ref="rootRef"
    class="relative inline-block w-54"
    @focusout="onFocusout"
  >
    <button
      ref="triggerRef"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-label="label"
      :disabled="disabled"
      class="flex w-full items-center gap-2.5 rounded-ui-lg border border-ui-border bg-ui-bg px-2.5 py-2 text-left outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
      @click="toggle"
      @keydown="onTriggerKeydown"
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
      :id="menuId"
      ref="menuRef"
      role="menu"
      :aria-label="label"
      class="absolute left-0 z-40 mt-1 w-full min-w-54 animate-ui-rise-in rounded-ui-lg border border-ui-border bg-ui-bg p-1 shadow-md"
      @keydown="onMenuKeydown"
    >
      <li
        v-for="organization in organizations"
        :key="organization.value"
        role="none"
      >
        <button
          type="button"
          role="menuitemradio"
          tabindex="-1"
          :aria-checked="organization.value === modelValue"
          :disabled="organization.disabled"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm outline-none transition-colors duration-ui-fast hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
          @click="select(organization)"
          @focus="activeValue = organization.value"
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
