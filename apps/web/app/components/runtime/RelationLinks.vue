<template>
  <div class="space-y-4">
    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
    <UiCard v-for="state in relationStates" :key="state.relation.id" class="p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-medium text-slate-100">{{ relationTitle(state) }}</h3>
          <p class="mt-0.5 text-xs text-slate-500">{{ directionLabel(state) }} · {{ state.relation.type }}</p>
        </div>
      </div>

      <ul v-if="state.links.length" class="mt-3 divide-y divide-slate-800">
        <li v-for="link in state.links" :key="link.id" class="flex items-center justify-between py-2 text-sm">
          <span class="text-slate-100">{{ linkLabel(state, link) }}</span>
          <UiButton variant="ghost" size="sm" :disabled="unlinking === `${state.relation.id}:${link.id}`" @click="unlink(state, link)">
            {{ unlinking === `${state.relation.id}:${link.id}` ? 'Removing…' : 'Unlink' }}
          </UiButton>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-slate-400">No linked records.</p>

      <div v-if="state.isSource" class="mt-3 flex items-center gap-2">
        <UiSelect v-model="state.selectedId" class="max-w-xs" :aria-label="`Add link for ${state.relation.id}`">
          <option value="">Select a record…</option>
          <option v-for="candidate in state.candidates" :key="candidate.id" :value="candidate.id">{{ candidate.label }}</option>
        </UiSelect>
        <UiButton variant="secondary" size="sm" :disabled="!state.selectedId || linking === state.relation.id" @click="link(state)">
          {{ linking === state.relation.id ? 'Linking…' : 'Link' }}
        </UiButton>
      </div>
    </UiCard>
    <p v-if="relationStates.length === 0" class="text-sm text-slate-400">No relations defined for this entity.</p>
  </div>
</template>

<script setup lang="ts">
import type { EntityDefinition, FieldDefinition, RelationDefinition } from '@nexa/meta';
import { UiSelect } from '@nexa/ui';
import { apiErrorFromResponse } from '../../utils/api-error';
import {
  createRelationLink,
  deleteRelationLink,
  listRecords,
  listRelationLinks,
  type RuntimeRecord,
} from '../../composables/useRuntime';

interface RelationState {
  relation: RelationDefinition;
  isSource: boolean;
  otherEntityId: string;
  links: RuntimeRecord[];
  candidates: Array<{ id: string; label: string }>;
  selectedId: string;
}

const props = defineProps<{
  moduleId: string;
  entityId: string;
  recordId: string;
  relations: RelationDefinition[];
  entities: EntityDefinition[];
  fields: FieldDefinition[];
}>();

const config = useRuntimeConfig();
const baseUrl = String(config.public.apiBaseUrl);

const relationStates = ref<RelationState[]>([]);
const error = ref<string | null>(null);
const linking = ref<string | null>(null);
const unlinking = ref<string | null>(null);

function otherEntityId(relation: RelationDefinition): string {
  return relation.sourceEntityId === props.entityId ? relation.targetEntityId : relation.sourceEntityId;
}

function entityLabel(entityId: string): string {
  const entity = props.entities.find((candidate) => candidate.id === entityId);
  return entity?.label || entity?.name || entityId;
}

function relationTitle(state: RelationState): string {
  return state.isSource
    ? (state.relation.reverseName || state.relation.name)
    : state.relation.name;
}

function directionLabel(state: RelationState): string {
  return state.isSource
    ? `→ ${entityLabel(state.otherEntityId)}`
    : `← ${entityLabel(state.otherEntityId)}`;
}

function linkLabel(state: RelationState, record: RuntimeRecord): string {
  const label = firstTextValue(record);
  return label !== '' ? `${label} (${record.id})` : record.id;
}

function firstTextValue(record: RuntimeRecord): string {
  for (const value of Object.values(record.data)) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function buildStates(): RelationState[] {
  return props.relations.map((relation) => ({
    relation,
    isSource: relation.sourceEntityId === props.entityId,
    otherEntityId: otherEntityId(relation),
    links: [],
    candidates: [],
    selectedId: '',
  }));
}

async function loadAll() {
  error.value = null;
  const states = buildStates();
  await Promise.all(states.map((state) => loadRelation(state)));
  relationStates.value = states;
}

async function loadRelation(state: RelationState) {
  try {
    state.links = await listRelationLinks(fetch, baseUrl, props.moduleId, props.entityId, props.recordId, state.relation.id);
  } catch (caught) {
    setError(caught);
  }
  if (state.isSource) {
    try {
      const result = await listRecords(fetch, baseUrl, props.moduleId, state.otherEntityId, { limit: 100 });
      const linkedIds = new Set(state.links.map((link) => link.id));
      state.candidates = result.items
        .filter((record) => !linkedIds.has(record.id))
        .map((record) => ({ id: record.id, label: firstTextValue(record) || record.id }));
    } catch (caught) {
      setError(caught);
    }
  }
}

function setError(caught: unknown) {
  if (error.value) return;
  if (caught instanceof Response) {
    error.value = 'Request failed.';
    return;
  }
  if (caught && typeof caught === 'object' && 'message' in caught) {
    error.value = String((caught as { message: unknown }).message);
    return;
  }
  error.value = 'Something went wrong. Try again.';
}

async function link(state: RelationState) {
  if (!state.selectedId) return;
  linking.value = state.relation.id;
  error.value = null;
  try {
    const response = await createRelationLink(fetch, baseUrl, props.moduleId, props.entityId, props.recordId, state.relation.id, state.selectedId);
    if (!response.ok) {
      error.value = (await apiErrorFromResponse(response)).message;
      return;
    }
    state.selectedId = '';
    await loadRelation(state);
  } catch (caught) {
    setError(caught);
  } finally {
    linking.value = null;
  }
}

async function unlink(state: RelationState, record: RuntimeRecord) {
  unlinking.value = `${state.relation.id}:${record.id}`;
  error.value = null;
  try {
    const response = await deleteRelationLink(fetch, baseUrl, props.moduleId, props.entityId, props.recordId, state.relation.id, record.id);
    if (!response.ok) {
      error.value = (await apiErrorFromResponse(response)).message;
      return;
    }
    await loadRelation(state);
  } catch (caught) {
    setError(caught);
  } finally {
    unlinking.value = null;
  }
}

onMounted(loadAll);
watch(() => [props.entityId, props.recordId] as const, loadAll);
</script>
