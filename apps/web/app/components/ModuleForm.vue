<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div class="grid gap-4 md:grid-cols-2">
      <div><UiLabel for="module-id">ID</UiLabel><UiInput id="module-id" v-model="form.id" :disabled="Boolean(module)" required /><p class="mt-1 text-xs text-slate-500">Stable identifier used by the API.</p></div>
      <div><UiLabel for="module-name">Name</UiLabel><UiInput id="module-name" v-model="form.name" required /></div>
      <div><UiLabel for="module-version">Version</UiLabel><UiInput id="module-version" v-model="form.version" required /></div>
      <div><UiLabel for="module-icon">Icon</UiLabel><UiInput id="module-icon" v-model="form.icon" placeholder="Optional icon name" /></div>
    </div>
    <div><UiLabel for="module-description">Description</UiLabel><UiTextarea id="module-description" v-model="form.description" rows="4" /></div>
    <BuilderError :error="error" />
    <div class="flex justify-end gap-3"><NuxtLink to="/modules"><UiButton variant="ghost">Cancel</UiButton></NuxtLink><UiButton type="submit" :loading="busy">{{ module ? 'Save changes' : 'Create module' }}</UiButton></div>
  </form>
</template>

<script setup lang="ts">
import type { ModuleDefinition } from '@nexa/meta';
import { moduleCreateInput, moduleUpdateInput } from '../utils/module-builder';
import { normalizeApiError, type NormalizedApiError } from '../utils/api-error';
import { requestData } from '../utils/requests';

type FormState = { id: string; name: string; version: string; description: string; icon: string };
const props = defineProps<{ module?: ModuleDefinition }>();
const emit = defineEmits<{ saved: [module: ModuleDefinition] }>();
const api = useApiClient();
const { principal } = useAuth();
const form = reactive<FormState>({ id: props.module?.id ?? '', name: props.module?.name ?? '', version: props.module?.version ?? '0.1.0', description: props.module?.description ?? '', icon: props.module?.icon ?? '' });
const busy = ref(false);
const error = ref<NormalizedApiError | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const data = props.module
      ? moduleUpdateInput({ name: form.name, version: form.version, description: form.description, icon: form.icon || null })
      : moduleCreateInput({ id: form.id, name: form.name, version: form.version, description: form.description, ...(form.icon ? { icon: form.icon } : {}) }, principal.value!.userId);
    const saved = props.module
      ? await requestData<ModuleDefinition>(api.modules[':id'].$patch({ param: { id: props.module.id }, json: data }))
      : await requestData<ModuleDefinition>(api.modules.$post({ json: data }));
    emit('saved', saved);
  } catch (caught) {
    error.value = normalizeApiError(caught);
  } finally {
    busy.value = false;
  }
}
</script>
