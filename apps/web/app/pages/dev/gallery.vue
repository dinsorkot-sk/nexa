<script setup lang="ts">
import type { FieldSpec } from '@nexa/types';

definePageMeta({ layout: 'default' });

const { t } = useI18n();
const { colorMode } = useNexa();
const toast = useToast();
const { entity } = useMetadata();

const galleryTab = ref('a');
const galleryPage = ref(1);
const formulaDemo = ref('YEAR(TODAY()) - {year}');
const slideoverText = ref('');

const demoFields: FieldSpec[] = [
  { id: 'g1', name: 'name', label: 'ชื่อ', logicalType: 'text', required: true, maxLength: 100 },
  { id: 'g2', name: 'address', label: 'ที่อยู่', logicalType: 'longText' },
  { id: 'g3', name: 'email', label: 'อีเมล', logicalType: 'email' },
  { id: 'g4', name: 'phone', label: 'เบอร์โทร', logicalType: 'phone' },
  { id: 'g5', name: 'website', label: 'เว็บไซต์', logicalType: 'url' },
  { id: 'g6', name: 'year', label: 'ปี', logicalType: 'integer' },
  { id: 'g7', name: 'ratio', label: 'อัตราส่วน', logicalType: 'number', scale: 2 },
  { id: 'g8', name: 'engine', label: 'เครื่องยนต์', logicalType: 'decimal', scale: 1 },
  { id: 'g9', name: 'price', label: 'ราคา', logicalType: 'currency', scale: 2 },
  { id: 'g10', name: 'tax', label: 'ภาษี', logicalType: 'percentage', scale: 2 },
  { id: 'g11', name: 'active', label: 'ใช้งาน', logicalType: 'boolean' },
  { id: 'g12', name: 'date', label: 'วันที่', logicalType: 'date' },
  { id: 'g13', name: 'datetime', label: 'วันที่และเวลา', logicalType: 'datetime' },
  { id: 'g14', name: 'time', label: 'เวลา', logicalType: 'time' },
  { id: 'g15', name: 'fuel', label: 'เชื้อเพลิง', logicalType: 'select', options: [
    { value: 'petrol', label: 'เบนซิน', color: 'warning' },
    { value: 'diesel', label: 'ดีเซล', color: 'secondary' },
    { value: 'electric', label: 'ไฟฟ้า', color: 'primary' },
    { value: 'hybrid', label: 'ไฮบริด', color: 'info' },
  ] },
  { id: 'g16', name: 'features', label: 'อุปกรณ์', logicalType: 'multiSelect', options: [
    { value: 'gps', label: 'GPS' }, { value: 'camera', label: 'กล้องถอย' }, { value: 'cruise', label: 'ครูซคอนโทรล' },
  ] },
  { id: 'g17', name: 'driverId', label: 'คนขับ', logicalType: 'reference', referenceEntity: 'driver' },
  { id: 'g18', name: 'doc', label: 'เอกสาร', logicalType: 'file' },
  { id: 'g19', name: 'photo', label: 'รูปภาพ', logicalType: 'image' },
  { id: 'g20', name: 'meta', label: 'เมตาดาต้า', logicalType: 'json' },
  { id: 'g21', name: 'code', label: 'เลขที่', logicalType: 'autoNumber', readOnly: true },
  { id: 'g22', name: 'age', label: 'อายุ', logicalType: 'formula', readOnly: true, formula: 'YEAR(TODAY()) - {year}' },
  { id: 'g23', name: 'value', label: 'มูลค่า', logicalType: 'computed', readOnly: true, formula: '{price} * 0.9' },
];

const demoValues: Record<string, unknown> = {
  name: 'Ford Ranger', longText: 'รถกระบะประจำฝ่ายขาย\nจดทะเบียน กทม.', email: 'fleet@loghoizon.co.th', phone: '0812345678',
  url: 'https://example.com/manual', integer: 2018, number: 2.2, decimal: 2.2, currency: 985000, percentage: 7,
  boolean: true, date: '2018-03-15', datetime: '2026-09-28T09:30:00Z', time: '09:30',
  select: 'diesel', multiSelect: ['gps', 'camera'], reference: 'rec_d1',
  file: 'https://cdn.example.com/docs/ins.pdf', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
  json: { color: 'ขาว', gear: 'auto' }, autoNumber: 'VH-0001', formula: 8, computed: 916050,
};

