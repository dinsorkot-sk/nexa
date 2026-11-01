<script setup lang="ts">
import type { FieldSpec } from '@nexa/types';

const props = withDefaults(defineProps<{
  field: FieldSpec;
  value?: unknown;
  view?: 'table' | 'kanban' | 'detail';
  moduleKey?: string;
}>(), { value: undefined, view: 'detail', moduleKey: undefined });

const { t } = useI18n();
const { recordLabel } = useMetadata();

const broken = ref(false);

const optionLabel = computed(() => {
  const opt = props.field.options?.find((o) => o.value === String(props.value));
  return opt?.label ?? String(props.value ?? '');
});

const optionColor = computed(() => {
  const opt = props.field.options?.find((o) => o.value === String(props.value));
  return (opt?.color as 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral') ?? 'neutral';
});

const multiValues = computed(() => (Array.isArray(props.value) ? props.value.filter(Boolean) as string[] : []));

const fileName = computed(() => {
  if (typeof props.value !== 'string' || !props.value) return '';
  const parts = props.value.split('/');
  return parts[parts.length - 1] || props.value;
});

const referenceLabel = computed(() => {
  if (!props.field.referenceEntity || props.value === undefined || props.value === null || props.value === '') return '—';
  return recordLabel(props.field.referenceEntity, String(props.value));
});

const referenceTo = computed(() => {
  if (!props.moduleKey || !props.field.referenceEntity || !props.value) return undefined;
  return `/m/${props.moduleKey}/${props.field.referenceEntity}/${props.value}`;
});

function isEmpty(): boolean {
  return props.value === undefined || props.value === null || props.value === '' || (Array.isArray(props.value) && props.value.length === 0);
}
</script>

<template>
  <!-- empty -->
  <span v-if="isEmpty()" class="text-nexa-body text-dimmed">—</span>

  <!-- text-like -->
  <template v-else-if="['text', 'longText'].includes(field.logicalType)">
    <span :class="[view === 'table' ? 'block max-w-full truncate' : 'whitespace-pre-wrap', view === 'kanban' ? 'text-nexa-small' : 'text-nexa-body']">{{ String(value) }}</span>
  </template>

  <ULink v-else-if="field.logicalType === 'email'" :href="`mailto:${String(value)}`" :class="view === 'table' ? 'block max-w-full truncate' : ''">{{ String(value) }}</ULink>
  <ULink v-else-if="field.logicalType === 'phone'" :href="`tel:${String(value)}`" :class="view === 'table' ? 'block max-w-full truncate' : ''">{{ String(value) }}</ULink>
  <ULink v-else-if="field.logicalType === 'url'" :href="String(value)" target="_blank" external :class="view === 'table' ? 'block max-w-full truncate' : ''">
    {{ String(value) }}
    <template #trailing>
      <UIcon name="i-lucide-external-link" class="size-3" />
    </template>
  </ULink>

  <!-- numbers -->
  <span v-else-if="field.logicalType === 'integer'" :class="view === 'kanban' ? 'text-nexa-small' : ''">{{ formatNumber(Number(value)) }}</span>
  <span v-else-if="field.logicalType === 'number' || field.logicalType === 'decimal'" :class="view === 'kanban' ? 'text-nexa-small' : ''">{{ formatDecimal(value as string | number, field.scale ?? 2) }}</span>
  <span v-else-if="field.logicalType === 'currency'" :class="view === 'kanban' ? 'text-nexa-small' : ''">{{ formatCurrency(value as string | number) }}</span>
  <span v-else-if="field.logicalType === 'percentage'">{{ formatDecimal(value as string | number, field.scale ?? 2) }}%</span>

  <!-- boolean -->
  <UBadge v-else-if="field.logicalType === 'boolean'" :color="value ? 'success' : 'neutral'" :variant="view === 'table' ? 'soft' : 'soft'" size="sm">
    <template #leading>
      <UIcon :name="value ? 'i-lucide-check' : 'i-lucide-x'" class="size-3" />
    </template>
    {{ value ? t('fields.yes') : t('fields.no') }}
  </UBadge>

  <!-- dates -->
  <span v-else-if="field.logicalType === 'date'">{{ formatDate(String(value)) }}</span>
  <span v-else-if="field.logicalType === 'datetime'">{{ formatDateTime(String(value)) }}</span>
  <span v-else-if="field.logicalType === 'time'">{{ String(value) }}</span>

  <!-- choice -->
  <UBadge v-else-if="field.logicalType === 'select'" :color="optionColor" variant="soft" size="sm">{{ optionLabel }}</UBadge>
  <div v-else-if="field.logicalType === 'multiSelect'" class="flex flex-wrap items-center gap-1">
    <UBadge v-for="(v, i) in (view === 'table' ? multiValues.slice(0, 2) : multiValues)" :key="i" color="neutral" variant="soft" size="sm">{{ v }}</UBadge>
    <span v-if="view === 'table' && multiValues.length > 2" class="text-nexa-caption text-muted">+{{ multiValues.length - 2 }}</span>
  </div>

  <!-- reference -->
  <ULink v-else-if="field.logicalType === 'reference' && referenceTo" :to="referenceTo" class="flex items-center gap-1">{{ referenceLabel }}<UIcon name="i-lucide-arrow-up-right" class="size-3" /></ULink>
  <span v-else-if="field.logicalType === 'reference'" class="text-nexa-body">{{ referenceLabel }}</span>

  <!-- media -->
  <ULink v-else-if="field.logicalType === 'file'" :href="String(value)" target="_blank" external class="flex items-center gap-1.5">
    <UIcon name="i-lucide-paperclip" class="size-4 text-muted" />
    <span class="truncate">{{ fileName }}</span>
  </ULink>
  <template v-else-if="field.logicalType === 'image'">
    <img v-if="!broken" :src="String(value)" :alt="field.label" :class="view === 'detail' ? 'h-40 w-full rounded-lg border border-default object-cover' : 'size-8 rounded-md border border-default object-cover'" @error="broken = true">
    <span v-else class="text-nexa-caption text-dimmed">{{ t('fields.imageUnreachable') }}</span>
  </template>

  <!-- json -->
  <span v-else-if="field.logicalType === 'json' && view === 'table'" class="font-mono text-nexa-mono-small text-muted">{…}</span>
  <NxCodeBlock v-else-if="field.logicalType === 'json'" :code="value as Record<string, unknown>" language="json" />

  <!-- calculated -->
  <span v-else-if="field.logicalType === 'autoNumber'" class="font-mono text-nexa-mono">{{ String(value) }}</span>
  <span v-else-if="field.logicalType === 'formula' || field.logicalType === 'computed'" class="flex items-center gap-1.5">
    <UIcon name="i-lucide-function-square" class="size-3.5 text-muted" />
    <span :class="view === 'kanban' ? 'text-nexa-small' : 'text-nexa-body'">{{ String(value) }}</span>
  </span>

  <span v-else class="text-nexa-body">{{ String(value) }}</span>
</template>
