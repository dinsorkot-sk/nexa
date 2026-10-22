<script setup lang="ts">
import type { FieldDefinition, FieldType, FormDefinition, ViewDefinition } from '@nexa/meta';
import {
  ArrowUpRight, Bell, Boxes, ChevronDown, CircleHelp, Copy, Gauge, Info, LayoutGrid, MessageSquare, Pencil, Plus,
  Search, Settings, Star, Trash2, User, Wrench,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import {
  NxAccordion, NxActivityItem, NxAlert, NxAvatar, NxAvatarGroup, NxBadge, NxBanner, NxBarChart, NxBreadcrumb, NxButton,
  NxCalendarDay, NxCalendarEvent, NxCalendarView, NxCard, NxChartCard, NxChartLegend, NxCheckbox, NxChip, NxCodeBlock,
  NxCombobox, NxCommandPalette, NxDatePicker, NxDiffRow, NxDonutChart, NxEmptyState, NxFieldInput, NxFieldRow, NxFieldValue,
  NxFieldWrapper, NxFileUpload, NxFormulaEditor, NxIconButton, NxIndicator, NxInput, NxKanbanCard, NxKbd, NxLineChart,
  NxLink, NxLogo, NxMenu, NxMetaCalendar, NxMetaDetail, NxMetaForm, NxMetaGallery, NxMetaKanban, NxMetaTable, NxModal,
  NxNavGroupLabel, NxNavItem, NxNavbar, NxOrgSwitcher, NxPackageDiff, NxPageButton,
  NxPageHeader, NxPagination, NxPermissionCell, NxPermissionsTable, NxPopover, NxProgress, NxRadio, NxSegment, NxSelect,
  NxSelectMenu, NxSeparator, NxSidebar, NxSkeleton, NxSlideover, NxSpinner, NxStatCard, NxStepper, NxSwitch, NxTable,
  NxTableRow, NxTabs, NxTextarea, NxTimeline, NxToast, NxToaster, NxTooltip, NxWorkflowEdge, NxWorkflowNode, pushToast,
  provideNxLocale,
  type ComboboxOption,
} from '../src/index';

// Playground-only controls: switch language and theme to check both modes side by side with the mockup.
const locale = ref<'th' | 'en'>('th');
// `?dark` opens the playground in Dark mode, so both themes can be captured from a URL.
const dark = ref(new URLSearchParams(window.location.search).has('dark'));
provideNxLocale(locale);
const rootClass = computed(() => (dark.value ? 'dark' : ''));

// Interactive state for the sections that are controlled components.
const tab = ref('records');
const segment = ref('table');
const radio = ref('active');
const check = ref(true);
const switchOn = ref(false);
const modal = ref(false);
const slideover = ref(false);
const popover = ref(false);
const palette = ref(false);
const page = ref(2);
const org = ref('acme');
const sampleText = ref('');
const sampleSelect = ref<string | undefined>();
const sampleNativeSelect = ref<string | undefined>();
const formula = ref('price * quantity * (1 + taxRate)');

// Motion demo: the three duration tokens, and a key that re-mounts the entrance demo on demand.
const motionKey = ref(0);
const motionDurations = [
  { label: 'Fast', name: 'duration-ui-fast', value: '120ms' },
  { label: 'Base', name: 'duration-ui', value: '180ms' },
  { label: 'Slow', name: 'duration-ui-slow', value: '280ms' },
];

const choices = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

// The renderers: a view and a form over the same fields, the way a module hands them over.
const fieldOptions = { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {} };
const vehicleFields: FieldDefinition[] = [
  { id: 'plate', entityId: 'vehicle', name: 'plate', label: 'Plate', type: 'text', position: 0, options: { ...fieldOptions, required: true } },
  { id: 'model', entityId: 'vehicle', name: 'model', label: 'Model', type: 'text', position: 1, options: fieldOptions },
  { id: 'odometer', entityId: 'vehicle', name: 'odometer', label: 'Odometer', type: 'integer', position: 2, options: fieldOptions },
  { id: 'status', entityId: 'vehicle', name: 'status', label: 'Status', type: 'select', position: 3, options: { ...fieldOptions, choices } },
];
const vehicleView: ViewDefinition = {
  id: 'vehicles', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicles', type: 'table', isDefault: true,
  columns: [
    { fieldId: 'plate', visible: true },
    { fieldId: 'model', visible: true },
    { fieldId: 'odometer', visible: true, width: 120 },
    { fieldId: 'status', visible: true },
  ],
  sort: [{ fieldId: 'plate', direction: 'asc' }],
  filters: {},
  settings: {},
};
const vehicleRecords = [
  { id: 'v1', data: { plate: 'AB-1234', model: 'Hilux', odometer: 42150, status: 'active' } },
  { id: 'v2', data: { plate: 'AB-5678', model: 'Isuzu D-Max', odometer: 9800, status: 'draft' } },
  { id: 'v3', data: { plate: 'AB-9012', model: 'Toyota Hilux', odometer: 132400, status: 'closed' } },
];
const vehicleForm: FormDefinition = {
  id: 'vehicle-form', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicle',
  sections: [
    { id: 'identity', label: 'Identity', fieldIds: ['plate', 'model'], columns: 2, visibility: {} },
    { id: 'condition', label: 'Condition', fieldIds: ['odometer', 'status'], columns: 2, visibility: {} },
  ],
  settings: {},
};
const vehicleValues = ref<Record<string, unknown>>({ plate: 'AB-1234', model: 'Hilux' });

// The views that lay themselves out: a board, a month and a gallery over the same records.
const vehicleDueField: FieldDefinition = { id: 'due', entityId: 'vehicle', name: 'due', label: 'Due', type: 'date', position: 4, options: fieldOptions };
const vehiclePhotoField: FieldDefinition = { id: 'photo', entityId: 'vehicle', name: 'photo', label: 'Photo', type: 'image', position: 5, options: fieldOptions };
const vehicleLayoutFields = [...vehicleFields, vehicleDueField, vehiclePhotoField];
const vehicleBoard: ViewDefinition = {
  id: 'vehicle-board', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicles by status', type: 'kanban', isDefault: false,
  columns: [{ fieldId: 'plate', visible: true }, { fieldId: 'model', visible: true }],
  sort: [], filters: {}, settings: {},
  groupBy: 'status',
  titleField: 'plate',
};
const vehicleCalendar: ViewDefinition = {
  id: 'vehicle-calendar', moduleId: 'fleet', entityId: 'vehicle', name: 'Service calendar', type: 'calendar', isDefault: false,
  columns: [{ fieldId: 'plate', visible: true }],
  sort: [], filters: {}, settings: {},
  dateField: 'due',
  titleField: 'plate',
};
const vehicleGallery: ViewDefinition = {
  id: 'vehicle-gallery', moduleId: 'fleet', entityId: 'vehicle', name: 'Fleet gallery', type: 'gallery', isDefault: false,
  columns: [{ fieldId: 'model', visible: true }, { fieldId: 'odometer', visible: true }],
  sort: [], filters: {}, settings: {},
  imageField: 'photo',
  titleField: 'plate',
};
const vehicleLayoutRecords = [
  { id: 'v1', data: { plate: 'AB-1234', model: 'Hilux', odometer: 42150, status: 'active', due: '2026-03-04', photo: 'https://images.example.com/vehicles/hilux.png' } },
  { id: 'v2', data: { plate: 'AB-5678', model: 'Isuzu D-Max', odometer: 9800, status: 'draft', due: '2026-03-09', photo: 'https://images.example.com/vehicles/dmax.png' } },
  { id: 'v3', data: { plate: 'AB-9012', model: 'Toyota Hilux', odometer: 132400, status: 'closed', due: '2026-03-16', photo: 'https://images.example.com/vehicles/toyota.png' } },
];
const vehicleActivity = [
  { id: 'a1', actor: 'Ada Lovelace', action: 'created the record', time: '2 hours ago', kind: 'create' as const },
  { id: 'a2', actor: 'Grace Hopper', action: 'changed the status', time: 'yesterday', kind: 'status' as const, oldValue: 'draft', newValue: 'active' },
];
const vehicleRelations = [
  { id: 'owner', name: 'Owner', targets: [{ id: 'u1', label: 'Ada Lovelace' }] },
  { id: 'location', name: 'Location', targets: [{ id: 'l1', label: 'Bangkok depot' }] },
];

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

const tableColumns = [
  { key: 'plate', label: 'Plate', sortable: true },
  { key: 'driver', label: 'Driver' },
  { key: 'status', label: 'Status' },
];
const tableRows = [
  { id: '1', plate: 'AB-1234', driver: 'Somchai K.', status: 'Active' },
  { id: '2', plate: 'CD-5678', driver: 'Nok S.', status: 'In service' },
  { id: '3', plate: 'EF-9012', driver: 'Pim T.', status: 'Active' },
];

const menuItems = [
  { value: 'edit', label: 'Edit', icon: Pencil },
  { value: 'duplicate', label: 'Duplicate', icon: Copy },
  { value: 'delete', label: 'Delete', icon: Trash2, destructive: true },
];

const accordionItems = [
  { value: 'details', title: 'Record details', content: 'Plate, driver, status and the audit trail.' },
  { value: 'history', title: 'History', content: 'Every change is recorded in the activity trail.' },
];

const timelineItems = [
  { id: '1', actor: 'Somchai K.', action: 'changed Status', time: '2 h ago', kind: 'update' as const, oldValue: 'Draft', newValue: 'Active' },
  { id: '2', actor: 'Nok S.', action: 'commented', time: '5 h ago', kind: 'comment' as const, description: 'Service booked for next Monday.' },
  { id: '3', actor: 'System', action: 'created this record', time: '1 d ago', kind: 'create' as const },
];

const paletteCommands = [
  { id: 'home', label: 'Go to dashboard', icon: Gauge, group: 'Navigation' },
  { id: 'vehicles', label: 'Open vehicles', icon: Boxes, group: 'Navigation' },
  { id: 'settings', label: 'Open settings', icon: Settings, group: 'Actions' },
  { id: 'help', label: 'Help and docs', icon: CircleHelp, group: 'Actions' },
];

const barLabels = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const barSeries = [
  { label: 'Fuel', values: [40, 62, 35, 80, 55, 70, 48] },
  { label: 'Service', values: [25, 40, 22, 55, 38, 45, 30] },
];
const donutSegments = [
  { label: 'Active', value: 55 },
  { label: 'In service', value: 30 },
  { label: 'Retired', value: 15 },
];

const sidebarGroups = [
  { label: 'Workspace', items: [{ label: 'Home', icon: LayoutGrid }, { label: 'Vehicles', icon: Boxes, active: true }, { label: 'Maintenance', icon: Wrench }] },
  { label: 'Admin', items: [{ label: 'Members', icon: User }, { label: 'Settings', icon: Settings }] },
];

const organizations = [
  { value: 'acme', label: 'Loghorizon Co.' },
  { value: 'beta', label: 'Beta Transport' },
];

const permissionRoles = [
  { id: 'owner', label: 'owner' },
  { id: 'admin', label: 'admin' },
  { id: 'viewer', label: 'viewer' },
];
const permissionRows = [
  { id: 'definition:read', label: 'definition:read' },
  { id: 'definition:manage', label: 'definition:manage' },
  { id: 'record:write', label: 'record:write' },
];
const permissions = ref<Record<string, Record<string, boolean>>>({
  owner: { 'definition:read': true, 'definition:manage': true, 'record:write': true },
  admin: { 'definition:read': true, 'definition:manage': false, 'record:write': true },
  viewer: { 'definition:read': true, 'definition:manage': false, 'record:write': false },
});

const packageDiff = [
  { path: 'fields.plateNumber', status: 'added' as const, detail: 'new field (text, required)' },
  { path: 'fields.notes', status: 'changed' as const, before: 'maxLength 20', after: 'maxLength 30' },
  { path: 'fields.old', status: 'removed' as const },
];

const calendarEvents = [
  { id: 'e1', label: 'AB-1234', color: 'primary' as const },
  { id: 'e2', label: 'CD-5678', color: 'warning' as const },
];

const calendarViewEvents = [
  { id: 'e1', date: '2026-10-06', label: 'AB-1234', color: 'primary' as const },
  { id: 'e2', date: '2026-10-20', label: 'CD-5678', color: 'warning' as const },
];

const packageJson = [
  '{',
  '  "module": "vehicles",',
  '  "version": "1.2.0"',
  '}',
].join('\n');

const formulaText = 'price * quantity\nIF(discount > 0, total - discount, total)';

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
  field('text', 'Text'), field('longText', 'Long text'), field('number', 'Number'), field('integer', 'Integer'),
  field('decimal', 'Decimal', { precision: 2 }), field('currency', 'Currency', { precision: 2 }),
  field('percentage', 'Percentage', { precision: 1 }), field('boolean', 'Boolean'), field('date', 'Date'),
  field('datetime', 'Date and time'), field('time', 'Time'), field('select', 'Select', { choices }),
  field('multiSelect', 'Multi-select', { choices }), field('email', 'Email'), field('phone', 'Phone'), field('url', 'URL'),
  field('json', 'JSON'), field('file', 'File link'), field('image', 'Image link'),
  field('reference', 'Owner', { referenceEntityId: 'people' }), field('computed', 'Computed'), field('formula', 'Formula'),
  field('autoNumber', 'Auto number'),
];

