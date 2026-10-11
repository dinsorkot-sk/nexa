<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div class="grid gap-4 md:grid-cols-2">
      <div><UiLabel for="field-id">ID</UiLabel><UiInput id="field-id" v-model="form.id" required /></div>
      <div><UiLabel for="field-name">Name</UiLabel><UiInput id="field-name" v-model="form.name" required /></div>
      <div><UiLabel for="field-label">Label</UiLabel><UiInput id="field-label" v-model="form.label" required /></div>
      <div><UiLabel for="field-type">Type</UiLabel><UiSelect id="field-type" v-model="form.type"><option v-for="type in fieldTypes" :key="type" :value="type">{{ type }}</option></UiSelect></div>
    </div>
    <div v-if="form.type === 'select' || form.type === 'multiSelect'"><UiLabel for="field-choices">Choices</UiLabel><UiInput id="field-choices" v-model="choicesText" placeholder="value:Label, another:Another" /><p class="mt-1 text-xs text-slate-500">Comma-separated value:label pairs.</p></div>
    <div v-if="form.type === 'computed' || form.type === 'formula'"><UiLabel for="field-expression">Expression</UiLabel><UiTextarea id="field-expression" v-model="expression" rows="3" required /></div>
    <div class="flex flex-wrap gap-4 text-sm text-slate-300"><label><input v-model="form.required" type="checkbox" class="mr-2">Required</label><label><input v-model="form.unique" type="checkbox" class="mr-2">Unique</label><label><input v-model="form.searchable" type="checkbox" class="mr-2">Searchable</label></div>
    <BuilderError :error="error" />
    <UiButton type="submit" :loading="busy">Add field</UiButton>
  </form>
</template>

<script setup lang="ts">
import type { FieldDefinition, FieldType } from '@nexa/meta';
import { fieldCreateInput } from '../utils/module-builder';
import { requestData } from '../utils/requests';
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
const props = defineProps<{ moduleId: string; entityId: string }>();
const emit = defineEmits<{ saved: [field: FieldDefinition] }>();
const api = useApiClient();
const fieldTypes: FieldType[] = ['text', 'longText', 'number', 'integer', 'decimal', 'currency', 'percentage', 'boolean', 'date', 'datetime', 'time', 'select', 'multiSelect', 'email', 'phone', 'url', 'json', 'file', 'image', 'reference', 'computed', 'formula'];
const form = reactive({ id: '', name: '', label: '', type: 'text' as FieldType, required: false, unique: false, searchable: false });
const choicesText = ref('');
const expression = ref('');
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const choices = choicesText.value.split(',').map((choice) => choice.trim()).filter(Boolean).map((choice) => { const [value = '', ...label] = choice.split(':'); return { value: value.trim(), label: label.join(':').trim() || value.trim() }; });
    const options = { required: form.required, unique: form.unique, searchable: form.searchable, ...(choices.length ? { choices } : {}), ...(expression.value ? { expression: expression.value } : {}) };
    const input = fieldCreateInput({ id: form.id, name: form.name, label: form.label, type: form.type, options });
    const field = await requestData<FieldDefinition>(api.modules[':moduleId'].entities[':entityId'].fields.$post({ param: { moduleId: props.moduleId, entityId: props.entityId }, json: input }));
    Object.assign(form, { id: '', name: '', label: '', type: 'text', required: false, unique: false, searchable: false });
    choicesText.value = '';
    expression.value = '';
    emit('saved', field);
  } catch (caught) { error.value = normalizeApiError(caught); }
  finally { busy.value = false; }
}
</script>
