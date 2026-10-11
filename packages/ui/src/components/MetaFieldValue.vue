<template>
  <a
    v-if="link"
    :href="link"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer nofollow' : undefined"
    class="text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >{{ display }}</a>
  <span
    v-else-if="field.type === 'multiSelect' && chips.length"
    class="inline-flex flex-wrap gap-1"
  >
    <UiBadge
      v-for="chip in chips"
      :key="chip"
    >{{ chip }}</UiBadge>
  </span>
  <img
    v-else-if="field.type === 'image' && imageSrc"
    :src="imageSrc"
    :alt="field.label"
    referrerpolicy="no-referrer"
    loading="lazy"
    class="max-h-24 max-w-full rounded border border-border object-contain"
  >
  <span
    v-else
    :class="display ? '' : 'text-foreground-subtle'"
  >{{ display || t('common.empty') }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldDefinition } from '@nexa/meta';
import { formatFieldDisplay, type ReferenceLabel } from '../render/display';
import { mailtoHref, safeHref, telHref } from '../render/safe-url';
import UiBadge from './UiBadge.vue';

const props = defineProps<{
  field: FieldDefinition;
  value: unknown;
  /** Resolves a reference id to a label. Without it the id is shown. */
  referenceLabel?: ReferenceLabel;
  /** Currency for `currency` fields, because the field metadata does not carry one. */
  currency?: string;
}>();

const { t, locale } = useI18n();
const lang = computed<'th' | 'en'>(() => (locale.value === 'th' ? 'th' : 'en'));

const display = computed(() => formatFieldDisplay(props.field, props.value, {
  locale: lang.value,
  referenceLabel: props.referenceLabel,
  currency: props.currency,
  yes: t('common.yes'),
  no: t('common.no'),
}));

const chips = computed(() => {
  const { value, field } = props;
  if (!Array.isArray(value)) return [];
  return value.map((item) => field.options.choices?.find((choice) => choice.value === item)?.label ?? String(item));
});

/** Links are built only from the allowlist in safe-url.ts, so a stored value can never become a script URL. */
const link = computed(() => {
  const { type } = props.field;
  if (type === 'email') return mailtoHref(props.value);
  if (type === 'phone') return telHref(props.value);
  if (type === 'url' || type === 'file') return safeHref(props.value);
  return undefined;
});
const external = computed(() => props.field.type === 'url' || props.field.type === 'file');
const imageSrc = computed(() => safeHref(props.value));
</script>
