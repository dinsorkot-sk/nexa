<script setup lang="ts">
import type { FieldDefinition, FieldType } from '@nexa/meta';
import { Bell, ChevronDown, Search, Settings, Star, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import {
  NxAlert, NxAvatar, NxBadge, NxButton, NxCard, NxCheckbox, NxChip, NxCombobox, NxDatePicker, NxFieldInput, NxFieldValue,
  NxIconButton, NxInput, NxKbd, NxLogo, NxModal, NxNavItem, NxPopover, NxRadio, NxSegment, NxSelect, NxSkeleton, NxSpinner,
  NxSwitch, NxTabs, NxTextarea, NxToaster, NxTooltip, provideNxLocale, pushToast, type ComboboxOption,
} from '../src/index';

// Playground-only controls: switch language and theme to check both modes side by side with the mockup.
const locale = ref<'th' | 'en'>('th');
// `?dark` opens the playground in Dark mode, so both themes can be captured from a URL.
const dark = ref(new URLSearchParams(window.location.search).has('dark'));
provideNxLocale(locale);
const rootClass = computed(() => (dark.value ? 'dark' : ''));

const tab = ref('records');
const segment = ref('table');
const radio = ref('active');
const check = ref(true);
const switchOn = ref(false);
const modal = ref(false);
const popover = ref(false);
const sampleText = ref('');
const sampleSelect = ref<string | undefined>();

const people: ComboboxOption[] = [
  { value: 'u-1', label: 'Ada Lovelace' },
  { value: 'u-2', label: 'Grace Hopper' },
  { value: 'u-3', label: 'Linus Torvalds' },
];

/** Simulates a server search. The real app passes an SDK call; the component only reads the result. */
async function searchPeople(term: string, { signal }: { limit: number; signal: AbortSignal }) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (signal.aborted) return [];
  return people.filter((person) => person.label.toLowerCase().includes(term.trim().toLowerCase()));
}

const choices = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

function field(type: FieldType, label: string, options: Partial<FieldDefinition['options']> = {}): FieldDefinition {
  return {
    id: type,
    entityId: 'demo',
    name: type,
    label,
    type,
    position: 0,
    options: {
      required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true,
      indexed: false, isStatus: false, ui: {}, ...options,
    },
  };
}

const fields = [
  field('text', 'Text'),
  field('longText', 'Long text'),
  field('number', 'Number'),
  field('integer', 'Integer'),
  field('decimal', 'Decimal', { precision: 2 }),
  field('currency', 'Currency', { precision: 2 }),
  field('percentage', 'Percentage', { precision: 1 }),
  field('boolean', 'Boolean'),
  field('date', 'Date'),
  field('datetime', 'Date and time'),
  field('time', 'Time'),
  field('select', 'Select', { choices }),
  field('multiSelect', 'Multi-select', { choices }),
  field('email', 'Email'),
  field('phone', 'Phone'),
  field('url', 'URL'),
  field('json', 'JSON'),
  field('file', 'File link'),
  field('image', 'Image link'),
  field('reference', 'Owner', { referenceEntityId: 'people' }),
  field('computed', 'Computed'),
  field('formula', 'Formula'),
  field('autoNumber', 'Auto number'),
];

const values = ref<Record<string, unknown>>({});
const errors = computed(() => ({ email: values.value.email === 'bad' ? 'Enter a valid email address.' : undefined }));

const sampleRecord = {
  email: 'ada@example.com', url: 'https://example.com', phone: '+66 81 234 5678', currency: 1234.5, percentage: 12.5,
  date: '2026-10-16', select: 'active', multiSelect: ['draft', 'closed'], reference: 'u-2', boolean: true,
};

const stateRows = [
  { key: 'default', label: 'Default' }, { key: 'disabled', label: 'Disabled' }, { key: 'error', label: 'Error' },
  { key: 'loading', label: 'Loading' },
];
</script>