const inputStates = ['default', 'error', 'disabled', 'loading', 'readonly'] as const;
const badgeColors = ['primary', 'secondary', 'neutral', 'success', 'info', 'warning', 'error'] as const;

const tableColumns = [
  { key: 'plateNo', label: t('fields.plateNo') },
  { key: 'brand', label: t('fields.brand') },
  { key: 'model', label: t('fields.model') },
  { key: 'year', label: t('fields.year') },
];
const tableRows = (fixtureVehicleEntity().records ?? []).slice(0, 5);

const kanbanStatus = fixtureVehicleEntity().fields.find((f) => f.name === 'status')?.options ?? [];
const kanbanRecords = computed(() => (fixtureVehicleEntity().records ?? []).slice(0, 6));
const vehicleEntityFields = computed(() => entity('vehicle', 'vehicle')?.fields ?? fixtureVehicleEntity().fields);

const calendarEvents = [
  { id: 'e1', title: 'ซื้อ VH-0001', start: new Date(2026, 9, 12), color: 'primary' as const },
  { id: 'e2', title: 'ซื้อ VH-0002', start: new Date(2026, 9, 20), color: 'secondary' as const },
  { id: 'e3', title: 'ซื้อ VH-0006', start: new Date(2026, 9, 20), color: 'warning' as const },
  { id: 'e4', title: 'ซื้อ VH-0007', start: new Date(2026, 10, 2), color: 'error' as const },
];

const permMatrix = fixturePermissions.matrix;
const permRoles = fixturePermissions.roles.map((r) => ({ id: r.id, name: r.name, count: r.count }));

const wfNodes = [
  { id: 'start', type: 'start', label: 'เริ่มต้น' },
  { id: 'available', type: 'step', label: 'ว่าง' },
  { id: 'reserved', type: 'step', label: 'จองแล้ว' },
  { id: 'in_service', type: 'step', label: 'ใช้งานอยู่' },
  { id: 'end', type: 'end', label: 'สิ้นสุด' },
];
const wfEdges = [
  { id: 'e1', source: 'start', target: 'available', guard: null },
  { id: 'e2', source: 'available', target: 'reserved', guard: null },
  { id: 'e3', source: 'reserved', target: 'in_service', guard: '{assignedDriverId} != null', guardReason: 'Assign a driver first' },
  { id: 'e4', source: 'in_service', target: 'end', guard: null },
];

function toastDemo(color: 'neutral' | 'info' | 'success' | 'warning' | 'error') {
  toast.add({ title: t('gallery.toastTitle'), description: t('gallery.toastDescription'), color });
}

const modalOpen = ref(false);
const slideoverOpen = ref(false);
const paletteOpen = ref(false);

const formulaFields = demoFields.filter((f) => ['text', 'integer', 'decimal', 'currency', 'select'].includes(f.logicalType));

