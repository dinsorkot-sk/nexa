<script setup lang="ts">
import type { FieldDefinition, ViewDefinition } from '@nexa/meta';
import { computed } from 'vue';
import { formatFieldDisplay } from '../lib/display';
import { safeHref } from '../lib/safe-url';
import { useNxLocale, useNxMessages } from '../lib/locale';
import NxCard from './NxCard.vue';
import NxFieldValue from './NxFieldValue.vue';

/**
 * The records as a grid of cards with a picture.
 *
 * The view says which field is the picture and which field is the title, and its columns say which fields the rest
 * of the card carries. A stored value that is not a safe link is not drawn as a picture: the same check the rest of
 * the library uses for a link decides it.
 */
const props = withDefaults(defineProps<{
  /** The view being rendered. Its image field and its title say how a card looks. */
  view: ViewDefinition;
  /** The fields of the entity the view belongs to. */
  fields: FieldDefinition[];
  /** The records to show as cards. */
  records?: Array<{ id: string; data: Record<string, unknown> }>;
  /** The currency the money fields are shown in. */
  currency?: string;
}>(), {
  records: () => [],
  currency: undefined,
});

const emit = defineEmits<{ open: [recordId: string] }>();

const locale = useNxLocale();
const messages = useNxMessages();

/** The field a card shows as its picture. */
const imageField = computed(() => props.view.imageField ? props.fields.find((field) => field.id === props.view.imageField) : undefined);

/** The field a card shows as its title: the view's title field, or its first visible column. */
const titleField = computed(() => {
  const named = props.view.titleField ? props.fields.find((field) => field.id === props.view.titleField) : undefined;
  if (named) return named;
  const first = props.view.columns.find((column) => column.visible !== false);
  return first ? props.fields.find((field) => field.id === first.fieldId) : undefined;
});

/** The fields a card carries below the title: the view's visible columns, without the title. */
const cardFields = computed(() => props.view.columns
  .filter((column) => column.visible !== false)
  .map((column) => props.fields.find((field) => field.id === column.fieldId))
  .filter((field): field is FieldDefinition => field !== undefined)
  .filter((field) => field.id !== titleField.value?.id));

/** The cards, with the picture each one shows. */
const cards = computed(() => props.records.map((record) => {
  const field = imageField.value;
  const value = field ? record.data[field.id] : undefined;
  return {
    record,
    picture: field ? safeHref(value) : undefined,
    title: titleField.value ? display(titleField.value, record.data[titleField.value.id]) : '',
  };
}));

function display(field: FieldDefinition, value: unknown): string {
  return formatFieldDisplay(field, value, {
    locale: locale.value,
    currency: props.currency,
    empty: messages.value.empty,
    yes: messages.value.yes,
    no: messages.value.no,
  });
}
</script>

<template>
  <div class="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    <NxCard
      v-for="card in cards"
      :key="card.record.id"
      variant="soft"
      class="flex flex-col gap-2 p-0"
    >
      <img
        v-if="card.picture"
        :src="card.picture"
        :alt="card.title"
        class="h-32 w-full rounded-t-ui-xl object-cover"
      >
      <button
        type="button"
        class="flex flex-col gap-1 rounded px-4 py-3 text-left outline-none hover:bg-ui-bg focus-visible:ring-2 focus-visible:ring-ui-primary"
        @click="emit('open', card.record.id)"
      >
        <span class="truncate text-sm font-medium text-ui-text-highlighted">
          {{ card.title }}
        </span>
        <span
          v-for="field in cardFields"
          :key="field.id"
          class="flex items-baseline justify-between gap-2 text-xs text-ui-text-muted"
        >
          <span>{{ field.label }}</span>
          <NxFieldValue
            :field="field"
            :value="card.record.data[field.id]"
            :currency="props.currency"
          />
        </span>
      </button>
    </NxCard>
  </div>
</template>
