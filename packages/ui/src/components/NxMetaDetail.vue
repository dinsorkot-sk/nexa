<script setup lang="ts">
import type { FieldDefinition } from '@nexa/meta';
import { computed } from 'vue';
import type { ReferenceLabel } from '../lib/display';
import { useNxMessages } from '../lib/locale';
import NxActivityItem from './NxActivityItem.vue';
import NxCard from './NxCard.vue';
import NxFieldValue from './NxFieldValue.vue';

export interface NxMetaDetailRelation {
  /** The relation's id. */
  id: string;
  /** The name to show for the relation. */
  name: string;
  /** The records the relation links to, with the label to show for each. */
  targets: Array<{ id: string; label?: string }>;
}

export interface NxMetaDetailActivity {
  id: string;
  actor: string;
  action: string;
  time: string;
  description?: string;
  kind?: 'create' | 'update' | 'status' | 'comment';
  oldValue?: string;
  newValue?: string;
}

/**
 * The record page: the values of the record, the records its relations link to, and the trail of what happened to it.
 *
 * The record is the caller's, with the fields of the entity beside it, so every value is shown by the field that
 * owns it. The relations arrive with the records they link to and the label to show for each, because the label of
 * a reference is another record's value and the renderer does not fetch.
 */
const props = withDefaults(defineProps<{
  /** The record being shown. */
  record: { id: string; data: Record<string, unknown> };
  /** The fields of the entity the record belongs to. */
  fields: FieldDefinition[];
  /** The relations of the entity, with the records each one links to. */
  relations?: NxMetaDetailRelation[];
  /** The activity trail of the record. */
  activity?: NxMetaDetailActivity[];
  /** The currency the money fields are shown in. */
  currency?: string;
  /** The labels of the records a reference points at. */
  referenceLabel?: ReferenceLabel;
}>(), {
  relations: () => [],
  activity: () => [],
  currency: undefined,
  referenceLabel: undefined,
});

const emit = defineEmits<{ open: [recordId: string] }>();

const messages = useNxMessages();

/** The fields with their values, in the order the fields were defined. */
const entries = computed(() => props.fields.map((field) => ({ field, value: props.record.data[field.id] })));
</script>

<template>
  <div class="grid w-full gap-4 lg:grid-cols-2">
    <NxCard
      class="lg:col-span-2"
      :title="messages.detailFields"
    >
      <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="entry in entries"
          :key="entry.field.id"
          class="flex flex-col gap-0.5"
        >
          <dt class="text-xs font-medium text-ui-text-muted">
            {{ entry.field.label }}
          </dt>
          <dd class="text-sm text-ui-text">
            <NxFieldValue
              :field="entry.field"
              :value="entry.value"
              :currency="props.currency"
              :reference-label="props.referenceLabel"
            />
          </dd>
        </div>
      </dl>
    </NxCard>

    <NxCard
      v-if="props.relations.length"
      :title="messages.detailRelations"
    >
      <div class="flex flex-col gap-4">
        <div
          v-for="relation in props.relations"
          :key="relation.id"
          class="flex flex-col gap-1.5"
        >
          <p class="text-xs font-medium text-ui-text-muted">
            {{ relation.name }}
          </p>
          <ul
            v-if="relation.targets.length"
            class="flex flex-col gap-1"
          >
            <li
              v-for="target in relation.targets"
              :key="target.id"
              class="text-sm text-ui-text"
            >
              <button
                type="button"
                class="rounded text-ui-primary underline underline-offset-2 outline-none hover:text-ui-primary-hover focus-visible:ring-2 focus-visible:ring-ui-primary"
                @click="emit('open', target.id)"
              >
                {{ target.label || target.id }}
              </button>
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-ui-text-muted"
          >
            {{ messages.detailNoLinks }}
          </p>
        </div>
      </div>
    </NxCard>

    <NxCard
      v-if="props.activity.length"
      :title="messages.detailActivity"
    >
      <ol class="flex flex-col gap-3">
        <li
          v-for="(entry, index) in props.activity"
          :key="entry.id"
        >
          <NxActivityItem
            :actor="entry.actor"
            :action="entry.action"
            :time="entry.time"
            :description="entry.description"
            :kind="entry.kind"
            :old-value="entry.oldValue"
            :new-value="entry.newValue"
            :last="index === props.activity.length - 1"
          />
        </li>
      </ol>
    </NxCard>
  </div>
</template>
