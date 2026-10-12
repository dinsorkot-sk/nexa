<template>
  <div :class="cn('grid gap-6', props.class)">
    <UiCard class="p-4">
      <h3 class="mb-3 text-sm font-semibold text-foreground">
        {{ t('detail.fields') }}
      </h3>
      <dl class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="entry in fieldEntries"
          :key="entry.id"
          class="grid gap-1"
        >
          <dt class="text-xs font-medium text-foreground-muted">
            {{ entry.label }}
          </dt>
          <dd class="text-sm text-foreground">
            <MetaFieldValue
              :field="entry"
              :value="record.data[entry.id]"
              :reference-label="referenceLabel"
              :currency="currency"
            />
          </dd>
        </div>
      </dl>
    </UiCard>

    <UiCard
      v-if="relations.length"
      class="p-4"
    >
      <h3 class="mb-3 text-sm font-semibold text-foreground">
        {{ t('detail.relations') }}
      </h3>
      <div
        v-for="relation in relations"
        :key="relation.relationId"
        class="mb-4 last:mb-0"
      >
        <p class="mb-1 text-xs font-medium text-foreground-muted">
          {{ relation.name }}
        </p>
        <ul class="grid gap-1">
          <li
            v-for="target in relation.targets"
            :key="target.id"
            class="text-sm text-foreground"
          >
            <button
              v-if="relation.onOpen"
              type="button"
              class="text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="relation.onOpen(target.id)"
            >
              {{ target.label || target.id }}
            </button>
            <span v-else>{{ target.label || target.id }}</span>
          </li>
          <li
            v-if="!relation.targets.length"
            class="text-sm text-foreground-subtle"
          >
            {{ t('detail.noLinks') }}
          </li>
        </ul>
      </div>
    </UiCard>

    <UiCard class="p-4">
      <h3 class="mb-3 text-sm font-semibold text-foreground">
        {{ t('detail.activity') }}
      </h3>
      <ol class="grid gap-2">
        <li
          v-for="entry in activity.items"
          :key="entry.id"
          class="grid gap-0.5 border-b border-border pb-2 last:border-b-0"
        >
          <p class="text-sm text-foreground">
            <span class="font-medium">{{ entry.actorName }}</span>
            <span class="text-foreground-muted"> — {{ entry.action }}</span>
          </p>
          <p class="text-xs text-foreground-muted">
            <time :datetime="entry.occurredAt">{{ formatActivityTime(entry.occurredAt) }}</time>
          </p>
        </li>
        <li
          v-if="!activity.items.length"
          class="text-sm text-foreground-subtle"
        >
          {{ t('detail.noActivity') }}
        </li>
      </ol>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldDefinition } from '@nexa/meta';
import { cn } from '../cn';
import MetaFieldValue from './MetaFieldValue.vue';
import UiCard from './UiCard.vue';
import { type RelationOpen, type MetaReferenceLabel } from './form';

/**
 * Read-only record detail: field values, relation links, and the activity trail. Everything is
 * data the caller loaded from the records API — this component never fetches. Hidden fields are
 * omitted even if the caller passes them (the server redacts them, and detail must not leak them).
 */
const props = defineProps<{
  record: { id: string; version: number; data: Record<string, unknown> };
  fields: FieldDefinition[];
  /** Activity trail as `GET .../records/:id/activity` returns it, minus the changes payload. */
  activity: {
    items: Array<{ id: string; action: string; actorId: string | null; actorName: string; occurredAt: string }>;
    total: number;
  };
  /** Relation links as `GET .../records/:id/relations/:relationId` returns them, one entry per relation. */
  relations: Array<{
    relationId: string;
    name: string;
    targets: Array<{ id: string; label?: string }>;
    /** Present makes each target a button that opens it; absent renders plain text. */
    onOpen?: RelationOpen;
  }>;
  referenceLabel?: MetaReferenceLabel;
  currency?: string;
  class?: string;
}>();

const { t, locale } = useI18n();

/** Hidden fields never show, even if a caller passes them: the server redacts them. */
const fieldEntries = computed(() => props.fields.filter((field) => !field.options.hidden));

const numberFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }));
function formatActivityTime(occurredAt: string): string {
  const instant = new Date(occurredAt);
  return Number.isNaN(instant.getTime()) ? occurredAt : numberFormat.value.format(instant);
}
</script>