<template>
  <div
    :class="rootClass"
    class="min-h-screen bg-ui-bg text-ui-text"
  >
    <div class="mx-auto max-w-5xl space-y-10 p-6">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <NxLogo />
        <div class="flex items-center gap-2">
          <NxSegment
            v-model="locale"
            label="Language"
            :items="[{ value: 'th', label: 'ไทย' }, { value: 'en', label: 'English' }]"
          />
          <NxButton
            color="neutral"
            size="sm"
            @click="dark = !dark"
          >
            {{ dark ? 'Light' : 'Dark' }}
          </NxButton>
        </div>
      </header>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Buttons
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <NxButton :icon="Star">
            Primary
          </NxButton>
          <NxButton
            color="secondary"
            :icon="Search"
          >
            Secondary
          </NxButton>
          <NxButton color="neutral">
            Neutral
          </NxButton>
          <NxButton color="ghost">
            Ghost
          </NxButton>
          <NxButton
            color="danger"
            :trailing-icon="Trash2"
          >
            Danger
          </NxButton>
          <NxButton
            size="sm"
            :loading="true"
          >
            Saving
          </NxButton>
          <NxButton disabled>
            Disabled
          </NxButton>
          <NxIconButton
            :icon="Settings"
            label="Settings"
          />
          <NxTooltip text="Notifications">
            <NxIconButton
              :icon="Bell"
              label="Notifications"
              color="neutral"
            />
          </NxTooltip>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Badges, chips, avatars, alerts
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <NxBadge>Neutral</NxBadge>
          <NxBadge
            color="success"
            dot
          >
            Success
          </NxBadge>
          <NxBadge
            color="info"
            :icon="Star"
          >
            Info
          </NxBadge>
          <NxBadge color="warning">
            Warning
          </NxBadge>
          <NxBadge color="error">
            Error
          </NxBadge>
          <NxChip
            color="primary"
            removable
            remove-label="Remove Draft"
          >
            Draft
          </NxChip>
          <NxAvatar
            name="Ada Lovelace"
            size="sm"
          />
          <NxAvatar name="Grace Hopper" />
          <NxKbd>⌘K</NxKbd>
          <NxSpinner />
          <NxSkeleton class="h-4 w-24" />
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <NxAlert
            color="info"
            title="Saved as draft"
            description="Changes are kept until you publish."
          />
          <NxAlert
            color="error"
            title="Version conflict"
            description="Someone else changed this record. Reload to continue."
          />
          <NxAlert
            color="warning"
            title="Module is in review"
            description="Definitions are read-only until it is activated."
          />
          <NxAlert
            color="success"
            title="Import finished"
            description="42 rows imported."
          />
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Navigation and overlays
        </h2>
        <NxTabs
          v-model="tab"
          label="Sections"
          :items="[{ value: 'records', label: 'Records' }, { value: 'fields', label: 'Fields' }, { value: 'audit', label: 'Audit' }]"
        />
        <div class="grid gap-6 md:grid-cols-[14rem_1fr]">
          <nav
            aria-label="Main"
            class="space-y-1"
          >
            <NxNavItem
              href="#"
              active
              :icon="Star"
            >
              Modules
            </NxNavItem>
            <NxNavItem
              href="#"
              :icon="Search"
            >
              Search
            </NxNavItem>
            <NxNavItem
              href="#"
              :icon="Settings"
            >
              Settings
            </NxNavItem>
          </nav>
          <NxCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-medium text-ui-text-highlighted">Vehicles</span>
                <div class="flex gap-2">
                  <NxPopover v-model:open="popover">
                    <template #trigger>
                      <NxButton
                        color="neutral"
                        size="sm"
                        :trailing-icon="ChevronDown"
                      >
                        Columns
                      </NxButton>
                    </template>
                    <NxCheckbox :model-value="check">
                      Show plate
                    </NxCheckbox>
                  </NxPopover>
                  <NxButton
                    size="sm"
                    @click="modal = true"
                  >
                    Open dialog
                  </NxButton>
                </div>
              </div>
            </template>
            <p class="text-sm text-ui-text-toned">
              Segments switch views; the popover and dialog follow the same token set in both themes.
            </p>
            <div class="mt-4">
              <NxSegment
                v-model="segment"
                label="View"
                :items="[{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }, { value: 'calendar', label: 'Calendar' }]"
              />
            </div>
          </NxCard>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Form controls
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="space-y-4">
            <NxInput
              v-model="sampleText"
              placeholder="Search vehicles"
              aria-label="Search vehicles"
            />
            <NxSelect
              v-model="sampleSelect"
              :options="choices"
              placeholder="Choose status"
              aria-label="Status"
            />
            <NxTextarea
              placeholder="Notes"
              aria-label="Notes"
            />
            <NxCombobox
              label="Owner"
              :load-options="searchPeople"
              placeholder="Search people"
            />
          </div>
          <div class="space-y-4">
            <NxRadio
              v-model="radio"
              label="Status"
              :options="choices"
            />
            <NxCheckbox v-model="check">
              Remember this view
            </NxCheckbox>
            <NxSwitch v-model="switchOn">
              Notify on change
            </NxSwitch>
            <NxDatePicker
              :model-value="'2026-10-16'"
              label="Due date"
            />
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Field renderers
        </h2>
        <p class="text-sm text-ui-text-muted">
          One editor and one display per field type in @nexa/meta. Values are emitted as the engine accepts them.
        </p>
        <div class="grid gap-6 md:grid-cols-2">
          <NxFieldInput
            v-for="item in fields"
            :key="item.id"
            :field="item"
            :model-value="values[item.id]"
            :error="item.id === 'email' ? errors.email : undefined"
            :load-options="searchPeople"
            :selected="item.id === 'reference' ? people : []"
            @update:model-value="(value) => (values[item.id] = value)"
          />
        </div>
        <div class="grid gap-x-6 gap-y-3 rounded-ui border border-ui-border p-4 md:grid-cols-2">
          <template
            v-for="item in fields"
            :key="`display-${item.id}`"
          >
            <div class="text-xs text-ui-text-muted">
              {{ item.label }}
            </div>
            <div class="text-sm">
              <NxFieldValue
                :field="item"
                :value="sampleRecord[item.id as keyof typeof sampleRecord]"
                :currency="'THB'"
                display="table"
              />
            </div>
          </template>
        </div>
        <div class="grid grid-cols-3 gap-3 text-xs text-ui-text-muted">
          <span
            v-for="state in stateRows"
            :key="state.key"
          >{{ state.label }}</span>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-lg font-semibold text-ui-text-highlighted">
          Toasts
        </h2>
        <div class="flex gap-2">
          <NxButton
            color="secondary"
            @click="pushToast({ title: 'Record saved', color: 'success' })"
          >
            Show success toast
          </NxButton>
          <NxButton
            color="danger"
            @click="pushToast({ title: 'Save failed', description: 'Try again in a moment.', color: 'error', duration: 0 })"
          >
            Show error toast
          </NxButton>
        </div>
      </section>
    </div>

    <NxModal
      v-model:open="modal"
      title="Delete vehicle?"
      description="This cannot be undone."
    >
      <p class="text-sm text-ui-text-toned">
        The record and its activity trail are removed.
      </p>
      <template #footer>
        <NxButton
          color="neutral"
          @click="modal = false"
        >
          Cancel
        </NxButton>
        <NxButton
          color="danger"
          @click="modal = false"
        >
          Delete
        </NxButton>
      </template>
    </NxModal>

    <NxToaster />
  </div>
</template>