const fuelOptions = computed(() => demoFields.find((f) => f.name === 'fuel')!.options!.map((o) => o.label));
const featureOptions = computed(() => demoFields.find((f) => f.name === 'features')!.options!.map((o) => o.label));
const statusLabels = computed(() => fixtureVehicleEntity().fields.find((f) => f.name === 'status')!.options!.map((o) => o.label));

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <NxPageHeader icon="i-lucide-sparkles" :title="t('gallery.title')" :description="t('gallery.description')">
      <template #actions>
        <UButton icon="i-lucide-palette" variant="outline" :label="t('gallery.toggleTheme')" @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'" />
      </template>
    </NxPageHeader>

    <!-- Actions -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.actions') }}</h2>
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
        <div class="flex flex-col gap-6">
          <div class="flex flex-wrap items-end gap-4">
            <div v-for="variant in ['solid', 'soft', 'outline', 'ghost', 'link']" :key="variant" class="flex flex-col gap-2">
              <p class="text-nexa-caption text-dimmed uppercase">{{ variant }}</p>
              <div class="flex gap-2">
                <UButton v-for="color in ['primary', 'secondary', 'neutral', 'error']" :key="color" :variant="variant" :color="color" :label="t('gallery.colorVariant', { color, variant: t(`gallery.variant${capitalize(variant)}`) })" />
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton size="sm" :label="t('gallery.buttonSm')" />
            <UButton size="md" :label="t('gallery.buttonMd')" />
            <UButton size="lg" :label="t('gallery.buttonLg')" />
            <UButton :label="t('gallery.loading')" loading />
            <UButton :label="t('common.disabled')" disabled />
            <UButton icon="i-lucide-plus" :label="t('gallery.leadingIcon')" />
            <UButton trailing-icon="i-lucide-arrow-right" :label="t('gallery.trailingIcon')" />
            <UButton icon="i-lucide-plus" square />
            <UButton icon="i-lucide-plus" square variant="outline" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge v-for="color in badgeColors" :key="`${color}-solid`" :color="color" variant="solid" size="md">{{ t('gallery.colorVariant', { color, variant: t('gallery.variantSolid') }) }}</UBadge>
            <UBadge v-for="color in badgeColors" :key="`${color}-soft`" :color="color" variant="soft" size="md">{{ t('gallery.colorVariant', { color, variant: t('gallery.variantSoft') }) }}</UBadge>
            <UBadge v-for="color in badgeColors" :key="`${color}-subtle`" :color="color" variant="subtle" size="md">{{ t('gallery.colorVariant', { color, variant: t('gallery.variantSoft') }) }}</UBadge>
            <UBadge v-for="color in badgeColors" :key="`${color}-outline`" :color="color" variant="outline" size="md">{{ t('gallery.colorVariant', { color, variant: t('gallery.variantOutline') }) }}</UBadge>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UChip color="primary" standalone dot />
            <UChip color="success" standalone dot />
            <UChip color="error" standalone>3</UChip>
            <UChip color="warning" standalone>12</UChip>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <NxFilterChip :label="t('gallery.chipStatus')" color="primary" removable @remove="() => {}" />
            <NxFilterChip :label="t('gallery.chipBrand')" icon="i-lucide-filter" removable @remove="() => {}" />
            <NxFilterChip :label="t('gallery.chipYear')" removable @remove="() => {}" />
          </div>
          <div class="flex items-end gap-4">
            <UAvatar size="xs" text="SJ" />
            <UAvatar size="sm" text="NP" />
            <UAvatar size="md" text="ST" />
            <UAvatar size="lg" text="MS" />
            <UAvatar size="xl" icon="i-lucide-user" />
            <UAvatar size="md" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="avatar" />
            <UAvatarGroup :users="[{ name: 'Somchai J.', initials: 'SJ' }, { name: 'Nattapong P.', initials: 'NP' }, { name: 'Manee S.', initials: 'MS' }, { name: 'Pongsak R.', initials: 'PR' }]" size="md" :max="3" />
          </div>
          <div class="flex items-center gap-2">
            <UKbd value="Ctrl" />+<UKbd value="K" />
            <UKbd value="Shift" size="lg" />+<UKbd value="L" size="lg" />
          </div>
          <div class="flex items-center gap-4">
            <NxLogo type="mark" size="sm" />
            <NxLogo type="mark" size="md" />
            <NxLogo type="mark" size="lg" />
            <NxLogo type="full" size="md" />
            <NxLogo type="full" size="lg" />
          </div>
        </div>
      </UCard>
    </section>

    <!-- Data display -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.data') }}</h2>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('gallery.cardTitle') }}</p>
          </template>
          <p class="text-nexa-body text-muted">{{ t('gallery.cardBody') }}</p>
          <template #footer>
            <UButton size="sm" variant="ghost" :label="t('common.actions')" />
          </template>
        </UCard>
        <div class="flex flex-col gap-3">
          <UAlert v-for="color in ['primary', 'success', 'info', 'warning', 'error']" :key="color" :color="color" variant="soft" :title="`${t('gallery.alertTitle')} (${color})`" :description="t('gallery.alertDescription')" />
        </div>
        <div class="flex flex-col gap-4">
          <UProgress :model-value="40" size="sm" />
          <UProgress :model-value="60" size="md" color="success" />
            <UStepper :model-value="1" :items="[t('gallery.step1'), t('gallery.step2'), t('gallery.step3')]" class="max-w-sm" />
        </div>
        <div class="flex flex-col gap-4">
          <NxStatCard :title="t('gallery.statVehicles')" :value="342" trend="{ dir: 'up', text: '+4 vs last month' }" icon="i-lucide-truck" />
          <NxStatCard :title="t('gallery.statMaintenance')" :value="41" trend="{ dir: 'down', text: '-8%' }" icon="i-lucide-wrench" />
          <NxStatCard :title="t('gallery.statRetired')" :value="12" trend="{ dir: 'none', text: '0%' }" icon="i-lucide-archive" />
        </div>
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
          <UTable :columns="tableColumns" :rows="tableRows" :ui="{ base: 'min-w-full' }" />
        </UCard>
        <UTimeline :items="fixtureActivity.slice(0, 4).map((a) => ({ icon: 'i-lucide-circle', color: 'neutral', title: a.summary, description: a.user }))" />
        <div class="flex flex-col gap-3">
          <USkeleton class="h-4 w-full rounded" />
          <USkeleton class="h-4 w-2/3 rounded" />
          <USkeleton class="size-10 rounded-full" />
          <USeparator :label="t('gallery.separator')" />
        </div>
        <NxEmptyState icon="i-lucide-inbox" :title="t('records.emptyTitle')" :description="t('records.emptyHint', { entity: t('gallery.entityVehicle') })">
          <template #actions>
            <UButton color="primary" size="sm" :label="t('records.addFirst')" />
          </template>
        </NxEmptyState>
      </div>
    </section>

    <!-- Field renderers: 23 types x states -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.fields') }}</h2>
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
        <div class="mb-4 flex flex-wrap gap-2">
          <UBadge v-for="s in ['default', 'error', 'disabled', 'loading', 'readonly']" :key="s" color="neutral" variant="soft" size="sm">{{ s }}</UBadge>
        </div>
        <div v-for="state in inputStates" :key="state" class="mb-6 flex flex-col gap-4">
          <h3 class="text-nexa-subheading text-highlighted uppercase">{{ state }}</h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <NxFieldInput
              v-for="f in demoFields"
              :key="`${f.logicalType}-${state}`"
              :field="f"
              :model-value="state === 'readonly' ? demoValues[f.name] : undefined"
              :error="state === 'error' ? t('fields.errorExample') : ''"
              :disabled="state === 'disabled'"
              :loading="state === 'loading'"
            />
          </div>
        </div>
        <h3 class="mb-4 text-nexa-subheading text-highlighted uppercase">{{ t('gallery.valueViews') }}</h3>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="f in demoFields" :key="`val-${f.logicalType}`" class="flex flex-col gap-1 rounded-lg border border-default p-3">
            <p class="text-nexa-caption text-dimmed">{{ f.label }} · {{ f.logicalType }}</p>
            <NxFieldValue :field="f" :value="demoValues[f.name]" view="table" />
            <NxFieldValue :field="f" :value="demoValues[f.name]" view="kanban" />
            <NxFieldValue :field="f" :value="demoValues[f.name]" view="detail" module-key="vehicle" />
          </div>
        </div>
      </UCard>
    </section>

    <!-- Forms -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.forms') }}</h2>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
          <div class="flex flex-col gap-4">
            <UInput :label="t('fields.name')" :placeholder="t('gallery.placeholderExample')" :hint="t('gallery.placeholderExample')" :error="t('fields.errorExample')" />
            <UTextarea :label="t('fields.address')" :placeholder="t('gallery.placeholderExample')" />
            <USelect :label="t('fields.fuel')" :items="fuelOptions" :placeholder="t('gallery.placeholderExample')" />
            <USelectMenu :label="t('gallery.featuresLabel')" :items="featureOptions" multiple :placeholder="t('gallery.placeholderExample')" />
            <UCheckbox :label="t('form.keepDraft')" />
            <URadioGroup :label="t('gallery.radioLabel')" :items="['A', 'B', 'C']" />
            <USwitch :label="t('fields.active')" />
            <UInputDate :label="t('fields.date')" />
            <UInputTime :label="t('fields.time')" />
          </div>
        </UCard>
        <div class="flex flex-col gap-4">
          <NxCodeBlock :code="{ module: 'vehicle', entity: 'vehicle', version: 13 }" language="json" />
          <NxCodeBlock code="YEAR(TODAY()) - {year}" language="formula" />
          <NxFormulaEditor v-model="formulaDemo" :fields="formulaFields" result-type="integer" error="" />
          <NxFormulaEditor v-model="formulaDemo" :fields="formulaFields" result-type="integer" :error="t('gallery.cycleError')" readonly />
        </div>
      </div>
    </section>

    <!-- Navigation -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.navigation') }}</h2>
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
        <div class="flex flex-col gap-6">
          <UTabs v-model="galleryTab" :items="[{ label: t('gallery.tab1'), value: 'a' }, { label: t('gallery.tab2'), value: 'b' }, { label: t('gallery.tab3'), value: 'c' }]" />
          <UBreadcrumb :links="[{ label: t('nav.home'), to: '/' }, { label: t('nav.modules'), to: '/builder/modules' }, { label: t('gallery.breadcrumbExample') }]" />
          <UPagination v-model="galleryPage" :page-count="10" :total="128" size="sm" />
          <UDropdownMenu :items="[[
            { label: t('common.edit'), icon: 'i-lucide-pencil' },
            { label: t('common.delete'), icon: 'i-lucide-trash-2', color: 'error' },
            { label: t('gallery.selectedItem'), icon: 'i-lucide-check', disabled: true },
          ]]">
            <UButton variant="outline" icon="i-lucide-more-vertical" :label="t('common.actions')" />
          </UDropdownMenu>
          <UNavigationMenu :links="[{ label: t('nav.home'), icon: 'i-lucide-home', to: '/' }, { label: t('nav.dashboards'), icon: 'i-lucide-layout-dashboard', to: '/dashboards' }, { label: t('nav.settings'), icon: 'i-lucide-settings', to: '/settings', disabled: true }]" />
        </div>
      </UCard>
    </section>

    <!-- Records views -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.records') }}</h2>
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead>
              <tr class="border-b border-default bg-[--ui-bg-muted]">
                <th class="w-10 px-3 py-2"><UCheckbox /></th>
                <th v-for="c in tableColumns" :key="c.key" class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ c.label }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('fields.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in tableRows" :key="r.id" class="border-b border-default last:border-b-0 hover:bg-[--ui-bg-muted]">
                <td class="px-3 py-2"><UCheckbox /></td>
                <td v-for="c in tableColumns" :key="c.key" class="px-3 py-2">
                  <NxFieldValue :field="demoFields.find((f) => f.name === c.key) ?? demoFields[0]" :value="r[c.key]" view="table" />
                </td>
                <td class="px-3 py-2">
                  <NxFieldValue :field="demoFields.find((f) => f.name === 'fuel')!" :value="r.status" view="table" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <div class="flex gap-3 overflow-x-auto">
        <div v-for="col in kanbanStatus" :key="col.value" class="w-64 shrink-0 rounded-xl border border-default bg-[--ui-bg-muted] p-2">
          <p class="px-1 py-2 text-nexa-body-medium text-highlighted">{{ col.label }} <span class="text-dimmed">({{ kanbanRecords.filter((r) => r.status === col.value).length }})</span></p>
          <draggable :list="kanbanRecords.filter((r) => r.status === col.value)" group="gallery" item-key="id" class="flex flex-col gap-2">
            <template #item="{ element }">
              <NxKanbanCard :record="element" :fields="vehicleEntityFields" display-field="plateNo" status-field="status" />
            </template>
          </draggable>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <NxCalendarView :events="calendarEvents" />
        <div class="grid grid-cols-2 gap-4">
          <UCard v-for="r in tableRows.slice(0, 4)" :key="r.id" class="overflow-hidden rounded-xl" :ui="{ body: { padding: 'p-0' }, root: 'overflow-hidden' }">
            <div class="aspect-video bg-[--ui-bg-accented]">
              <img v-if="r.image" :src="String(r.image)" :alt="String(r.plateNo)" class="h-full w-full object-cover" @error="($event.target as HTMLImageElement).style.display = 'none'">
            </div>
            <div class="p-3">
              <p class="text-nexa-body-strong text-highlighted">{{ r.plateNo }}</p>
              <p class="text-nexa-small text-muted">{{ r.brand }} {{ r.model }}</p>
            </div>
          </UCard>
        </div>
      </div>
    </section>

    <!-- Charts -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.charts') }}</h2>
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <NxChartCard :title="t('dashboard.byBrand')" :description="t('dashboard.vehicleCount')">
          <div class="h-56"><NxBarChart :labels="['Ford', 'Toyota', 'Honda', 'BYD']" :values="[96, 88, 64, 32]" title="vehicles" /></div>
        </NxChartCard>
        <NxChartCard :title="t('gallery.trend')" :description="t('dashboard.vehicleCount')">
          <div class="h-56"><NxLineChart :labels="['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.']" :values="[12, 19, 8, 24]" title="records" /></div>
        </NxChartCard>
        <NxChartCard :title="t('dashboard.byStatus')" :description="t('dashboard.vehicleCount')">
          <div class="h-56"><NxDonutChart :labels="statusLabels" :values="[289, 12, 24]" title="status" /></div>
        </NxChartCard>
      </div>
    </section>

    <!-- Builder -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.builder') }}</h2>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="flex flex-col gap-2">
          <NxFieldRow v-for="f in demoFields.slice(0, 5)" :key="f.id" :field="f" :selected="f.id === 'g1'" :error="f.id === 'g3' ? t('fields.errorExample') : ''">
            <template #default>
              <UButton icon="i-lucide-pencil" variant="ghost" size="xs" square />
            </template>
          </NxFieldRow>
        </div>
        <div class="flex flex-col gap-4">
          <NxPermissionsTable :roles="permRoles" :permissions="fixturePermissions.permissions" :matrix="permMatrix" :field-level="fixturePermissions.fieldLevel" />
          <NxPackageDiff :rows="fixturePackageDiff" />
        </div>
        <div class="h-64 xl:col-span-2">
          <NxWorkflowCanvas :nodes="wfNodes" :edges="wfEdges" />
        </div>
      </div>
    </section>

    <!-- Overlays -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.overlays') }}</h2>
      <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
        <div class="flex flex-wrap gap-2">
          <UButton color="primary" :label="t('gallery.openModal')" @click="modalOpen = true" />
          <UButton variant="outline" :label="t('gallery.openSlideover')" @click="slideoverOpen = true" />
          <UButton variant="outline" :label="t('gallery.openPalette')" @click="paletteOpen = true" />
          <UButton variant="outline" color="neutral" :label="t('gallery.toastNeutral')" @click="toastDemo('neutral')" />
          <UButton variant="outline" color="info" :label="t('gallery.toastInfo')" @click="toastDemo('info')" />
          <UButton variant="outline" color="success" :label="t('gallery.toastSuccess')" @click="toastDemo('success')" />
          <UButton variant="outline" color="warning" :label="t('gallery.toastWarning')" @click="toastDemo('warning')" />
          <UButton variant="outline" color="error" :label="t('gallery.toastError')" @click="toastDemo('error')" />
        </div>
      </UCard>
      <UModal v-model="modalOpen" :title="t('gallery.modalTitle')" :description="t('gallery.modalDescription')" :ui="{ content: 'max-w-md' }">
        <p class="text-nexa-body text-muted">{{ t('gallery.modalBody') }}</p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :label="t('common.cancel')" @click="modalOpen = false" />
            <UButton color="primary" :label="t('common.confirm')" @click="modalOpen = false" />
          </div>
        </template>
      </UModal>
      <USlideover v-model="slideoverOpen" :title="t('gallery.slideoverTitle')">
        <div class="flex flex-col gap-3 p-4">
          <p class="text-nexa-body text-muted">{{ t('gallery.slideoverBody') }}</p>
          <NxFieldInput :field="demoFields[0]" v-model="slideoverText" />
        </div>
        <template #footer>
          <div class="flex justify-end gap-2 border-t border-default p-4">
            <UButton variant="ghost" :label="t('common.cancel')" @click="slideoverOpen = false" />
            <UButton color="primary" :label="t('common.save')" @click="slideoverOpen = false" />
          </div>
        </template>
      </USlideover>
      <NxCommandPalette v-model:open="paletteOpen" />
    </section>

    <!-- Errors + offline -->
    <section class="flex flex-col gap-3">
      <h2 class="text-nexa-heading text-highlighted">{{ t('gallery.section.errors') }}</h2>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
          <NxErrorScreen status="403" :title="t('errors.title403')" :description="t('errors.description403')">
            <template #actions>
              <UButton color="primary" variant="outline" size="sm" :label="t('errors.requestAccess')" />
            </template>
          </NxErrorScreen>
        </UCard>
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
          <NxErrorScreen status="404" :title="t('errors.notFoundTitle')" :description="t('errors.notFoundHint')" request-id="req_01hzx8demo">
            <template #actions>
              <UButton color="primary" variant="outline" size="sm" :label="t('errors.backHome')" @click="navigateTo('/')" />
            </template>
          </NxErrorScreen>
        </UCard>
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-0' } }">
          <NxErrorScreen status="500" :title="t('errors.title500')" :description="t('errors.description500')" request-id="req_01hzx8demo">
            <template #actions>
              <UButton color="primary" variant="outline" size="sm" :label="t('common.retry')" />
            </template>
          </NxErrorScreen>
        </UCard>
      </div>
      <NxOfflineBanner />
    </section>
  </div>
</template>