const values = ref<Record<string, unknown>>({});
const sampleRecord = {
  email: 'ada@example.com', url: 'https://example.com', phone: '+66 81 234 5678', currency: 1234.5, percentage: 12.5,
  date: '2026-10-16', select: 'active', multiSelect: ['draft', 'closed'], reference: 'u-2', boolean: true,
};

const badgeColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const;
const buttonColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const;
</script>

<template>
  <div
    :class="rootClass"
    class="min-h-screen bg-ui-bg text-ui-text"
  >
    <header class="sticky top-0 z-30 border-b border-ui-border bg-ui-bg/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <NxLogo />
        <div class="flex items-center gap-2">
          <NxButton
            color="neutral"
            variant="outline"
            size="sm"
            :icon="Search"
            @click="palette = true"
          >
            Commands
          </NxButton>
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
      </div>
    </header>

    <div class="mx-auto max-w-6xl space-y-12 px-6 py-8">
      <!-- Base controls -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Buttons
        </h2>
        <div class="space-y-3">
          <div
            v-for="color in buttonColors"
            :key="color"
            class="flex flex-wrap items-center gap-2"
          >
            <NxButton
              :color="color"
              :icon="Star"
            >
              {{ color }}
            </NxButton>
            <NxButton
              :color="color"
              variant="outline"
            >
              Outline
            </NxButton>
            <NxButton
              :color="color"
              variant="soft"
            >
              Soft
            </NxButton>
            <NxButton
              :color="color"
              variant="subtle"
            >
              Subtle
            </NxButton>
            <NxButton
              :color="color"
              variant="ghost"
            >
              Ghost
            </NxButton>
            <NxButton
              :color="color"
              variant="link"
            >
              Link
            </NxButton>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <NxButton size="sm">
              Small
            </NxButton>
            <NxButton>Medium</NxButton>
            <NxButton size="lg">
              Large
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
            <NxButton :trailing-icon="ArrowUpRight">
              Trailing
            </NxButton>
            <NxIconButton
              :icon="Settings"
              label="Settings"
              color="neutral"
              variant="outline"
            />
            <NxTooltip text="Notifications">
              <NxIconButton
                :icon="Bell"
                label="Notifications"
                color="primary"
                variant="soft"
              />
            </NxTooltip>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Badge, Chip, Avatar, Kbd, Indicator
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <NxBadge
            v-for="color in badgeColors"
            :key="color"
            :color="color"
          >
            {{ color }}
          </NxBadge>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <NxBadge
            color="success"
            variant="soft"
            dot
          >
            Active
          </NxBadge>
          <NxBadge
            color="warning"
            variant="subtle"
            :icon="Info"
          >
            Warning
          </NxBadge>
          <NxChip
            color="primary"
            removable
            remove-label="Remove Draft"
          >
            Draft
          </NxChip>
          <NxChip color="neutral">
            Neutral
          </NxChip>
          <NxKbd>⌘K</NxKbd>
          <NxKbd variant="outline">
            Esc
          </NxKbd>
          <NxIndicator
            content="count"
            :count="12"
            label="12 notifications"
          />
          <NxIndicator
            content="count"
            :count="240"
            :max="99"
            color="error"
            label="Notifications"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NxAvatar
            name="Ada Lovelace"
            size="xs"
          />
          <NxAvatar
            name="Ada Lovelace"
            size="sm"
          />
          <NxAvatar
            name="Ada Lovelace"
            color="primary"
          />
          <NxAvatar
            name="Ada Lovelace"
            size="lg"
          />
          <NxAvatar
            name="Ada Lovelace"
            size="xl"
            color="primary"
          />
          <NxAvatarGroup
            label="Owners"
            :items="[{ name: 'Ada' }, { name: 'Bob' }, { name: 'Cy' }, { name: 'Dee' }, { name: 'Eve' }]"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NxLink
            href="https://example.com/records"
            external
          >
            Open the record
          </NxLink>
          <NxLink
            href="https://example.com"
            tone="muted"
          >
            Muted link
          </NxLink>
          <NxLink
            href="https://example.com"
            disabled
          >
            Disabled link
          </NxLink>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Alert, Banner, Toast
        </h2>
        <div class="grid gap-3 md:grid-cols-2">
          <NxAlert
            color="info"
            title="Saved as draft"
            description="Changes are kept until you publish."
          />
          <NxAlert
            color="success"
            title="Import finished"
            description="42 rows imported."
          />
          <NxAlert
            color="warning"
            title="Module is in review"
            description="Definitions are read-only until it is activated."
          />
          <NxAlert
            color="error"
            title="Version conflict"
            description="Someone else changed this record. Reload to continue."
          />
        </div>
        <div class="space-y-2 overflow-hidden rounded-ui-lg border border-ui-border">
          <NxBanner
            color="warning"
            title="You are offline"
            description="Changes are paused and will sync when the connection returns."
          />
          <NxBanner
            color="info"
            title="New version available"
            description="Reload to get the latest update."
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NxToast
            color="success"
            title="Record saved"
          />
          <NxToast
            color="error"
            title="Save failed"
            description="Try again in a moment."
          />
          <NxButton
            color="secondary"
            @click="pushToast({ title: 'Record saved', color: 'success' })"
          >
            Show toast
          </NxButton>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Card, StatCard, Progress, Stepper
        </h2>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <NxCard
            v-for="variant in ['outline', 'soft', 'subtle', 'solid'] as const"
            :key="variant"
            :variant="variant"
            title="Vehicles"
            description="Fleet records"
          >
            Body content for the {{ variant }} variant.
          </NxCard>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          <NxStatCard
            label="Total vehicles"
            value="1,204"
            change="+12%"
            trend="up"
            :icon="Boxes"
          />
          <NxStatCard
            label="Overdue"
            value="4"
            change="-4%"
            trend="down"
            :icon="Gauge"
          />
          <NxStatCard
            label="Drivers"
            value="86"
            :icon="User"
          />
        </div>
        <div class="space-y-3">
          <NxProgress
            label="Import"
            :value="65"
            show-value
          />
          <NxProgress
            label="Storage"
            :value="25"
            size="sm"
          />
        </div>
        <NxStepper
          label="Import"
          :model-value="1"
          :steps="[{ label: 'Upload' }, { label: 'Map' }, { label: 'Result' }]"
        />
        <NxSeparator label="or" />
        <div class="flex items-center gap-4">
          <NxSpinner />
          <NxSkeleton class="h-4 w-40" />
          <NxSkeleton
            shape="circle"
            class="size-10"
          />
          <NxSkeleton
            shape="block"
            class="h-16 w-40"
          />
        </div>
        <NxEmptyState
          title="No records yet"
          description="Create the first vehicle to get started."
          :icon="Boxes"
        />
      </section>

      <!-- Forms -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Form controls
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="space-y-4">
            <NxFieldWrapper
              id="pg-plate"
              label="Plate number"
              hint="Unique across the fleet."
              required
            >
              <NxInput
                id="pg-plate"
                v-model="sampleText"
                placeholder="AB-1234"
              />
            </NxFieldWrapper>
            <NxInput
              placeholder="Invalid input"
              invalid
              aria-label="Invalid input"
            />
            <NxSelectMenu
              v-model="sampleSelect"
              :options="choices"
              placeholder="Choose status"
              label="Status"
            />
            <NxSelect
              id="pg-native-select"
              v-model="sampleNativeSelect"
              :options="choices"
              placeholder="Choose status"
              aria-label="Native status"
            />
            <NxTextarea
              placeholder="Notes"
              aria-label="Notes"
            />
            <NxDatePicker
              :model-value="'2026-10-16'"
              label="Due date"
            />
            <NxCombobox
              label="Owner"
              :load-options="searchPeople"
              placeholder="Search people"
            />
            <NxCombobox
              label="Owners"
              multiple
              :selected="people"
              :options="people"
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
            <NxFileUpload
              label="Drop a CSV file here"
              hint="Max 10 MB"
            />
            <NxFileUpload
              label="Drop a CSV file here"
              hint="Only .csv files are accepted."
              invalid
            />
            <NxFormulaEditor
              v-model="formula"
              label="Formula"
              hint="Result preview: 13,375.00"
            />
            <NxFormulaEditor
              :model-value="'price *'"
              label="Formula"
              error="Unexpected end of expression at column 18."
            />
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
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
            :error="item.id === 'email' && values.email === 'bad' ? 'Enter a valid email address.' : undefined"
            :load-options="searchPeople"
            :selected="item.id === 'reference' ? people : []"
            @update:model-value="(value) => (values[item.id] = value)"
          />
        </div>
        <div class="grid gap-x-6 gap-y-3 rounded-ui-lg border border-ui-border p-4 md:grid-cols-2">
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
                currency="THB"
                display="table"
              />
            </div>
          </template>
        </div>
      </section>

      <!-- View and form renderers -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          View and form renderers
        </h2>
        <div class="grid gap-6 lg:grid-cols-2">
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-ui-text-muted">
              A view over a page of records
            </h3>
            <NxMetaTable
              :view="vehicleView"
              :fields="vehicleFields"
              :records="vehicleRecords"
              :total="42"
              :limit="10"
              :page="1"
            />
          </div>
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-ui-text-muted">
              A form over the same fields
            </h3>
            <NxMetaForm
              :form="vehicleForm"
              :fields="vehicleFields"
              :values="vehicleValues"
              cancel-label="Cancel"
              @update:values="vehicleValues = $event"
            />
          </div>
        </div>
      </section>

      <!-- The views that lay themselves out -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          The views that lay themselves out
        </h2>
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-ui-text-muted">
            A board grouped by the status
          </h3>
          <NxMetaKanban
            :view="vehicleBoard"
            :fields="vehicleLayoutFields"
            :records="vehicleLayoutRecords"
          />
        </div>
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-ui-text-muted">
            A month, with the records of the day underneath
          </h3>
          <NxMetaCalendar
            :view="vehicleCalendar"
            :fields="vehicleLayoutFields"
            :records="vehicleLayoutRecords"
            month="2026-03"
            selected-date="2026-03-04"
          />
        </div>
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-ui-text-muted">
            A gallery of cards
          </h3>
          <NxMetaGallery
            :view="vehicleGallery"
            :fields="vehicleLayoutFields"
            :records="vehicleLayoutRecords"
          />
        </div>
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-ui-text-muted">
            The record page
          </h3>
          <NxMetaDetail
            :record="vehicleLayoutRecords[0]!"
            :fields="vehicleLayoutFields"
            :relations="vehicleRelations"
            :activity="vehicleActivity"
          />
        </div>
      </section>

      <!-- Navigation -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Navigation
        </h2>
        <NxTabs
          v-model="tab"
          label="Sections"
          :items="[{ value: 'records', label: 'Records' }, { value: 'fields', label: 'Fields' }, { value: 'audit', label: 'Audit' }]"
        />
        <NxSegment
          v-model="segment"
          label="View"
          :items="[{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }, { value: 'calendar', label: 'Calendar' }]"
        />
        <NxBreadcrumb
          label="Breadcrumb"
          :items="[{ label: 'Home', href: '#' }, { label: 'Vehicles', href: '#' }, { label: 'AB-1234' }]"
        />
        <div class="grid gap-6 md:grid-cols-[14rem_1fr]">
          <nav
            aria-label="Main"
            class="space-y-1"
          >
            <NxNavGroupLabel>Workspace</NxNavGroupLabel>
            <NxNavItem
              href="#"
              active
              :icon="Boxes"
            >
              Vehicles
            </NxNavItem>
            <NxNavItem
              href="#"
              :icon="Wrench"
            >
              Maintenance
            </NxNavItem>
            <NxNavItem
              href="#"
              :icon="User"
            >
              Drivers
            </NxNavItem>
          </nav>
          <div class="space-y-4">
            <NxMenu
              label="Row actions"
              :items="menuItems"
            >
              Row actions
            </NxMenu>
            <NxPagination
              v-model="page"
              :total="120"
              :page-size="10"
            />
            <div class="flex items-center gap-1">
              <NxPageButton :page="1" />
              <NxPageButton
                :page="2"
                current
              />
              <NxPageButton :page="3" />
            </div>
          </div>
        </div>
      </section>

      <!-- Overlays -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Overlays
        </h2>
        <div class="flex flex-wrap gap-2">
          <NxButton @click="modal = true">
            Open modal
          </NxButton>
          <NxButton
            color="neutral"
            variant="outline"
            @click="slideover = true"
          >
            Open slideover
          </NxButton>
          <NxPopover v-model:open="popover">
            <template #trigger>
              <NxButton
                color="neutral"
                variant="outline"
                :trailing-icon="ChevronDown"
              >
                Popover
              </NxButton>
            </template>
            <NxCheckbox :model-value="check">
              Show plate column
            </NxCheckbox>
          </NxPopover>
          <NxButton
            color="neutral"
            variant="outline"
            @click="palette = true"
          >
            Command palette
          </NxButton>
        </div>
        <NxAccordion :items="accordionItems" />
      </section>

      <!-- Data -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Table, views and activity
        </h2>
        <NxTable
          :columns="tableColumns"
          :rows="tableRows"
          row-key="id"
        />
        <div class="space-y-2 rounded-ui-lg border border-ui-border p-3">
          <NxTableRow head>
            <span class="font-medium">Plate</span>
            <span class="font-medium">Driver</span>
          </NxTableRow>
          <NxTableRow
            clickable
            selected
          >
            <span>AB-1234</span>
            <span>Somchai K.</span>
          </NxTableRow>
          <NxTableRow clickable>
            <span>CD-5678</span>
            <span>Nok S.</span>
          </NxTableRow>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          <NxKanbanCard
            title="AB-1234"
            status="In review"
            meta="Updated 2 h ago"
            :assignee="{ name: 'Somchai' }"
          />
          <NxKanbanCard
            title="CD-5678"
            status="Active"
            state="hover"
          />
          <NxKanbanCard
            title="EF-9012"
            status="Blocked"
            state="dragging"
          />
        </div>
        <NxTimeline
          label="Activity"
          :items="timelineItems"
        />
        <div class="space-y-4">
          <NxActivityItem
            actor="Somchai K."
            action="changed Status"
            time="2 h ago"
            kind="update"
            old-value="Draft"
            new-value="Active"
            :last="false"
          />
          <NxActivityItem
            actor="Nok S."
            action="commented"
            time="5 h ago"
            kind="comment"
            description="Service booked for next Monday."
          />
        </div>
      </section>

      <!-- Charts and calendar -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Charts and calendar
        </h2>
        <NxChartLegend
          label="Series"
          :items="[{ label: 'Fuel' }, { label: 'Service' }]"
        />
        <div class="grid gap-4 lg:grid-cols-2">
          <NxChartCard title="Cost by month">
            <template #legend>
              <NxChartLegend
                label="Series"
                :items="barSeries"
              />
            </template>
            <NxBarChart
              label="Cost by month"
              :labels="barLabels"
              :series="barSeries"
            />
          </NxChartCard>
          <NxChartCard title="Distance by month">
            <NxLineChart
              label="Distance by month"
              :labels="barLabels"
              :series="barSeries"
            />
          </NxChartCard>
        </div>
        <div class="flex flex-wrap items-center gap-8">
          <NxDonutChart
            label="Fleet by status"
            center-value="1,204"
            center-label="Total"
            :segments="donutSegments"
          />
        </div>
        <NxCalendarView
          label="Calendar"
          month="2026-10"
          :events="calendarViewEvents"
        />
        <div class="flex items-center gap-4">
          <NxCalendarDay
            :date="15"
            iso-date="2026-10-15"
            today
            label="15"
            :events="calendarEvents"
          />
          <NxCalendarDay
            :date="16"
            iso-date="2026-10-16"
            label="16"
          />
          <NxCalendarDay
            :date="30"
            iso-date="2026-09-30"
            outside
            label="30"
          />
        </div>
        <div class="space-y-1">
          <NxCalendarEvent
            label="AB-1234"
            color="primary"
          />
          <NxCalendarEvent
            label="CD-5678"
            color="warning"
          />
        </div>
      </section>

      <!-- Builder -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Builder
        </h2>
        <div class="space-y-2">
          <NxFieldRow
            label="Plate number"
            name="plateNumber"
            type="text"
            required
          />
          <NxFieldRow
            label="Notes"
            name="notes"
            type="longText"
            state="selected"
          />
          <NxFieldRow
            label="Owner"
            name="owner"
            type="reference"
            state="error"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NxWorkflowNode
            title="New"
            kind="start"
          />
          <NxWorkflowEdge />
          <NxWorkflowNode
            title="In review"
            kind="step"
            meta="12 records"
            selected
          />
          <NxWorkflowEdge guard="admin" />
          <NxWorkflowNode
            title="Done"
            kind="end"
          />
        </div>
        <div class="space-y-2">
          <NxDiffRow
            v-for="entry in packageDiff"
            :key="entry.path"
            :path="entry.path"
            :status="entry.status"
            :detail="entry.detail"
            :before="entry.before"
            :after="entry.after"
          />
        </div>
        <NxPackageDiff
          title="Upgrade 1.1.0 to 1.2.0"
          label="Package changes"
          :items="packageDiff"
        />
        <NxPermissionsTable
          label="Permissions"
          :roles="permissionRoles"
          :permissions="permissionRows"
          :model-value="permissions"
          @update:model-value="(value) => (permissions = value)"
        />
        <div class="flex items-center gap-4">
          <NxPermissionCell
            :model-value="true"
            label="Allowed"
          />
          <NxPermissionCell
            :model-value="false"
            label="Denied"
          />
          <NxPermissionCell
            :model-value="false"
            label="Locked"
            locked
          />
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <NxCodeBlock
            filename="formula.txt"
            label="Formula"
            copyable
            :code="formulaText"
          />
          <NxCodeBlock
            filename="package.json"
            label="Package"
            copyable
            :code="packageJson"
          />
        </div>
      </section>

      <!-- App shell -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          App shell
        </h2>
        <NxPageHeader
          title="Vehicles"
          description="Fleet records, drivers, maintenance and fuel logs."
        >
          <template #actions>
            <NxButton
              color="neutral"
              variant="outline"
            >
              Import CSV
            </NxButton>
            <NxButton :icon="Plus">
              New vehicle
            </NxButton>
          </template>
        </NxPageHeader>
        <div class="flex gap-2">
          <NxOrgSwitcher
            v-model="org"
            label="Organization"
            :organizations="organizations"
          />
          <NxIconButton
            :icon="MessageSquare"
            label="Comments"
            color="neutral"
            variant="outline"
          />
        </div>
        <div class="overflow-hidden rounded-ui-lg border border-ui-border">
          <NxNavbar
            title="Vehicles"
            description="12 records"
          >
            <NxIconButton
              :icon="Bell"
              label="Notifications"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <NxAvatar
              name="Somchai K."
              size="sm"
              color="primary"
            />
          </NxNavbar>
          <div class="flex h-80">
            <NxSidebar
              label="Navigation"
              :groups="sidebarGroups"
            >
              <template #brand>
                <NxLogo size="sm" />
              </template>
              <template #footer>
                <div class="flex items-center gap-2">
                  <NxAvatar
                    name="Somchai K."
                    size="sm"
                    color="primary"
                  />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-ui-text-highlighted">
                      Somchai K.
                    </p>
                    <p class="text-xs text-ui-text-muted">
                      Owner
                    </p>
                  </div>
                </div>
              </template>
            </NxSidebar>
            <div class="flex-1 bg-ui-bg p-4 text-sm text-ui-text-muted">
              Content panel
            </div>
          </div>
        </div>
        <p class="text-xs text-ui-text-muted">
          Every component also ships under the aliases NxFormField, NxSelectMenu, NxReferenceSelect, NxCalendar and NxSegmented.
        </p>
      </section>

      <section
        id="motion"
        class="space-y-4"
      >
        <h2 class="text-xl font-semibold text-ui-text-highlighted">
          Motion
        </h2>
        <p class="text-sm text-ui-text-toned">
          One motion system for the library. Durations are tokens exposed as the <code>duration-ui*</code> and
          <code>ease-ui-*</code> utilities, overlays and anchored panels play their own enter/exit keyframes through
          Reka's <code>data-state</code>, and controls transition colour, shadow and transform. Point a card to see
          each duration.
        </p>
        <div class="group grid gap-4 sm:grid-cols-3">
          <NxCard
            v-for="item in motionDurations"
            :key="item.name"
            :title="item.label"
          >
            <p class="font-mono text-xs text-ui-text-muted">
              {{ item.name }} · {{ item.value }}
            </p>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-ui-bg-accented">
              <div
                class="h-full w-1/6 rounded-full bg-ui-primary transition-[width] ease-ui-out group-hover:w-full"
                :class="item.name"
              />
            </div>
          </NxCard>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NxButton
            color="neutral"
            variant="outline"
            @click="motionKey += 1"
          >
            Replay entrances
          </NxButton>
          <NxTooltip text="Tooltips pop in and out">
            <NxIconButton
              :icon="CircleHelp"
              label="Motion help"
              color="neutral"
              variant="outline"
            />
          </NxTooltip>
          <NxButton
            color="neutral"
            variant="outline"
            @click="pushToast({ title: 'Motion', description: 'Toasts join and leave the stack.', color: 'info' })"
          >
            Push a toast
          </NxButton>
        </div>
        <div
          :key="motionKey"
          class="flex flex-wrap items-center gap-3"
        >
          <span class="animate-ui-pop rounded-ui-lg border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text-toned">pop</span>
          <span class="animate-ui-rise-in rounded-ui-lg border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text-toned">rise</span>
          <span class="animate-ui-drop-in rounded-ui-lg border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text-toned">drop</span>
          <span class="animate-ui-fade-in rounded-ui-lg border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text-toned">fade</span>
          <span class="animate-ui-pop-in rounded-ui-lg border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text-toned">pop-in</span>
        </div>
        <p class="text-xs text-ui-text-muted">
          Under <code>prefers-reduced-motion: reduce</code> every duration collapses to zero, so nothing moves.
        </p>
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
          color="error"
          @click="modal = false"
        >
          Delete
        </NxButton>
      </template>
    </NxModal>

    <NxSlideover
      v-model:open="slideover"
      title="Filters"
    >
      <NxCheckbox :model-value="true">
        Active only
      </NxCheckbox>
    </NxSlideover>

    <NxCommandPalette
      v-model:open="palette"
      label="Commands"
      placeholder="Search commands"
      :commands="paletteCommands"
    />

    <NxToaster />
  </div>
</template>
