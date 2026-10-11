<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div class="grid gap-4 md:grid-cols-2">
      <div><UiLabel for="relation-id">ID</UiLabel><UiInput id="relation-id" v-model="form.id" required /></div>
      <div><UiLabel for="relation-name">Name</UiLabel><UiInput id="relation-name" v-model="form.name" required /></div>
      <div><UiLabel for="relation-source">Source entity</UiLabel><UiSelect id="relation-source" v-model="form.sourceEntityId"><option value="" disabled>Select entity</option><option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.label }}</option></UiSelect></div>
      <div><UiLabel for="relation-target">Target entity</UiLabel><UiSelect id="relation-target" v-model="form.targetEntityId"><option value="" disabled>Select entity</option><option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.label }}</option></UiSelect></div>
      <div><UiLabel for="relation-type">Cardinality</UiLabel><UiSelect id="relation-type" v-model="form.type"><option value="oneToOne">One to one</option><option value="oneToMany">One to many</option><option value="manyToOne">Many to one</option><option value="manyToMany">Many to many</option></UiSelect></div>
      <div><UiLabel for="relation-delete">On delete</UiLabel><UiSelect id="relation-delete" v-model="form.onDelete"><option value="restrict">Restrict</option><option value="cascade">Cascade</option></UiSelect></div>
    </div>
    <div><UiLabel for="relation-reverse">Reverse name</UiLabel><UiInput id="relation-reverse" v-model="form.reverseName" /></div>
    <BuilderError :error="error" />
    <UiButton type="submit" :loading="busy" :disabled="entities.length < 2">Add relation</UiButton>
  </form>
</template>

<script setup lang="ts">
import type { EntityDefinition, RelationDefinition, RelationType } from '@nexa/meta';
import { relationCreateInput } from '../utils/module-builder';
import { requestData } from '../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
const props = defineProps<{ moduleId: string; entities: EntityDefinition[] }>();
const emit = defineEmits<{ saved: [relation: RelationDefinition] }>();
const api = useApiClient();
const form = reactive({ id: '', name: '', sourceEntityId: '', targetEntityId: '', type: 'oneToMany' as RelationType, onDelete: 'restrict' as 'cascade' | 'restrict', reverseName: '' });
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const input = relationCreateInput({ id: form.id, name: form.name, sourceEntityId: form.sourceEntityId, targetEntityId: form.targetEntityId, type: form.type, onDelete: form.onDelete, ...(form.reverseName ? { reverseName: form.reverseName } : {}) });
    const relation = await requestData<RelationDefinition>(api.modules[':moduleId'].relations.$post({ param: { moduleId: props.moduleId }, json: input }));
    Object.assign(form, { id: '', name: '', sourceEntityId: '', targetEntityId: '', type: 'oneToMany', onDelete: 'restrict', reverseName: '' });
    emit('saved', relation);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { busy.value = false; }
}
</script>
