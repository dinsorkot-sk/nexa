<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div class="grid gap-4 md:grid-cols-2">
      <div><UiLabel for="entity-id">ID</UiLabel><UiInput id="entity-id" v-model="form.id" required /></div>
      <div><UiLabel for="entity-name">Name</UiLabel><UiInput id="entity-name" v-model="form.name" required /></div>
      <div><UiLabel for="entity-label">Singular label</UiLabel><UiInput id="entity-label" v-model="form.label" required /></div>
      <div><UiLabel for="entity-plural">Plural label</UiLabel><UiInput id="entity-plural" v-model="form.pluralLabel" required /></div>
    </div>
    <div><UiLabel for="entity-description">Description</UiLabel><UiTextarea id="entity-description" v-model="form.description" rows="3" /></div>
    <BuilderError :error="error" />
    <UiButton type="submit" :loading="busy">Add entity</UiButton>
  </form>
</template>

<script setup lang="ts">
import type { EntityDefinition } from '@nexa/meta';
import { entityCreateInput } from '../utils/module-builder';
import { requestData } from '../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
const props = defineProps<{ moduleId: string }>();
const emit = defineEmits<{ saved: [entity: EntityDefinition] }>();
const api = useApiClient();
const form = reactive({ id: '', name: '', label: '', pluralLabel: '', description: '' });
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const input = entityCreateInput(form);
    const entity = await requestData<EntityDefinition>(api.modules[':moduleId'].entities.$post({ param: { moduleId: props.moduleId }, json: input }));
    Object.assign(form, { id: '', name: '', label: '', pluralLabel: '', description: '' });
    emit('saved', entity);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { busy.value = false; }
}
</script>
