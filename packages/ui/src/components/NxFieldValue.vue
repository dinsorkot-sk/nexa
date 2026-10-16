<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { computed } from 'vue';
import { formatFieldDisplay, type ReferenceLabel } from '../lib/display';
import { inputKindOf } from '../lib/field-kinds';
import { mailtoHref, safeHref, telHref } from '../lib/safe-url';
import { useNxLocale, useNxMessages } from '../lib/locale';

/**
 * Read-only display of one stored value, for tables, detail pages and kanban cards. Text is formatted in the app
 * locale and never altered. Links are rendered only for values that pass the safe-URL check.
 */
const props = withDefaults(defineProps<{
  field: FieldDefinition;
  value: unknown;
  display?: 'table' | 'detail' | 'kanban';
  currency?: string;
  referenceLabel?: ReferenceLabel;
}>(), { display: 'detail', currency: undefined, referenceLabel: undefined });

const locale = useNxLocale();
const messages = useNxMessages();

const text = computed(() => formatFieldDisplay(props.field, props.value, {
  locale: locale.value,
  currency: props.currency,
  referenceLabel: props.referenceLabel,
  empty: messages.value.empty,
  yes: messages.value.yes,
  no: messages.value.no,
}));

const href = computed(() => {
  switch (props.field.type) {
    case 'email': return mailtoHref(props.value);
    case 'phone': return telHref(props.value);
    case 'url':
    case 'file':
    case 'image': return safeHref(props.value);
    default: return undefined;
  }
});

const isEmpty = computed(() => props.value === null || props.value === undefined || props.value === '');
const clampClass = computed(() => (props.display === 'table' ? 'truncate' : props.display === 'kanban' ? 'line-clamp-2' : 'break-words'));
const kind = computed(() => inputKindOf(props.field.type));
const mono = computed(() => (kind.value === 'json' || kind.value === 'number' || kind.value === 'integer' || kind.value === 'decimal' || kind.value === 'currency' || kind.value === 'percentage' ? 'tabular-nums' : ''));
</script>

<template>
  <a
    v-if="href"
    :href="href"
    :target="field.type === 'email' || field.type === 'phone' ? undefined : '_blank'"
    :rel="field.type === 'email' || field.type === 'phone' ? undefined : 'noopener noreferrer'"
    :class="['text-ui-text-highlighted underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ui-primary', clampClass, mono]"
  >{{ text }}</a>
  <span
    v-else
    :class="[clampClass, mono, isEmpty && 'text-ui-text-muted']"
  >{{ text }}</span>
</template>
