<script setup lang="ts">
import { archFieldNames, changedValues, emptyValue, missingRequired, relationalIds, fieldFromError } from '~/utils/engine'
import type { ActionInfo, RecordValues, ResolvedView } from '~/utils/engine'

defineOptions({ name: 'RecordFormPage' })

const ONCHANGE_DELAY = 400

const route = useRoute()
const engine = useEngine()
const toast = useToast()

const actionId = computed(() => String(route.params.action))
const isNew = computed(() => route.params.id === 'new')
const recordId = computed(() => (isNew.value ? null : Number(route.params.id)))

const action = ref<ActionInfo | null>(null)
const view = ref<ResolvedView | null>(null)
const values = reactive<RecordValues>({})
const original = ref<RecordValues>({})
const names = ref(new Map<string, Map<number, string>>())
const loading = ref(true)
const saving = ref(false)
const loadError = ref<Error | null>(null)
const saveError = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})
const confirmDelete = ref(false)
const deleting = ref(false)
const heading = ref<HTMLElement | null>(null)
const errorBox = ref<HTMLElement | null>(null)

const model = computed(() => action.value?.model ?? '')
const dirty = computed(() => !!view.value && Object.keys(changedValues(view.value.fields, original.value, values)).length > 0)
// the saved name, not the one being typed
const title = computed(() => (isNew.value ? 'New' : String(original.value.name ?? `#${String(recordId.value)}`)))

function setValues(rec: RecordValues) {
  for (const k of Object.keys(values)) delete values[k]
  Object.assign(values, rec)
}

async function load() {
  loading.value = true
  loadError.value = null
  saveError.value = null
  fieldErrors.value = {}
  try {
    action.value = await engine.action(actionId.value)
    view.value = await engine.view(model.value, 'form')
    const fields = archFieldNames(view.value.arch)
    let rec: RecordValues = {}
    if (recordId.value !== null) {
      if (!Number.isInteger(recordId.value) || recordId.value <= 0) throw new ApiError(404, 'missing', 'This record does not exist.')
      ;[rec] = (await engine.read(model.value, [recordId.value], fields)).records as [RecordValues]
    } else {
      for (const f of fields) rec[f] = emptyValue(view.value.fields[f]!)
    }
    setValues(rec)
    original.value = { ...rec }
    await loadNames()
  } catch (e) {
    loadError.value = e as Error
  } finally {
    loading.value = false
  }
  await nextTick()
  heading.value?.focus()
}

async function loadNames() {
  if (!view.value) return
  const map = new Map<string, Map<number, string>>()
  for (const [m, ids] of relationalIds(view.value.fields, [values])) map.set(m, await engine.displayNames(m, [...ids]))
  names.value = map
}

// ---- onchange: debounced, only the latest response applies, never over newer user input ----
let onchangeTimer: ReturnType<typeof setTimeout> | undefined
let onchangeSeq = 0
function onFieldChange(field: string) {
  if (fieldErrors.value[field]) {
    fieldErrors.value = Object.fromEntries(Object.entries(fieldErrors.value).filter(([k]) => k !== field))
  }
  clearTimeout(onchangeTimer)
  onchangeTimer = setTimeout(() => runOnchange(field), ONCHANGE_DELAY)
}

async function runOnchange(field: string) {
  if (!view.value) return
  const seq = ++onchangeSeq
  const sent = JSON.parse(JSON.stringify(values)) as RecordValues
  try {
    const { value } = await engine.onchange(model.value, sent, field)
    if (seq !== onchangeSeq) return
    for (const [k, v] of Object.entries(value)) {
      if (!(k in view.value.fields)) continue
      // the user changed this field after the request: keep their input
      if (JSON.stringify(values[k]) !== JSON.stringify(sent[k])) continue
      values[k] = v
    }
  } catch {
    // onchange is advisory; saving still validates on the server
  }
}

async function showErrors(message: string | null) {
  saveError.value = message
  await nextTick()
  const first = Object.keys(fieldErrors.value)[0]
  const el = first ? document.querySelector<HTMLElement>(`[data-field="${first}"] :is(input, textarea, button, [tabindex])`) : null
  ;(el ?? errorBox.value)?.focus()
}

