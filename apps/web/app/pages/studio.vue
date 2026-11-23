<script setup lang="ts">
defineOptions({ name: 'StudioPage' })

import { z } from 'zod'
import type { ViewNode } from '~/utils/engine'

const engine = useEngine()
type StudioFieldType = 'char' | 'text' | 'integer' | 'float' | 'boolean' | 'date' | 'datetime' | 'selection' | 'json' | 'many2one' | 'many2many'
const modelSchema = z.object({
  name: z.string().trim().regex(/^x_[a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'Use a name such as x_project.task.'),
  description: z.string().trim().max(200).optional(),
})
const fieldSchema = z.object({
  model: z.string().min(1, 'Choose a model.'),
  name: z.string().trim().regex(/^x_[a-z0-9_]+$/, 'Field names must start with x_.'),
  type: z.enum(['char', 'text', 'integer', 'float', 'boolean', 'date', 'datetime', 'selection', 'json', 'many2one', 'many2many']),
  label: z.string().trim().max(120).optional(),
  required: z.boolean().optional(),
  comodel: z.string().optional(),
  choices: z.string().optional(),
})
const modelState = reactive({ name: '', description: '' })
const fieldState = reactive<{ model: string; name: string; type: StudioFieldType; label: string; required: boolean; comodel: string; choices: string }>({ model: '', name: '', type: 'char', label: '', required: false, comodel: '', choices: '' })
const viewState = reactive({ model: '', name: '', type: 'list' as 'list' | 'form' | 'search', fields: [] as string[] })
const models = ref<Awaited<ReturnType<typeof engine.studioModels>>['models']>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const forbidden = ref(false)
const types = ['char', 'text', 'integer', 'float', 'boolean', 'date', 'datetime', 'selection', 'json', 'many2one', 'many2many']
const modelItems = computed(() => models.value.map(m => ({ label: m.description ? `${m.description} (${m.name})` : m.name, value: m.name })))
const selected = computed(() => models.value.find(m => m.name === viewState.model))
const fieldItems = computed(() => (selected.value?.fields ?? []).map(f => ({ label: f.string, value: f.name })))

async function refresh() {
  loading.value = true
  error.value = ''
  forbidden.value = false
  try {
    models.value = (await engine.studioModels()).models
    if (!fieldState.model && models.value.length) fieldState.model = models.value[0]!.name
    if (!viewState.model && models.value.length) viewState.model = models.value[0]!.name
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load Studio metadata.'
    forbidden.value = (e as { forbidden?: boolean }).forbidden === true
  } finally {
    loading.value = false
  }
}
onMounted(refresh)
watch(() => viewState.model, () => { viewState.fields = [] })

async function submit(task: () => Promise<unknown>, message: string) {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await task()
    notice.value = message
    await refresh()
    return true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save. Your entries are still here.'
    return false
  } finally {
    busy.value = false
  }
}
async function createModel(event: { data: z.output<typeof modelSchema> }) {
  const result = await submit(() => engine.studioCreateModel(event.data), 'Model created. It is available under Settings.')
  if (result) {
    await refreshNuxtData('menus')
    await navigateTo(`/a/studio.action_${event.data.name}`)
  }
}
async function createField(event: { data: z.output<typeof fieldSchema> }) {
  const selection = event.data.type === 'selection'
    ? event.data.choices?.split('\n').map(line => line.split('=').map(value => value.trim())).filter(pair => pair.length === 2 && pair.every(Boolean))
    : undefined
  await submit(() => engine.studioCreateField({
    ...event.data,
    ...(event.data.required ? { required: true } : {}),
    ...(selection?.length ? { selection } : {}),
  }), 'Field added. The model schema has been updated.')
}
async function createView() {
  const type = viewState.type
  const children: ViewNode[] = viewState.fields.map(name => ({ tag: 'field', attrs: { name } }))
  const arch: ViewNode = { tag: type, children }
  await submit(() => engine.studioCreateView({ model: viewState.model, name: viewState.name, type, arch }), 'View saved.')
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-highlighted">Studio</h1>
      <p class="mt-1 text-sm text-muted">Create custom models, fields, and views for this tenant.</p>
    </header>

    <UAlert v-if="error" color="error" variant="subtle" :title="forbidden ? 'Administrator access required' : 'Studio could not complete that request'" :description="error" role="alert" :actions="forbidden ? [] : [{ label: 'Retry', onClick: refresh }]" />
    <UAlert v-if="notice" color="success" variant="subtle" title="Saved" :description="notice" role="status" />
    <UCard v-if="loading"><USkeleton class="h-6 w-1/3" /><USkeleton class="mt-4 h-24 w-full" /></UCard>
    <template v-else-if="!forbidden">
      <UCard>
        <template #header><h2 class="font-semibold">Create a model</h2></template>
        <NexaForm :schema="modelSchema" :state="modelState" :disabled="busy" @submit="createModel">
          <UFormField label="Model name" name="name" required help="Use lowercase letters and start with x_, for example x_project.task.">
            <UInput v-model="modelState.name" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField label="Display name" name="description"><UInput v-model="modelState.description" class="w-full" /></UFormField>
          <UButton type="submit" label="Create model" :loading="busy" />
        </NexaForm>
      </UCard>

      <UCard>
        <template #header><h2 class="font-semibold">Add a field</h2></template>
        <NexaForm :schema="fieldSchema" :state="fieldState" :disabled="busy || !models.length" @submit="createField">
          <UFormField label="Model" name="model" required><USelect v-model="fieldState.model" :items="modelItems" class="w-full" /></UFormField>
          <UFormField label="Field name" name="name" required help="Field names start with x_."><UInput v-model="fieldState.name" class="w-full" /></UFormField>
          <UFormField label="Type" name="type" required><USelect v-model="fieldState.type" :items="types" class="w-full" /></UFormField>
          <UFormField label="Display label" name="label"><UInput v-model="fieldState.label" class="w-full" /></UFormField>
          <UFormField v-if="fieldState.type === 'selection'" label="Choices" name="choices" required help="Enter one value=label pair per line."><UTextarea v-model="fieldState.choices" class="w-full" /></UFormField>
          <UFormField v-if="['many2one', 'many2many'].includes(fieldState.type)" label="Related model" name="comodel" required><USelect v-model="fieldState.comodel" :items="modelItems" class="w-full" /></UFormField>
          <UCheckbox v-model="fieldState.required" label="Required" />
          <UButton type="submit" label="Add field" :loading="busy" :disabled="!models.length" />
        </NexaForm>
      </UCard>

      <UCard>
        <template #header><h2 class="font-semibold">Create a view</h2></template>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Model" required><USelect v-model="viewState.model" :items="modelItems" class="w-full" /></UFormField>
          <UFormField label="View name" required help="Use a unique name starting with x_."><UInput v-model="viewState.name" class="w-full" /></UFormField>
          <UFormField label="View type"><USelect v-model="viewState.type" :items="['list', 'form', 'search']" class="w-full" /></UFormField>
          <UFormField label="Fields"><USelect v-model="viewState.fields" :items="fieldItems" multiple class="w-full" /></UFormField>
        </div>
        <UButton class="mt-4" label="Save view" :loading="busy" :disabled="busy || !selected || !viewState.name || !viewState.fields.length" @click="createView" />
      </UCard>
    </template>
  </div>
</template>