async function save() {
  if (!view.value) return
  clearTimeout(onchangeTimer)
  fieldErrors.value = {}
  const missing = missingRequired(view.value.fields, values)
  if (missing.length) {
    fieldErrors.value = Object.fromEntries(missing.map((n) => [n, 'This field is required.']))
    return showErrors(missing.length === 1 ? 'Fill in the required field.' : `Fill in the ${missing.length} required fields.`)
  }
  saving.value = true
  saveError.value = null
  const vals = changedValues(view.value.fields, isNew.value ? {} : original.value, values)
  try {
    if (isNew.value) {
      const { ids } = await engine.create(model.value, vals)
      original.value = { ...values } // not dirty any more: leaving must not prompt
      toast.add({ title: 'Record created', color: 'success' })
      await navigateTo(`/a/${actionId.value}/${String(ids[0])}`, { replace: true })
    } else {
      if (Object.keys(vals).length) await engine.write(model.value, [recordId.value!], vals)
      toast.add({ title: 'Changes saved', color: 'success' })
      await load()
    }
  } catch (e) {
    // keep what the user typed; point at the field when the server names it
    const message = (e as Error).message
    const field = fieldFromError(view.value.fields, message)
    if (field) fieldErrors.value = { [field]: message }
    await showErrors(message)
  } finally {
    saving.value = false
  }
}

function discard() {
  setValues({ ...original.value })
  saveError.value = null
  fieldErrors.value = {}
}

async function remove() {
  deleting.value = true
  try {
    await engine.unlink(model.value, [recordId.value!])
    original.value = { ...values } // deleted: nothing left to lose
    toast.add({ title: 'Record deleted', color: 'success' })
    confirmDelete.value = false
    await navigateTo(`/a/${actionId.value}`)
  } catch (e) {
    confirmDelete.value = false
    await showErrors((e as Error).message)
  } finally {
    deleting.value = false
  }
}

const guard = () => (dirty.value && !saving.value ? window.confirm('Discard unsaved changes?') : true)
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
watch(() => route.fullPath, load, { immediate: true })
onBeforeUnmount(() => clearTimeout(onchangeTimer))
useHead(() => ({ title: `${title.value} · ${action.value?.name ?? 'Nexa'}` }))
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <nav aria-label="Breadcrumb" class="text-sm text-muted">
      <ULink :to="`/a/${actionId}`" class="hover:underline">{{ action?.name ?? 'Back' }}</ULink>
      <span aria-hidden="true"> / </span>
      <span aria-current="page">{{ title }}</span>
    </nav>

    <USkeleton v-if="loading" class="h-64 w-full" />

    <UAlert
      v-else-if="loadError"
      :color="loadError instanceof ApiError && loadError.forbidden ? 'warning' : 'error'"
      variant="subtle"
      :title="loadError instanceof ApiError && loadError.forbidden ? 'You do not have access to this record' : 'Could not open the record'"
      :description="loadError.message"
      :actions="[{ label: 'Retry', onClick: load }, { label: 'Back to list', to: `/a/${actionId}` }]"
      role="alert"
    />

    <form v-else-if="view" class="space-y-6" novalidate @submit.prevent="save">
      <div class="flex flex-wrap items-center gap-2">
        <h1 ref="heading" tabindex="-1" class="me-auto text-2xl font-semibold text-highlighted outline-none">{{ title }}</h1>
        <UButton type="submit" :label="isNew ? 'Create' : 'Save'" :loading="saving" :disabled="!isNew && !dirty" />
        <UButton v-if="dirty" label="Discard" color="neutral" variant="outline" :disabled="saving" @click="discard" />
        <UButton v-if="!isNew" label="Delete" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmDelete = true" />
      </div>

      <div ref="errorBox" tabindex="-1" class="outline-none">
        <UAlert v-if="saveError" color="error" variant="subtle" title="Could not save" :description="saveError" role="alert" />
      </div>

      <EngineArchNode
        :node="view.arch"
        :fields="view.fields"
        :values="values"
        :disabled="saving"
        :names="names"
        :errors="fieldErrors"
        @change="onFieldChange"
      />
    </form>

    <NexaDialog v-model:open="confirmDelete" title="Delete this record?" description="This cannot be undone.">
      <template #footer="{ close }">
        <UButton label="Cancel" color="neutral" variant="outline" @click="close" />
        <UButton label="Delete" color="error" :loading="deleting" @click="remove" />
      </template>
    </NexaDialog>
  </div>
</template>
